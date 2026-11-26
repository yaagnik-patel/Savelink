import { app, BrowserWindow, ipcMain, screen, nativeTheme, Menu, shell, clipboard, nativeImage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import ElectronStore from 'electron-store'
import * as cheerio from 'cheerio'

const StoreClass = ElectronStore.default || ElectronStore
let store

// Single Instance Lock: Prevents duplicate background processes fighting for resources
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

process.on('uncaughtException', (err) => {
  console.error('[SaveLink Uncaught Exception]:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[SaveLink Unhandled Rejection]:', reason)
})
app.on('render-process-gone', (_event, details) => {
  console.error('[SaveLink Renderer Gone]:', details)
})
app.on('child-process-gone', (_event, details) => {
  console.error('[SaveLink Child Gone]:', details)
})

const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 520
const MIN_WIDTH = 340
const MAX_WIDTH = 440
const MIN_HEIGHT = 440
const MAX_HEIGHT = 600

const COLLAPSED_WIDTH = 56
const COLLAPSED_HEIGHT = 152

function getStore() {
  if (!store) {
    store = new StoreClass({
      name: 'savelink-data',
      defaults: {
        links: [],
        settings: {
          theme: 'system',
          dockSide: 'right',
          windowSize: {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT
          }
        }
      }
    })
  }
  return store
}

function getSettings() {
  const current = getStore().get('settings', {})
  const rawW = current.windowSize?.width || DEFAULT_WIDTH
  const rawH = current.windowSize?.height || DEFAULT_HEIGHT
  // Strictly clamp width and height so the window never opens huge or tiny
  const width = Math.min(Math.max(rawW, MIN_WIDTH), MAX_WIDTH)
  const height = Math.min(Math.max(rawH, MIN_HEIGHT), MAX_HEIGHT)

  return {
    theme: current.theme || 'system',
    tags: current.tags || ['Work', 'Later'],
    dockSide: current.dockSide || 'right',
    windowSize: { width, height },
    collapsedY: current.collapsedY !== undefined ? current.collapsedY : null,
    lastPosition: current.lastPosition || null
  }
}

function setSetting(key, value) {
  const settings = getStore().get('settings', {})
  settings[key] = value
  getStore().set('settings', settings)
}

function getResolvedTheme(mode) {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function getGlassWindowOptions() {
  const baseOptions = {
    frame: false,
    alwaysOnTop: true,
    hasShadow: false, // Prevents rectangular OS drop shadow box
    resizable: false, // Disallow manual resize as requested
    maximizable: false, // Prevents Windows 11 Aero Snap from stretching the widget
    minimizable: false,
    minWidth: 46, // Allows collapsing down to edge tab
    minHeight: 100,
    maxWidth: MAX_WIDTH, // Strictly prevents window from opening huge
    maxHeight: MAX_HEIGHT,
    show: false,
    autoHideMenuBar: true
  }

  if (process.platform === 'darwin') {
    return {
      ...baseOptions,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active'
    }
  }

  // Pure alpha transparency without rectangular OS acrylic box
  return {
    ...baseOptions,
    transparent: true,
    backgroundColor: '#00000000'
  }
}

function getDomain(urlStr) {
  try {
    const parsed = new URL(urlStr)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return urlStr.replace(/^https?:\/\//, '').split('/')[0] || urlStr
  }
}

function toAbsoluteUrl(candidate, baseUrl) {
  if (!candidate || typeof candidate !== 'string') return null
  try {
    return new URL(candidate.trim(), baseUrl).href
  } catch {
    return null
  }
}

function normalizeUrl(input) {
  let str = (input || '').trim()
  if (!/^https?:\/\//i.test(str)) {
    str = 'https://' + str
  }
  return str
}

// ==========================================================
// LOCAL ICON STORAGE & DOMAIN DE-DUPLICATION CACHE
// ==========================================================
const iconMemoryCache = new Map()

function getSafeDomainKey(domain) {
  return (domain || 'default')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]/g, '_')
}

function getIconsDir() {
  const dir = join(app.getPath('userData'), 'icons')
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (e) {
      console.error('Failed to create icons directory:', e)
    }
  }
  return dir
}

