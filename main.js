// Aether Electron Main Process Wrapper
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let gotTheLock = false;

// Request single instance lock
gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // We are a secondary instance. Assign an isolated user data directory to prevent Chromium SQLite locks.
  const mainUserDataPath = app.getPath('userData');
  const secondarySessionId = 'session-' + Math.random().toString(36).substring(2, 9);
  const secondaryUserDataPath = path.join(mainUserDataPath, 'sessions', secondarySessionId);
  app.setPath('userData', secondaryUserDataPath);
} else {
  // We are the primary instance. Clean up previous secondary session directories on startup.
  const mainUserDataPath = app.getPath('userData');
  const sessionsDir = path.join(mainUserDataPath, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      const folders = fs.readdirSync(sessionsDir);
      folders.forEach(folder => {
        const folderPath = path.join(sessionsDir, folder);
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch (err) {
          // Folder is locked/active, ignore
        }
      });
    } catch (err) {
      console.error('Failed to clean up secondary sessions:', err);
    }
  }
}

// Helper to get the main user data directory (even when running in a secondary session path)
function getMainUserDataPath() {
  const currentPath = app.getPath('userData');
  const normalized = currentPath.replace(/\\/g, '/');
  if (normalized.includes('/sessions/session-')) {
    // Navigate up two levels to get the root userData path
    return path.dirname(path.dirname(currentPath));
  }
  return currentPath;
}

let mainWindow = null;
let currentWorkspacePath = ''; // Track selected workspace directory

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    title: 'Aether - Liquid Glass Markdown Editor',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Hide default Chromium top-menu dropdown bar
  mainWindow.setMenuBarVisibility(false);

  // Load the web app index entry point
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Pipe console logs from renderer process to main process terminal stdout
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] (${path.basename(sourceId)}:${line}) ${message}`);
  });

  // Open Chromium DevTools for debugging (only in development)
  if (!app.isPackaged && process.env.NODE_ENV !== 'production' && !process.argv.includes('--no-devtools')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Security: Prevent traversal paths inside the workspace
function resolveFullPath(workspacePath, relPath, name = '') {
  if (!workspacePath) return '';
  const cleanRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const cleanName = name ? path.basename(name) : '';
  return path.join(workspacePath, cleanRel, cleanName);
}

// VFS IPC Bindings
app.whenReady().then(() => {
  createWindow();

  // 0. Get Application Version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // 0b. Get whether this is the primary session
  ipcMain.handle('is-primary-session', () => {
    return gotTheLock;
  });

  // 0c. Get shared settings from disk
  ipcMain.handle('get-shared-settings', () => {
    const settingsPath = path.join(getMainUserDataPath(), 'shared-settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read shared settings:', e);
      }
    }
    return null;
  });

  // 0d. Save shared settings to disk (merges existing options to preserve primary session)
  ipcMain.handle('save-shared-settings', (event, settings) => {
    const settingsPath = path.join(getMainUserDataPath(), 'shared-settings.json');
    let existing = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {
        console.error('Failed to read shared settings for merge:', e);
      }
    }
    const merged = { ...existing, ...settings };
    if (!settings.primarySession && existing.primarySession) {
      merged.primarySession = existing.primarySession;
    }
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  });

  // 1. Open Directory Dialog Selector
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Aether Workspace Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // 1b. Get Default Workspace Path
  ipcMain.handle('get-default-workspace', () => {
    const defaultPath = path.join(app.getPath('documents'), 'AetherWorkspace');
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }
    return defaultPath;
  });

  // 2. Read VFS Folder Node Array from Directory
  ipcMain.handle('read-directory', async (event, dirPath) => {
    currentWorkspacePath = dirPath;
    const list = [];

    function walk(currentDir, relativePath) {
      if (!fs.existsSync(currentDir)) return;
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      
      items.forEach(item => {
        const itemFullPath = path.join(currentDir, item.name);
        const itemRelPath = relativePath === '/' ? '/' + item.name : relativePath + '/' + item.name;
        
        const relFilePath = relativePath === '/' ? '/' + item.name : relativePath + '/' + item.name;
        const b64Key = Buffer.from(relFilePath, 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        if (item.isDirectory()) {
          // Folder node
          list.push({
            id: 'dir_' + b64Key,
            name: item.name,
            path: relativePath,
            isFolder: true,
            updatedAt: fs.statSync(itemFullPath).mtime.toISOString()
          });
          walk(itemFullPath, itemRelPath);
        } else if (item.isFile() && item.name.endsWith('.md')) {
          // File node
          list.push({
            id: 'file_' + b64Key,
            name: item.name,
            content: fs.readFileSync(itemFullPath, 'utf8'),
            path: relativePath,
            isFolder: false,
            updatedAt: fs.statSync(itemFullPath).mtime.toISOString()
          });
        }
      });
    }

    if (fs.existsSync(dirPath)) {
      walk(dirPath, '/');
    }
    return list;
  });

  // 3. Write Markdown File to Disk
  ipcMain.handle('save-file', async (event, relativePath, name, content) => {
    const fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    if (!fullPath) return false;
    
    // Ensure parent folders exist
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return true;
  });

  // 4. Create Virtual Folder on Disk
  ipcMain.handle('create-folder', async (event, relativePath, name) => {
    const fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    if (!fullPath) return false;
    
    fs.mkdirSync(fullPath, { recursive: true });
    return true;
  });

  // 5. Delete File/Folder from Disk
  ipcMain.handle('delete-path', async (event, relativePath, name, isFolder) => {
    const fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    if (!fullPath || !fs.existsSync(fullPath)) return false;
    
    if (isFolder) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    return true;
  });

  // 6. Rename Path on Disk
  ipcMain.handle('rename-path', async (event, relativePath, oldName, newName, isFolder) => {
    const oldPath = resolveFullPath(currentWorkspacePath, relativePath, oldName);
    const newPath = resolveFullPath(currentWorkspacePath, relativePath, newName);
    if (!oldPath || !newPath || !fs.existsSync(oldPath)) return false;
    
    fs.renameSync(oldPath, newPath);
    return true;
  });

  // 7. Show Item in Windows Explorer Shell
  ipcMain.handle('open-in-explorer', async (event, relativePath, name) => {
    const fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    if (!fullPath) return false;
    
    if (fs.existsSync(fullPath)) {
      if (fs.statSync(fullPath).isDirectory()) {
        shell.openPath(fullPath);
      } else {
        shell.showItemInFolder(fullPath);
      }
    } else {
      // Fallback: open parent workspace dir
      const parent = path.dirname(fullPath);
      if (fs.existsSync(parent)) {
        shell.openPath(parent);
      }
    }
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
