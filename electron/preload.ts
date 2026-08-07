import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron API exposed to the renderer process
 * This is the secure bridge between the renderer and main process
 */
const electronAPI = {
  /**
   * Get the backend server port
   */
  getServerPort: (): Promise<number> => {
    return ipcRenderer.invoke('get-server-port');
  },

  /**
   * Get the application data path
   */
  getDataPath: (): Promise<string> => {
    return ipcRenderer.invoke('get-data-path');
  },

  /**
   * Get the application version
   */
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-version');
  },

  /**
   * Save a file using native dialog
   */
  saveFile: (data: { content: string; defaultName: string }): Promise<{ success: boolean; path?: string; error?: string } | null> => {
    return ipcRenderer.invoke('save-file', data);
  },

  /**
   * Open a file using native dialog
   */
  openFile: (): Promise<{ success: boolean; content?: string; path?: string; error?: string } | null> => {
    return ipcRenderer.invoke('open-file');
  },

  /**
   * Print a PCR report
   */
  printPCR: (pcrId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('print-pcr', pcrId);
  },

  /**
   * Fires when the user tries to close the window. The renderer gets a
   * chance to prompt to save an in-progress PCR draft (and log the session
   * out) before confirming the close via confirmClose(). Returns an
   * unsubscribe function.
   */
  onCloseRequested: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('app-close-requested', listener);
    return () => ipcRenderer.removeListener('app-close-requested', listener);
  },

  /**
   * Answer to onCloseRequested: true to actually close the window now,
   * false to cancel the close entirely.
   */
  confirmClose: (shouldClose: boolean): void => {
    ipcRenderer.send('confirm-close', shouldClose);
  },

  /**
   * Window controls
   */
  minimizeWindow: (): void => {
    ipcRenderer.send('minimize-window');
  },

  maximizeWindow: (): void => {
    ipcRenderer.send('maximize-window');
  },

  closeWindow: (): void => {
    ipcRenderer.send('close-window');
  },

  /**
   * Check if running in Electron
   */
  isElectron: true,
};

// Type definition for the exposed API
export type ElectronAPI = typeof electronAPI;

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Also expose a simple flag to detect Electron environment
contextBridge.exposeInMainWorld('isElectron', true);