function getStoredIconPath(domain) {
  const safeKey = getSafeDomainKey(domain)
  return join(getIconsDir(), `${safeKey}.png`)
}

function hasStoredIcon(domain) {
  if (!domain) return false
  const safeKey = getSafeDomainKey(domain)
  if (iconMemoryCache.has(safeKey)) return true
  const filePath = getStoredIconPath(domain)
  return fs.existsSync(filePath)
}

function getStoredIcon(domain) {
  if (!domain) return null
  const safeKey = getSafeDomainKey(domain)
  if (iconMemoryCache.has(safeKey)) {
    return iconMemoryCache.get(safeKey)
  }

  const filePath = getStoredIconPath(domain)
  try {
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath)
      if (buf && buf.length > 0) {
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
        iconMemoryCache.set(safeKey, dataUrl)
        return dataUrl
      }
    }
  } catch (err) {
    console.error('Error reading stored icon:', err)
  }
  return null
}

/**
 * Downloads candidate icon, resizes to a compact 64x64 PNG (~1-3 KB),
 * stores to local disk, and returns the data URL.
 * NEVER downloads if already stored locally for this domain.
 */
async function fetchAndStoreIcon(candidateUrls, domain) {
  if (!domain) return null

  // 1. If already stored locally (e.g. ChatGPT, Pinterest), reuse immediately!
  const existing = getStoredIcon(domain)
  if (existing) {
    return existing
  }

  const safeKey = getSafeDomainKey(domain)
  const filePath = getStoredIconPath(domain)

  // 2. Prepare candidates: specific candidate links + Google fallback
  const urls = []
  if (Array.isArray(candidateUrls)) {
    urls.push(...candidateUrls.filter(Boolean))
  } else if (candidateUrls) {
    urls.push(candidateUrls)
  }

  const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  if (!urls.includes(googleFavicon)) {
    urls.push(googleFavicon)
  }

  // 3. Try candidates sequentially
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(4000),
        redirect: 'follow'
      })

      if (!response.ok) continue

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      if (buffer.length === 0) continue

      // Use Electron's nativeImage to decode and compress/resize
      const img = nativeImage.createFromBuffer(buffer)
      if (img.isEmpty()) continue

      // Resize down to 64x64 max so it remains strictly in KB (1-3 KB)
      const size = img.getSize()
      let resized = img
      if (size.width > 64 || size.height > 64 || size.width === 0) {
        resized = img.resize({ width: 64, height: 64, quality: 'better' })
      }

      const pngBuf = resized.toPNG()
      if (pngBuf && pngBuf.length > 0) {
        try {
          fs.writeFileSync(filePath, pngBuf)
        } catch (e) {
          console.error('Failed to write icon to disk:', e)
        }

        const dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`
        iconMemoryCache.set(safeKey, dataUrl)
        return dataUrl
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null
}

/**
 * Fetches page metadata: og:title -> twitter:title -> <title> -> domain name.
 * Uses local cached icon if already stored for domain; otherwise fetches once,
 * resizes to compact KB size, and stores locally.
 */
async function fetchMeta(url) {
  const domain = getDomain(url)
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  const alreadyStored = hasStoredIcon(domain)
  let logo = getStoredIcon(domain)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow'
    })

    if (!response.ok) {
      if (!logo) {
        logo = (await fetchAndStoreIcon([], domain)) || defaultFavicon
      }
      return { title: domain, logo }
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const ogTitle = $('meta[property="og:title"]').attr('content')
    const twitterTitle =
      $('meta[name="twitter:title"]').attr('content') ||
      $('meta[property="twitter:title"]').attr('content')
    const tagTitle = $('title').first().text()

    let title = (ogTitle || twitterTitle || tagTitle || domain).trim()
    title = title.replace(/\s+/g, ' ') || domain

    // If icon is NOT already stored for this domain, discover candidate icons and store it!
    if (!alreadyStored || !logo) {
      const appleTouchIcon = $('link[rel="apple-touch-icon"]').attr('href')
      const iconHref =
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href') ||
        $('link[rel~="icon"]').attr('href')
      const ogImage = $('meta[property="og:image"]').attr('content')

      const candidates = [
        appleTouchIcon ? toAbsoluteUrl(appleTouchIcon, url) : null,
        iconHref ? toAbsoluteUrl(iconHref, url) : null,
        ogImage ? toAbsoluteUrl(ogImage, url) : null
      ].filter(Boolean)

      logo = (await fetchAndStoreIcon(candidates, domain)) || defaultFavicon
    }

    return { title, logo }
  } catch {
    if (!logo) {
      logo = (await fetchAndStoreIcon([], domain)) || defaultFavicon
    }
    return { title: domain, logo }
  }
}

let mainWindow = null
let isCollapsed = false
let dockSide = 'right'
let isContextMenuOpen = false
let isProgrammaticMove = false

function collapseWindow() {
  if (isCollapsed || !mainWindow || mainWindow.isDestroyed() || isContextMenuOpen) return

  const activeDisplay = screen.getDisplayMatching(mainWindow.getBounds())
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = activeDisplay.workArea
  const [currentX, currentY] = mainWindow.getPosition()
  const [currentW, currentH] = mainWindow.getSize()

  // Clamp and save last uncollapsed dimensions
  const clampedW = Math.min(Math.max(currentW, MIN_WIDTH), MAX_WIDTH)
  const clampedH = Math.min(Math.max(currentH, MIN_HEIGHT), MAX_HEIGHT)
  setSetting('windowSize', { width: clampedW, height: clampedH })
  setSetting('lastPosition', { x: currentX, y: currentY })

  // Determine dock side based on window center relative to screen center
  const midPoint = displayX + screenWidth / 2
  dockSide = (currentX + currentW / 2) < midPoint ? 'left' : 'right'
  setSetting('dockSide', dockSide)

  let targetY = currentY + Math.round((currentH - COLLAPSED_HEIGHT) / 2)
  targetY = Math.min(
    Math.max(targetY, displayY + 16),
    displayY + screenHeight - COLLAPSED_HEIGHT - 16
  )

  const targetX = dockSide === 'right' ? (displayX + screenWidth - COLLAPSED_WIDTH) : displayX

  isCollapsed = true
  isProgrammaticMove = true

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.setBounds({
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT
  })

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.showInactive()
  mainWindow.moveTop()

  setTimeout(() => {
    isProgrammaticMove = false
  }, 100)

  mainWindow.webContents.send('dock-state-changed', { collapsed: true, dockSide })
}

function expandWindow(targetTab = null) {
  if (!isCollapsed || !mainWindow || mainWindow.isDestroyed()) return

  const activeDisplay = screen.getDisplayMatching(mainWindow.getBounds())
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = activeDisplay.workArea
  const saved = getSettings()
  const fullW = Math.min(Math.max(saved.windowSize?.width || DEFAULT_WIDTH, MIN_WIDTH), MAX_WIDTH)
  const fullH = Math.min(Math.max(saved.windowSize?.height || DEFAULT_HEIGHT, MIN_HEIGHT), MAX_HEIGHT)
  const margin = 16

  const [, currentY] = mainWindow.getPosition()
  const targetX = dockSide === 'right'
    ? (displayX + screenWidth - fullW - margin)
    : (displayX + margin)
  const targetY = Math.min(
    Math.max(currentY - Math.round((fullH - COLLAPSED_HEIGHT) / 2), displayY + margin),
    displayY + screenHeight - fullH - margin
  )

  isCollapsed = false
  isProgrammaticMove = true

  mainWindow.setBounds({
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: fullW,
    height: fullH
  })

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.show()
  mainWindow.focus()

  setTimeout(() => {
    isProgrammaticMove = false
  }, 100)

  mainWindow.webContents.send('dock-state-changed', { collapsed: false, dockSide, targetTab })
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const settings = getSettings()
  dockSide = settings.dockSide || 'right'
  const windowWidth = settings.windowSize.width
  const windowHeight = settings.windowSize.height
  const margin = 16

  const displayX = primaryDisplay.workArea?.x || 0
  const displayY = primaryDisplay.workArea?.y || 0

  let x, y
  if (settings.lastPosition) {
    // Keep within primary display bounds
    x = Math.min(Math.max(settings.lastPosition.x, displayX + margin), displayX + screenWidth - windowWidth - margin)
    y = Math.min(Math.max(settings.lastPosition.y, displayY + margin), displayY + screenHeight - windowHeight - margin)
  } else {
    x = Math.round(displayX + screenWidth - windowWidth - margin)
    y = Math.round(displayY + screenHeight - windowHeight - margin)
  }

  const glassOptions = getGlassWindowOptions()

  mainWindow = new BrowserWindow({
    ...glassOptions,
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Debounced listener to persist window size when user adjusts it manually
  let resizeTimer = null
  mainWindow.on('resize', () => {
    if (isCollapsed) return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !isCollapsed) {
        const [w, h] = mainWindow.getSize()
        const clampedW = Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH)
        const clampedH = Math.min(Math.max(h, MIN_HEIGHT), MAX_HEIGHT)
        setSetting('windowSize', { width: clampedW, height: clampedH })
      }
    }, 250)
  })

  // Track window drop/move position to determine dock side (left vs right) and clamp position
  let moveTimer = null
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed() || isProgrammaticMove) return
    const [winX, winY] = mainWindow.getPosition()
    const [winW, winH] = mainWindow.getSize()
    const activeDisplay = screen.getDisplayMatching(mainWindow.getBounds())
    const { x: dX, y: dY, width: sW, height: sH } = activeDisplay.workArea
    const midPoint = dX + sW / 2
    const newDockSide = (winX + winW / 2) < midPoint ? 'left' : 'right'

    if (newDockSide !== dockSide) {
      dockSide = newDockSide
      setSetting('dockSide', dockSide)
      mainWindow.webContents.send('dock-state-changed', { collapsed: isCollapsed, dockSide })
    }

    if (!isCollapsed) {
      setSetting('lastPosition', { x: winX, y: winY })
    } else {
      setSetting('collapsedY', winY)
      // Lock dimensions to COLLAPSED_WIDTH x COLLAPSED_HEIGHT and snap flush to screen edge
      const targetX = dockSide === 'right' ? (dX + sW - COLLAPSED_WIDTH) : dX
      const clampedY = Math.min(Math.max(winY, dY + 16), dY + sH - COLLAPSED_HEIGHT - 16)

      // Avoid infinite setBounds loop if already resting at target coordinates
      if (Math.abs(winX - targetX) <= 1 && Math.abs(winY - clampedY) <= 1 && winW === COLLAPSED_WIDTH && winH === COLLAPSED_HEIGHT) {
        return
      }

      if (moveTimer) clearTimeout(moveTimer)
      moveTimer = setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed() || !isCollapsed) return
        isProgrammaticMove = true
        mainWindow.setBounds({
          x: Math.round(targetX),
          y: Math.round(clampedY),
          width: COLLAPSED_WIDTH,
          height: COLLAPSED_HEIGHT
        })
        setTimeout(() => {
          isProgrammaticMove = false
        }, 100)
      }, 150)
    }
  })

  // Ensure open container shows first on launch; do not auto-collapse until user has interacted
  let allowBlurCollapse = false
  let blurTimer = null

  mainWindow.on('blur', () => {
    if (!allowBlurCollapse) return
    if (!isContextMenuOpen && !isCollapsed) {
      if (blurTimer) clearTimeout(blurTimer)
      blurTimer = setTimeout(() => {
        if (allowBlurCollapse && !isContextMenuOpen && !isCollapsed && mainWindow && !mainWindow.isDestroyed()) {
          collapseWindow()
        }
      }, 300)
    }
  })

  // Once the window is focused, enable blur collapse after a brief delay
  mainWindow.on('focus', () => {
    if (blurTimer) {
      clearTimeout(blurTimer)
      blurTimer = null
    }
    setTimeout(() => {
      allowBlurCollapse = true
    }, 1000)
  })

  mainWindow.once('ready-to-show', () => {
    isCollapsed = false
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.show()
    mainWindow.focus()
    mainWindow.moveTop()
  })

  // Guaranteed fallback to show window if ready-to-show is delayed or skipped
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      isCollapsed = false
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.show()
      mainWindow.focus()
      mainWindow.moveTop()
    }
  }, 500)

  // Recovery in dev mode if renderer dev server takes a second to start
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.warn('Renderer load retry:', errorCode, errorDescription)
    if (process.env['ELECTRON_RENDERER_URL']) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
        }
      }, 500)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getAllLinks() {
  const raw = getStore().get('links', [])
  return raw.map((l) => ({
    ...l,
    tab: l.tab !== undefined ? l.tab : null,
    status: l.status || (l.isLoading ? 'loading' : 'ready')
  }))
}

/**
 * Checks all saved links on launch:
 * 1. Reuses stored local icons from disk for any link whose domain is already cached.
 * 2. Fetches and caches missing icons in the background once per domain, resizing to small KB PNGs.
 */
function migrateAndWarmIconCache() {
  try {
    const links = getAllLinks()
    let hasUpdates = false
    const updatedLinks = links.map((link) => {
      if (!link.domain) return link
      const stored = getStoredIcon(link.domain)
      if (stored && link.logo !== stored) {
        hasUpdates = true
        return { ...link, logo: stored }
      }
      return link
    })

    if (hasUpdates) {
      getStore().set('links', updatedLinks)
    }

    // Identify domains missing local icons
    const missingDomains = new Set()
    links.forEach((l) => {
      if (l.domain && !hasStoredIcon(l.domain)) {
        missingDomains.add(l.domain)
      }
    })

    if (missingDomains.size > 0) {
      setTimeout(async () => {
        for (const dom of missingDomains) {
          try {
            const dataUrl = await fetchAndStoreIcon([], dom)
            if (dataUrl) {
              const current = getAllLinks()
              let changed = false
              const next = current.map((item) => {
                if (item.domain === dom && item.logo !== dataUrl) {
                  changed = true
                  const up = { ...item, logo: dataUrl }
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('link-updated', up)
                  }
                  return up
                }
                return item
              })
              if (changed) {
                getStore().set('links', next)
              }
            }
          } catch {
            // Ignore background warming error
          }
        }
      }, 1500)
    }
  } catch (e) {
    console.error('Failed to warm icon cache:', e)
  }
}

app.whenReady().then(() => {
  // 1. Initialize Theme before window creation
  const settings = getSettings()
  const savedMode = settings.theme || 'system'
  nativeTheme.themeSource = savedMode

  // 2. Warm up local icon cache for saved links
  migrateAndWarmIconCache()

  // Listen to OS theme changes
  nativeTheme.on('updated', () => {
    const mode = nativeTheme.themeSource
    const resolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-changed', { mode, resolved })
    }
  })

  // Handle second instance launch: bring existing window forward instead of spawning duplicates
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (isCollapsed) expandWindow()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.moveTop()
    }
  })

  // IPC: Close App
  ipcMain.on('close-app', () => {
    app.quit()
  })

  // IPC: Dock & Collapse Handlers
  ipcMain.handle('get-dock-state', () => {
    return { collapsed: isCollapsed, dockSide }
  })

  ipcMain.handle('expand-window', (_, targetTab) => {
    expandWindow(targetTab)
  })

  ipcMain.handle('collapse-window', () => {
    collapseWindow()
  })

  // IPC: Theme Handlers
  ipcMain.handle('get-theme', () => {
    const mode = nativeTheme.themeSource
    const resolved = getResolvedTheme(mode)
    return { mode, resolved }
  })

  ipcMain.handle('set-theme', (_, mode) => {
    const validMode = ['system', 'light', 'dark'].includes(mode) ? mode : 'system'
    nativeTheme.themeSource = validMode
    setSetting('theme', validMode)
    const resolved = getResolvedTheme(validMode)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-changed', { mode: validMode, resolved })
    }
    return { mode: validMode, resolved }
  })

  // IPC: Tags Handlers
  ipcMain.handle('get-tags', () => {
    const settings = getStore().get('settings', {})
    return Array.isArray(settings.tags) && settings.tags.length > 0
      ? settings.tags
      : ['Work', 'Later']
  })

  ipcMain.handle('set-tags', (_, newTags) => {
    const valid = Array.isArray(newTags)
      ? newTags.map((t) => String(t).trim()).filter((t) => t && t.toLowerCase() !== 'all')
      : ['Work', 'Later']
    const unique = Array.from(new Set(valid))
    setSetting('tags', unique)
    return unique
  })

  // IPC: Get Links
  ipcMain.handle('get-links', () => {
    return getAllLinks()
  })

  // IPC: Add Link
  ipcMain.handle('add-link', (_, rawUrl, targetTab = null) => {
    const url = normalizeUrl(rawUrl)
    const domain = getDomain(url)

    // Reuse stored icon immediately if this domain (e.g. ChatGPT, Pinterest) was already cached
    const storedLogo = getStoredIcon(domain)
    const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    const initialLogo = storedLogo || defaultFavicon

    const newLink = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      domain,
      title: domain,
      logo: initialLogo,
      status: 'loading',
      isLoading: true,
      createdAt: new Date().toISOString(),
      tab: targetTab || null
    }

    const currentLinks = getAllLinks()
    const updated = [newLink, ...currentLinks]
    getStore().set('links', updated)

    // Background fetch: retrieves title and stores icon once per domain
    fetchMeta(url)
      .then(({ title, logo }) => {
        const storedLinks = getAllLinks()
        const idx = storedLinks.findIndex((l) => l.id === newLink.id)
        if (idx !== -1) {
          storedLinks[idx] = {
            ...storedLinks[idx],
            title: title || storedLinks[idx].title,
            logo: logo || storedLinks[idx].logo,
            status: 'ready',
            isLoading: false
          }
          getStore().set('links', storedLinks)

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('link-updated', storedLinks[idx])
          }
        }
      })
      .catch(() => {
        const storedLinks = getAllLinks()
        const idx = storedLinks.findIndex((l) => l.id === newLink.id)
        if (idx !== -1) {
          storedLinks[idx] = {
            ...storedLinks[idx],
            status: 'ready',
            isLoading: false
          }
          getStore().set('links', storedLinks)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('link-updated', storedLinks[idx])
          }
        }
      })

    return newLink
  })

  // IPC: Delete Link
  ipcMain.handle('delete-link', (_, id) => {
    const currentLinks = getAllLinks()
    const updated = currentLinks.filter((l) => l.id !== id)
    getStore().set('links', updated)
    return updated
  })

  // IPC: Open Link in external browser
  ipcMain.handle('open-link', (_, url) => {
    if (url) {
      shell.openExternal(url)
    }
  })

  // Helper to update a link's tab and notify renderers
  function updateLinkTab(id, tab, win = mainWindow) {
    const currentLinks = getAllLinks()
    const idx = currentLinks.findIndex((l) => l.id === id)
    if (idx !== -1) {
      currentLinks[idx] = {
        ...currentLinks[idx],
        tab: tab || null
      }
      getStore().set('links', currentLinks)
      if (win && !win.isDestroyed()) {
        win.webContents.send('link-updated', currentLinks[idx])
      }
      return currentLinks[idx]
    }
    return null
  }

  // IPC: Update Link Tab
  ipcMain.handle('update-link-tab', (_, id, tab) => {
    return updateLinkTab(id, tab, mainWindow)
  })

  // IPC: Row Right-Click Context Menu
  ipcMain.on('show-link-context-menu', (event, { id, url, currentTab }) => {
    isContextMenuOpen = true
    const win = BrowserWindow.fromWebContents(event.sender)
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          if (url) shell.openExternal(url)
        }
      },
      {
        label: 'Copy link',
        click: () => {
          if (url) clipboard.writeText(url)
        }
      },
      { type: 'separator' },
      {
        label: 'Move to Tab',
        submenu: [
          {
            label: 'All (General)',
            type: 'radio',
            checked: !currentTab || currentTab === 'All',
            click: () => updateLinkTab(id, null, win)
          },
          {
            label: 'Work',
            type: 'radio',
            checked: currentTab === 'Work',
            click: () => updateLinkTab(id, 'Work', win)
          },
          {
            label: 'Later',
            type: 'radio',
            checked: currentTab === 'Later',
            click: () => updateLinkTab(id, 'Later', win)
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Delete',
        click: () => {
          const currentLinks = getAllLinks()
          const updated = currentLinks.filter((l) => l.id !== id)
          getStore().set('links', updated)
          if (win && !win.isDestroyed()) {
            win.webContents.send('link-deleted', id)
          }
        }
      }
    ])

    menu.on('menu-will-close', () => {
      setTimeout(() => {
        isContextMenuOpen = false
      }, 100)
    })

    menu.popup({ window: win })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
