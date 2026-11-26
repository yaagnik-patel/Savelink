import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  closeApp: () => ipcRenderer.send('close-app'),

  // Dock & Collapse APIs
  getDockState: () => ipcRenderer.invoke('get-dock-state'),
  expandWindow: (tab) => ipcRenderer.invoke('expand-window', tab),
  collapseWindow: () => ipcRenderer.invoke('collapse-window'),
  onDockStateChanged: (callback) => {
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('dock-state-changed', handler)
    return () => ipcRenderer.removeListener('dock-state-changed', handler)
  },

  // Theme APIs
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (mode) => ipcRenderer.invoke('set-theme', mode),
  onThemeChanged: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },

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
  onLinkUpdated: (callback) => {
    const handler = (_event, link) => callback(link)
    ipcRenderer.on('link-updated', handler)
    return () => ipcRenderer.removeListener('link-updated', handler)
  },
  onLinkDeleted: (callback) => {
    const handler = (_event, id) => callback(id)
    ipcRenderer.on('link-deleted', handler)
    return () => ipcRenderer.removeListener('link-deleted', handler)
  }
})
