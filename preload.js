// Aether Electron Preload Context Bridge API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aetherAPI', {
  isElectron: () => true,
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultWorkspace: () => ipcRenderer.invoke('get-default-workspace'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  saveFile: (relativePath, name, content) => ipcRenderer.invoke('save-file', relativePath, name, content),
  createFolder: (relativePath, name) => ipcRenderer.invoke('create-folder', relativePath, name),
  deletePath: (relativePath, name, isFolder) => ipcRenderer.invoke('delete-path', relativePath, name, isFolder),
  renamePath: (relativePath, oldName, newName, isFolder) => ipcRenderer.invoke('rename-path', relativePath, oldName, newName, isFolder),
  openInExplorer: (relativePath, name) => ipcRenderer.invoke('open-in-explorer', relativePath, name),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isPrimarySession: () => ipcRenderer.invoke('is-primary-session'),
  getSharedSettings: () => ipcRenderer.invoke('get-shared-settings'),
  saveSharedSettings: (settings) => ipcRenderer.invoke('save-shared-settings', settings)
});
