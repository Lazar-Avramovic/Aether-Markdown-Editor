// Aether Electron Main Process Wrapper
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Register custom privileged scheme for loading local images safely
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aether-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

// Helper to extract target file from process arguments (e.g. Windows file association / Open with)
function extractTargetFileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--') || arg.startsWith('-')) continue;
    if (!app.isPackaged && (arg === '.' || path.resolve(arg) === path.resolve(__dirname))) continue;
    try {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return resolved;
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

const initialTargetFile = extractTargetFileFromArgv(process.argv);

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

// Helper to synchronously read shared settings before window creation
function readSharedSettingsSync() {
  try {
    const settingsPath = path.join(getMainUserDataPath(), 'shared-settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read shared settings:', e);
  }
  return null;
}

function getDefaultWorkspaceSync() {
  const defaultPath = path.join(app.getPath('documents'), 'AetherWorkspace');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
}

// Compute complete startup state synchronously before window creation to eliminate IPC round-trip delays and theme flash
function computeInitialStateSync() {
  const sharedSettings = readSharedSettingsSync();
  const defaultWorkspace = getDefaultWorkspaceSync();
  const theme = (sharedSettings && sharedSettings.theme) ? sharedSettings.theme : 'dark';
  const sidebarLayout = (sharedSettings && sharedSettings.sidebarLayout) ? sharedSettings.sidebarLayout : 'stack';
  const layoutMode = (sharedSettings && sharedSettings.layoutMode) ? sharedSettings.layoutMode : 'split';
  const autoRestore = !!(sharedSettings && sharedSettings.autoRestore);

  const launchFile = initialTargetFile ? {
    filePath: initialTargetFile,
    dirPath: path.dirname(initialTargetFile),
    fileName: path.basename(initialTargetFile)
  } : null;

  return {
    appVersion: app.getVersion(),
    isPrimary: gotTheLock,
    theme,
    sidebarLayout,
    layoutMode,
    autoRestore,
    sharedSettings,
    defaultWorkspace,
    launchFile
  };
}

let mainWindow = null;
let currentWorkspacePath = ''; // Track selected workspace directory
let cachedInitialState = null;

function createWindow() {
  cachedInitialState = computeInitialStateSync();
  const isLight = cachedInitialState.theme === 'light';
  const bgColor = isLight ? '#e6ecf4' : '#0d0e12';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: bgColor,
    title: 'Aether - Liquid Glass Markdown Editor',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--aether-theme=${cachedInitialState.theme}`,
        `--aether-layout-mode=${cachedInitialState.layoutMode}`,
        `--aether-sidebar-layout=${cachedInitialState.sidebarLayout}`,
        `--aether-version=${cachedInitialState.appVersion}`
      ]
    }
  });

  // Hide default Chromium top-menu dropdown bar
  mainWindow.setMenuBarVisibility(false);

  // Show window immediately once first frame is painted with the right theme
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Load the web app index entry point
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Pipe console logs from renderer process to main process terminal stdout
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] (${path.basename(sourceId)}:${line}) ${message}`);
  });

  // Open Chromium DevTools for debugging (only when explicitly requested via --devtools)
  if (!app.isPackaged && process.argv.includes('--devtools')) {
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
  // Safe custom media protocol handler for local workspace images
  protocol.handle('aether-media', async (request) => {
    try {
      const urlObj = new URL(request.url);
      let filePath = decodeURIComponent(urlObj.pathname);
      if (process.platform === 'win32' && filePath.startsWith('/') && filePath[2] === ':') {
        filePath = filePath.slice(1);
      }

      const normalized = path.normalize(filePath);
      if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
        return await net.fetch(pathToFileURL(normalized).toString());
      }
      return new Response('Image not found', { status: 404 });
    } catch (err) {
      console.error('aether-media protocol error:', err);
      return new Response('Error loading image', { status: 500 });
    }
  });

  createWindow();

  // 00. Get bundled initial startup state in one call
  ipcMain.handle('get-initial-state', () => {
    return cachedInitialState || computeInitialStateSync();
  });

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
    return readSharedSettingsSync();
  });

  // 0d. Save shared settings to disk (merges existing options to preserve primary session)
  ipcMain.handle('save-shared-settings', (event, settings) => {
    try {
      const settingsPath = path.join(getMainUserDataPath(), 'shared-settings.json');
      const existing = readSharedSettingsSync() || {};
      const merged = { ...existing, ...settings };
      if (!settings.primarySession && existing.primarySession) {
        merged.primarySession = existing.primarySession;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
      if (cachedInitialState) {
        cachedInitialState.sharedSettings = merged;
        if (merged.theme) cachedInitialState.theme = merged.theme;
      }
      return true;
    } catch (e) {
      console.error('Failed to save shared settings:', e);
      return false;
    }
  });

  // 0e. Get launch file if opened via Windows file association or Open With
  ipcMain.handle('get-launch-file', () => {
    if (initialTargetFile) {
      return {
        filePath: initialTargetFile,
        dirPath: path.dirname(initialTargetFile),
        fileName: path.basename(initialTargetFile)
      };
    }
    return null;
  });

  // 1. Open Directory Dialog Selector
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Aether Workspace Folder',
      defaultPath: currentWorkspacePath || app.getPath('documents'),
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // 1b. Get Default Workspace Path
  ipcMain.handle('get-default-workspace', () => {
    return getDefaultWorkspaceSync();
  });

  // 1c. Inspect arbitrary disk path (file or folder check)
  ipcMain.handle('inspect-path', async (event, targetPath) => {
    try {
      if (!targetPath || !fs.existsSync(targetPath)) return null;
      const stat = fs.statSync(targetPath);
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        name: path.basename(targetPath),
        dir: path.dirname(targetPath),
        size: stat.size,
        mtime: stat.mtime.toISOString()
      };
    } catch (err) {
      console.error('Failed to inspect path:', err);
      return null;
    }
  });

  // 1d. Read File by Absolute Path
  ipcMain.handle('read-file-absolute', async (event, fullPath) => {
    try {
      if (!fullPath || !fs.existsSync(fullPath)) return null;
      const stat = fs.statSync(fullPath);
      // Guard against reading huge binary files
      if (stat.size > 15 * 1024 * 1024) {
        throw new Error('File exceeds 15MB size limit');
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      return {
        content,
        name: path.basename(fullPath),
        dir: path.dirname(fullPath),
        fullPath: path.resolve(fullPath),
        updatedAt: stat.mtime.toISOString()
      };
    } catch (err) {
      console.error('Failed to read file absolute:', err);
      return null;
    }
  });

  // 1d-rel. Read File by Workspace-Relative Path (on-demand lazy loading)
  ipcMain.handle('read-file-relative', async (event, relativePath, name) => {
    try {
      const fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
      if (!fullPath || !fs.existsSync(fullPath)) return null;
      const stat = fs.statSync(fullPath);
      if (stat.size > 15 * 1024 * 1024) {
        throw new Error('File exceeds 15MB size limit');
      }
      return fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      console.error('Failed to read file relative:', err);
      return null;
    }
  });

  // 1e. Save File by Absolute Path
  ipcMain.handle('save-file-absolute', async (event, fullPath, content) => {
    try {
      if (!fullPath) return false;
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      return true;
    } catch (err) {
      console.error('Failed to save file absolute:', err);
      return false;
    }
  });

  // 1f. Rename Path by Absolute Path
  ipcMain.handle('rename-path-absolute', async (event, oldFullPath, newFullPath) => {
    try {
      if (!oldFullPath || !newFullPath || !fs.existsSync(oldFullPath)) return false;
      fs.renameSync(oldFullPath, newFullPath);
      return true;
    } catch (err) {
      console.error('Failed to rename path absolute:', err);
      return false;
    }
  });

  // 2. Read VFS Folder Node Array from Directory (Safe, Fast & Lazy-Loaded)
  ipcMain.handle('read-directory', async (event, dirPath) => {
    currentWorkspacePath = dirPath;
    const list = [];
    const MAX_DEPTH = 6;
    const EAGER_LOAD_MAX_BYTES = 128 * 1024; // Only eagerly load files <= 128KB; larger files load on-demand when clicked
    const IGNORED_NAMES = new Set([
      'node_modules', '.git', '$recycle.bin', 'system volume information',
      '.vscode', '.idea', 'dist', 'build', 'target', '.svn', '.hg'
    ]);

    function walk(currentDir, relativePath, depth = 0) {
      if (depth > MAX_DEPTH) return;
      let items;
      try {
        items = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (err) {
        return;
      }
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (IGNORED_NAMES.has(item.name.toLowerCase())) continue;
          const itemFullPath = path.join(currentDir, item.name);
          const itemRelPath = relativePath === '/' ? '/' + item.name : relativePath + '/' + item.name;
          const b64Key = Buffer.from(itemRelPath, 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

          if (item.isDirectory()) {
            let mtime;
            try {
              mtime = fs.statSync(itemFullPath).mtime.toISOString();
            } catch (e) {
              mtime = new Date().toISOString();
            }

            list.push({
              id: 'dir_' + b64Key,
              name: item.name,
              path: relativePath,
              isFolder: true,
              updatedAt: mtime
            });
            walk(itemFullPath, itemRelPath, depth + 1);
          } else if (item.isFile() && /\.(md|markdown|mdown|mkd|txt)$/i.test(item.name)) {
            let stat;
            try {
              stat = fs.statSync(itemFullPath);
              if (stat.size > 15 * 1024 * 1024) continue; // skip >15MB files
            } catch (e) {
              continue;
            }

            let content = null;
            if (stat.size <= EAGER_LOAD_MAX_BYTES) {
              try {
                content = fs.readFileSync(itemFullPath, 'utf8');
              } catch (e) {
                content = '';
              }
            }

            list.push({
              id: 'file_' + b64Key,
              name: item.name,
              content: content, // null if lazy-loaded
              size: stat.size,
              path: relativePath,
              isFolder: false,
              updatedAt: stat.mtime.toISOString()
            });
          }
        } catch (itemErr) {
          // ignore item error
        }
      }
    }

    if (dirPath && fs.existsSync(dirPath)) {
      walk(dirPath, '/', 0);
    }
    return list;
  });

  // 3. Write Markdown File to Disk (Supports Relative or Absolute Paths)
  ipcMain.handle('save-file', async (event, relativePath, name, content) => {
    let fullPath;
    if (relativePath && (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath))) {
      fullPath = name ? path.join(relativePath, name) : relativePath;
    } else {
      fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    }
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
    let fullPath;
    if (relativePath && (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath))) {
      fullPath = name ? path.join(relativePath, name) : relativePath;
    } else {
      fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    }
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
    let oldPath, newPath;
    if (relativePath && (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath))) {
      oldPath = path.join(relativePath, oldName);
      newPath = path.join(relativePath, newName);
    } else {
      oldPath = resolveFullPath(currentWorkspacePath, relativePath, oldName);
      newPath = resolveFullPath(currentWorkspacePath, relativePath, newName);
    }
    if (!oldPath || !newPath || !fs.existsSync(oldPath)) return false;
    
    fs.renameSync(oldPath, newPath);
    return true;
  });

  // 7. Show Item in Windows Explorer Shell (Supports Relative and Absolute Paths)
  ipcMain.handle('open-in-explorer', async (event, relativePath, name = '') => {
    let fullPath;
    if (relativePath && (path.isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath))) {
      fullPath = name ? path.join(relativePath, name) : relativePath;
    } else {
      fullPath = resolveFullPath(currentWorkspacePath, relativePath, name);
    }
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

  // 8. Open Image File Dialog Selector
  ipcMain.handle('select-image', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Image to Insert',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // 9. Save Image Buffer (Clipboard paste or drag-and-drop)
  ipcMain.handle('save-image-buffer', async (event, relativeFolder, filename, base64Data) => {
    try {
      const fullFolderPath = resolveFullPath(currentWorkspacePath, relativeFolder, '');
      if (!fullFolderPath) return null;

      fs.mkdirSync(fullFolderPath, { recursive: true });
      const cleanName = path.basename(filename);
      const targetFile = path.join(fullFolderPath, cleanName);

      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(targetFile, buffer);

      const relFromWorkspace = path.relative(currentWorkspacePath, targetFile).replace(/\\/g, '/');
      return relFromWorkspace;
    } catch (err) {
      console.error('Failed to save image buffer:', err);
      return null;
    }
  });

  // 10. Import External Image File into Workspace Assets Directory
  ipcMain.handle('import-image-file', async (event, sourceFilePath, targetSubdir = 'assets') => {
    try {
      if (!currentWorkspacePath || !fs.existsSync(sourceFilePath)) return null;

      const assetsDir = path.join(currentWorkspacePath, targetSubdir);
      fs.mkdirSync(assetsDir, { recursive: true });

      let baseName = path.basename(sourceFilePath);
      let targetPath = path.join(assetsDir, baseName);

      if (fs.existsSync(targetPath)) {
        const ext = path.extname(baseName);
        const nameWithoutExt = path.basename(baseName, ext);
        baseName = `${nameWithoutExt}_${Date.now()}${ext}`;
        targetPath = path.join(assetsDir, baseName);
      }

      fs.copyFileSync(sourceFilePath, targetPath);
      return path.relative(currentWorkspacePath, targetPath).replace(/\\/g, '/');
    } catch (err) {
      console.error('Failed to import image file:', err);
      return null;
    }
  });

  // 11. Calculate Relative Path Between Document Directory and Target File
  ipcMain.handle('get-relative-image-path', async (event, fullPath, docRelPath) => {
    try {
      if (!currentWorkspacePath || !fullPath) return null;
      const docFullPath = resolveFullPath(currentWorkspacePath, docRelPath);
      const docDir = (docFullPath && fs.existsSync(docFullPath) && fs.statSync(docFullPath).isDirectory()) 
        ? docFullPath 
        : path.dirname(docFullPath);

      let rel = path.relative(docDir, fullPath).replace(/\\/g, '/');
      if (!rel.startsWith('.') && !rel.startsWith('/')) {
        rel = './' + rel;
      }
      return rel;
    } catch (err) {
      console.error('Failed to calculate relative image path:', err);
      return null;
    }
  });

  // 12. Copy App Assets (Logo) to Workspace for Starter Guides
  ipcMain.handle('copy-default-assets', async (event, targetWorkspace) => {
    try {
      const ws = targetWorkspace || currentWorkspacePath;
      if (!ws) return false;
      const sourceLogo = path.join(__dirname, 'logo.png');
      const targetAssets = path.join(ws, 'assets');
      const targetLogo = path.join(targetAssets, 'logo.png');
      if (fs.existsSync(sourceLogo) && !fs.existsSync(targetLogo)) {
        fs.mkdirSync(targetAssets, { recursive: true });
        fs.copyFileSync(sourceLogo, targetLogo);
      }
      return true;
    } catch (err) {
      console.error('Failed to copy default assets:', err);
      return false;
    }
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
