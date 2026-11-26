import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  closeApp: () => ipcRenderer.send('close-app'),

  // Dock & Collapse APIs
  getDockState: () => ipcRenderer.invoke('get-dock-state'),
  getTransitionState: () => ipcRenderer.invoke('get-transition-state'),
  expandWindow: (tab) => ipcRenderer.invoke('expand-window', tab),
  collapseWindow: () => ipcRenderer.invoke('collapse-window'),
  notifyOpened: () => ipcRenderer.invoke('notify-opened'),
  notifyClosed: () => ipcRenderer.invoke('notify-closed'),
  onTransitionTo: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('transition-to', handler)
    return () => ipcRenderer.removeListener('transition-to', handler)
  },
  onDockStateChanged: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('dock-state-changed', handler)
    return () => ipcRenderer.removeListener('dock-state-changed', handler)
  },
  onRequestCollapse: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('request-collapse', handler)
    return () => ipcRenderer.removeListener('request-collapse', handler)
  },

  // Theme APIs
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (mode) => ipcRenderer.invoke('set-theme', mode),
  onThemeChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },

  // Auto-Start APIs
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // Tags APIs
  getTags: () => ipcRenderer.invoke('get-tags'),
  setTags: (tags) => ipcRenderer.invoke('set-tags', tags),

  // Link APIs
  getLinks: () => ipcRenderer.invoke('get-links'),
  addLink: (url, tab) => ipcRenderer.invoke('add-link', url, tab),
  deleteLink: (id) => ipcRenderer.invoke('delete-link', id),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  updateLinkTab: (id, tab) => ipcRenderer.invoke('update-link-tab', id, tab),
  showLinkContextMenu: (linkData) => ipcRenderer.send('show-link-context-menu', linkData),

  // Events
  onLinkAdded: (callback) => {
    const handler = (_event, link) => callback(link)
    ipcRenderer.on('link-added', handler)
    return () => ipcRenderer.removeListener('link-added', handler)
  },
  onLinkUpdated: (callback) => {
    const handler = (_event, link) => callback(link)
    ipcRenderer.on('link-updated', handler)
    return () => ipcRenderer.removeListener('link-updated', handler)
  },
  onLinkDeleted: (callback) => {
    const handler = (_event, id) => callback(id)
    ipcRenderer.on('link-deleted', handler)
    return () => ipcRenderer.removeListener('link-deleted', handler)
  },
  onRequestDeleteLink: (callback) => {
    const handler = (_event, id) => callback(id)
    ipcRenderer.on('request-delete-link', handler)
    return () => ipcRenderer.removeListener('request-delete-link', handler)
  },

  // Auto Updater APIs
  onUpdateDownloaded: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
})
