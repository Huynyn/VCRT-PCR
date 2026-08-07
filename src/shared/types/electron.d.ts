/**
 * Type definitions for Electron API exposed to renderer process
 */

export interface ElectronAPI {
  /**
   * Get the backend server port
   */
  getServerPort: () => Promise<number>;

  /**
   * Get the application data path
   */
  getDataPath: () => Promise<string>;

  /**
   * Get the application version
   */
  getVersion: () => Promise<string>;

  /**
   * Save a file using native dialog
   */
  saveFile: (data: {
    content: string;
    defaultName: string;
  }) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  } | null>;

  /**
   * Open a file using native dialog
   */
  openFile: () => Promise<{
    success: boolean;
    content?: string;
    path?: string;
    error?: string;
  } | null>;

  /**
   * Print a PCR report
   */
  printPCR: (pcrId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;

  /**
   * Fires when the user tries to close the window - a chance to prompt to
   * save an in-progress PCR draft before confirming the close. Returns an
   * unsubscribe function.
   */
  onCloseRequested: (callback: () => void) => () => void;

  /**
   * Answer to onCloseRequested: true to actually close the window now,
   * false to cancel the close entirely.
   */
  confirmClose: (shouldClose: boolean) => void;

  /**
   * Window controls
   */
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  /**
   * Check if running in Electron
   */
  isElectron: boolean;
}

/**
 * Augment the global Window interface to include Electron API
 */
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    isElectron?: boolean;
  }
}

export {};
