// Aether Electron Preload Context Bridge API
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Extract synchronous startup flags passed via webPreferences.additionalArguments
function getArgValue(prefix, fallback = '') {
  if (!Array.isArray(process.argv)) return fallback;
  const arg = process.argv.find(a => typeof a === 'string' && a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const syncStartupConfig = {
  theme: getArgValue('--aether-theme=', ''),
  layoutMode: getArgValue('--aether-layout-mode=', ''),
  sidebarLayout: getArgValue('--aether-sidebar-layout=', ''),
  appVersion: getArgValue('--aether-version=', '')
};

contextBridge.exposeInMainWorld('aetherAPI', {
  isElectron: () => true,
  getSyncStartupConfig: () => syncStartupConfig,
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultWorkspace: () => ipcRenderer.invoke('get-default-workspace'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFileRelative: (relativePath, name) => ipcRenderer.invoke('read-file-relative', relativePath, name),
  saveFile: (relativePath, name, content) => ipcRenderer.invoke('save-file', relativePath, name, content),
  createFolder: (relativePath, name) => ipcRenderer.invoke('create-folder', relativePath, name),
  deletePath: (relativePath, name, isFolder) => ipcRenderer.invoke('delete-path', relativePath, name, isFolder),
  renamePath: (relativePath, oldName, newName, isFolder) => ipcRenderer.invoke('rename-path', relativePath, oldName, newName, isFolder),
  openInExplorer: (relativePath, name) => ipcRenderer.invoke('open-in-explorer', relativePath, name),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isPrimarySession: () => ipcRenderer.invoke('is-primary-session'),
  getSharedSettings: () => ipcRenderer.invoke('get-shared-settings'),
  saveSharedSettings: (settings) => ipcRenderer.invoke('save-shared-settings', settings),
  selectImage: () => ipcRenderer.invoke('select-image'),
  saveImageBuffer: (relativeFolder, filename, base64Data) => ipcRenderer.invoke('save-image-buffer', relativeFolder, filename, base64Data),
  importImageFile: (sourceFilePath, targetSubdir) => ipcRenderer.invoke('import-image-file', sourceFilePath, targetSubdir),
  getRelativeImagePath: (fullPath, docRelPath) => ipcRenderer.invoke('get-relative-image-path', fullPath, docRelPath),
  copyDefaultAssets: (targetWorkspace) => ipcRenderer.invoke('copy-default-assets', targetWorkspace),
  getLaunchFile: () => ipcRenderer.invoke('get-launch-file'),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const p = webUtils.getPathForFile(file);
        if (p) return p;
      }
    } catch (e) {}
    return file ? (file.path || '') : '';
  },
  inspectPath: (targetPath) => ipcRenderer.invoke('inspect-path', targetPath),
  readFileAbsolute: (fullPath) => ipcRenderer.invoke('read-file-absolute', fullPath),
  saveFileAbsolute: (fullPath, content) => ipcRenderer.invoke('save-file-absolute', fullPath, content),
  renamePathAbsolute: (oldFullPath, newFullPath) => ipcRenderer.invoke('rename-path-absolute', oldFullPath, newFullPath)
});
