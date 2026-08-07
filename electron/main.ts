import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import * as fs from 'fs';

// Environment detection
const isDev = process.env.NODE_ENV === 'development';

// Only one instance of the app (and its embedded backend + DB connection)
// should ever run at once - a second launch would duplicate the full
// Electron/Node memory footprint and risk two processes writing to the same
// encrypted database file. Bail out of the second launch immediately and
// just focus the already-running window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Debug logging to file (for Windows debugging)
const logFile = path.join(app.getPath('userData'), 'debug.log');
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {
    // Ignore write errors
  }
}

// Clear log on startup
try {
  fs.writeFileSync(logFile, `=== PCR Application Started ===\n`);
  log(`Platform: ${process.platform}`);
  log(`Arch: ${process.arch}`);
  log(`Electron: ${process.versions.electron}`);
  log(`Node: ${process.versions.node}`);
  log(`isDev: ${isDev}`);
} catch (e) {
  // Ignore
}

let mainWindow: BrowserWindow | null = null;
let serverPort: number = 0;
let allowClose = false;
let closeConfirmTimer: NodeJS.Timeout | null = null;

// Backend module - will be loaded dynamically
let backendModule: { startEmbeddedServer: (dbPath?: string) => Promise<number>; stopEmbeddedServer: () => void } | null = null;

/**
 * Load and start the backend server embedded in main process
 */
async function startBackend(): Promise<void> {
  log('Starting embedded backend server...');

  // Set environment variables before loading backend
  process.env.IS_ELECTRON = 'true';
  process.env.NODE_ENV = isDev ? 'development' : 'production';
  process.env.DATABASE_PATH = path.join(app.getPath('userData'), 'pcr_database.db');

  log(`Database path: ${process.env.DATABASE_PATH}`);
  log(`User data path: ${app.getPath('userData')}`);

  try {
    // Dynamically load the backend module
    let backendPath: string;

    if (isDev) {
      // In development, use ts-node register
      require('ts-node/register/transpile-only');
      // __dirname is dist/electron/ when running compiled, so go up two levels to project root
      backendPath = path.join(__dirname, '..', '..', 'src', 'backend', 'src', 'index');
      log(`Dev backend path: ${backendPath}`);
    } else {
      // In production, load compiled JS from asar.unpacked
      backendPath = path.join(process.resourcesPath, 'app.asar.unpacked/dist/backend/backend/src/index.js');
      log(`Prod backend path: ${backendPath}`);

      // Check if file exists
      if (!fs.existsSync(backendPath)) {
        throw new Error(`Backend file not found: ${backendPath}`);
      }
    }

    // Load the backend module
    log('Loading backend module...');
    backendModule = require(backendPath);
    log('Backend module loaded');

    // Start the embedded server
    log('Starting embedded server...');
    serverPort = await backendModule!.startEmbeddedServer(process.env.DATABASE_PATH);
    log(`Backend server started on port ${serverPort}`);
  } catch (error) {
    log(`ERROR starting backend: ${(error as Error).message}`);
    log(`Stack: ${(error as Error).stack}`);
    throw error;
  }
}

/**
 * Stop the backend server
 */
function stopBackend(): void {
  if (backendModule) {
    try {
      backendModule.stopEmbeddedServer();
      log('Backend server stopped');
    } catch (e) {
      log(`Error stopping backend: ${(e as Error).message}`);
    }
  }
}

/**
 * Create the main application window
 */
function createWindow(): void {
  log('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Needed for preload to work properly
      webSecurity: true,
      allowRunningInsecureContent: false,
      // This is a data-entry form app, not a document editor - the background
      // spellcheck service (dictionary loading + continuous checking across
      // every text input) costs real memory/CPU for a feature nobody needs here.
      spellcheck: false,
    },
    title: 'PCR Application',
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false, // Don't show until ready
  });

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    log('Window ready to show');
    mainWindow?.show();
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    log('Loading from Vite dev server...');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    const indexPath = path.join(__dirname, '../frontend/index.html');
    log(`Loading from file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log(`Failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Closing the app should count as a session logout, and if a PCR draft is
  // being edited, the renderer should get a chance to offer saving it first.
  // The renderer can't be asked synchronously, so the first close attempt is
  // intercepted and deferred until it replies via 'confirm-close'.
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    log('Close requested - asking renderer to confirm');
    mainWindow?.webContents.send('app-close-requested');

    if (closeConfirmTimer) clearTimeout(closeConfirmTimer);
    closeConfirmTimer = setTimeout(() => {
      // Renderer never responded (frozen page, no listener registered yet,
      // etc.) - don't let that make the app unclosable.
      log('No close confirmation from renderer within timeout - closing anyway');
      allowClose = true;
      mainWindow?.close();
    }, 5000);
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  log('Window created');
}

// IPC Handlers

/**
 * Get the server port for the frontend to connect to
 */
ipcMain.handle('get-server-port', () => {
  return serverPort;
});

/**
 * Renderer's answer to 'app-close-requested': whether it's OK to actually
 * close the window now (e.g. after saving/discarding a PCR draft, or the
 * user cancelling the close entirely).
 */
ipcMain.on('confirm-close', (_event, shouldClose: boolean) => {
  if (closeConfirmTimer) {
    clearTimeout(closeConfirmTimer);
    closeConfirmTimer = null;
  }
  if (shouldClose) {
    allowClose = true;
    mainWindow?.close();
  }
});

/**
 * Get the data path where database is stored
 */
ipcMain.handle('get-data-path', () => {
  return app.getPath('userData');
});

/**
 * Get application version
 */
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

/**
 * Save file dialog
 */
ipcMain.handle('save-file', async (_event, data: { content: string; defaultName: string }) => {
  if (!mainWindow) return null;

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: data.defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, data.content, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  return null;
});

/**
 * Open file dialog
 */
ipcMain.handle('open-file', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      return { success: true, content, path: result.filePaths[0] };
    } catch (error) {
      console.error('Error reading file:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  return null;
});

/**
 * Print PCR
 */
ipcMain.handle('print-pcr', async (_event, _pcrId: string) => {
  if (!mainWindow) return { success: false, error: 'No window available' };

  try {
    await mainWindow.webContents.print({});
    return { success: true };
  } catch (error) {
    console.error('Error printing:', error);
    return { success: false, error: (error as Error).message };
  }
});

/**
 * Window controls
 */
ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow?.close();
});

// App lifecycle events

/**
 * A second launch attempt while we're already running - just focus the
 * existing window instead of letting it start its own backend/window.
 */
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/**
 * App ready - start backend and create window
 */
app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return; // losing instance - already quitting

  log('App ready');

  try {
    await startBackend();
    createWindow();
  } catch (error) {
    const errorMessage = (error as Error).message || 'Unknown error';
    log(`FATAL: Failed to start application: ${errorMessage}`);
    log(`Stack: ${(error as Error).stack}`);

    // Show error dialog to user instead of silent quit
    dialog.showErrorBox(
      'Failed to Start Application',
      `The application failed to start:\n\n${errorMessage}\n\nCheck the log file at:\n${logFile}`
    );

    app.quit();
    return;
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * All windows closed - quit app (except on macOS)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

/**
 * App is quitting - cleanup
 */
app.on('before-quit', () => {
  stopBackend();
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  log(`Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`);
});
