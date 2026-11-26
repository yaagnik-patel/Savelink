import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  nativeTheme,
  Menu,
  shell,
  clipboard,
  nativeImage,
  globalShortcut,
  Notification,
  Tray
} from 'electron'
import { join } from 'path'
import fs from 'fs'
import ElectronStore from 'electron-store'
import { randomUUID } from 'crypto'
import { autoUpdater } from 'electron-updater'

// Configure autoUpdater
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

// ─── PostHog Analytics (HTTP API — no package required) ───────────────────────
const PH_API_KEY = 'phc_t4JzyDEChJcZzNjzQf7q8DDrZmTVYk6RjuugfBrAeuX9'
const PH_HOST = 'https://us.i.posthog.com'

function getDeviceId() {
  const s = getStore()
  let id = s.get('deviceId')
  if (!id) {
    id = randomUUID()
    s.set('deviceId', id)
  }
  return id
}

function phCapture(event, properties = {}) {
  try {
    const body = JSON.stringify({
      api_key: PH_API_KEY,
      event,
      distinct_id: getDeviceId(),
      properties: {
        app_version: app.getVersion(),
        platform: process.platform,
        os_version: process.getSystemVersion?.() || 'unknown',
        ...properties
      }
    })
    fetch(`${PH_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }).catch(() => {}) // silent — never crash the app on analytics failure
  } catch (_) {}
}
// ──────────────────────────────────────────────────────────────────────────────

let cheerioModule = null
async function getCheerio() {
  if (!cheerioModule) {
    cheerioModule = await import('cheerio')
  }
  return cheerioModule.default || cheerioModule
}

const StoreClass = ElectronStore.default || ElectronStore
let store

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
    lastPosition: current.lastPosition || null,
    autoStart: current.autoStart !== undefined ? current.autoStart : true
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
    minHeight: 80, // Allows collapsing down to 152px without clamping
    maxWidth: MAX_WIDTH, // Strictly prevents window from opening huge
    maxHeight: MAX_HEIGHT,
    roundedCorners: false, // Disables Windows 11 DWM rounded corner box & border
    thickFrame: false, // Disables standard window sizing border
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

const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAn0lEQVR4nO3U6w2AIAxGUabQuLLzuB8u0EC/RwMxkvBL4z2Ramv/AtdxXn20l4XLIGjYClHjEsIVpxDIg++nh5tGqOEZZG8AG0evWwHMPVLcAQgRzmm3AthhWwqg/gnotLNvhga4jsYGYIezFJD9jENAhKgChPEZgPnlwoAMgj3zVHwLQIRQph2OjxDKhuJuBBV3IaS4ArGFUUhZ+LPrBUqsUIFvudT/AAAAAElFTkSuQmCC'

function isValidUrl(string) {
  try {
    const trimmed = (string || '').trim()
    if (!trimmed || /\s/.test(trimmed)) return false
    const testUrl = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
    const parsed = new URL(testUrl)
    return Boolean(parsed.hostname && (parsed.hostname.includes('.') || parsed.hostname === 'localhost'))
  } catch {
    return false
  }
}

function areUrlsEquivalent(urlA, urlB) {
  if (!urlA || !urlB) return false
  try {
    const clean = (u) => {
      let str = normalizeUrl(u).toLowerCase().trim()
      try {
        const parsed = new URL(str)
        const host = parsed.hostname.replace(/^www\./, '')
        const pathname = parsed.pathname.replace(/\/+$/, '')
        return `${host}${pathname}${parsed.search}`
      } catch {
        return str.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
      }
    }
    return clean(urlA) === clean(urlB)
  } catch {
    return urlA.trim().toLowerCase() === urlB.trim().toLowerCase()
  }
}

function getTrayIconImage() {
  const possiblePaths = [
    join(__dirname, '../../resources/tray-icon.png'),
    join(__dirname, '../../public/tray-icon.png'),
    join(process.cwd(), 'resources/tray-icon.png'),
    join(process.cwd(), 'public/tray-icon.png')
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return nativeImage.createFromPath(p)
    }
  }
  return nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
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

let cachedIconsDir = null
function getIconsDir() {
  if (!cachedIconsDir) {
    cachedIconsDir = join(app.getPath('userData'), 'icons')
    if (!fs.existsSync(cachedIconsDir)) {
      try {
        fs.mkdirSync(cachedIconsDir, { recursive: true })
      } catch (e) {
        console.error('Failed to create icons directory:', e)
      }
    }
  }
  return cachedIconsDir
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
        fs.promises.writeFile(filePath, pngBuf).catch((e) => {
          console.error('Failed to write icon to disk:', e)
        })

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
    const cheerio = await getCheerio()
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
let isCollapsed = true
let dockSide = 'right'
let isContextMenuOpen = false
const MARGIN = 16

// Centralized Transition Lifecycle State Machine:
// CLOSED -> OPENING -> OPEN -> CLOSING -> CLOSED
let transitionState = 'CLOSED' // 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING'
let collapseFailsafeTimer = null
let openFailsafeTimer = null

function finalizeCollapse() {
  if (collapseFailsafeTimer) {
    clearTimeout(collapseFailsafeTimer)
    collapseFailsafeTimer = null
  }
  if (openFailsafeTimer) {
    clearTimeout(openFailsafeTimer)
    openFailsafeTimer = null
  }
  if (!mainWindow || mainWindow.isDestroyed()) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea
  const savedSettings = getSettings()

  let targetY = savedSettings.collapsedY !== null
    ? savedSettings.collapsedY
    : Math.round(displayY + (screenHeight - COLLAPSED_HEIGHT) / 2)

  targetY = Math.min(
    Math.max(targetY, displayY + 16),
    displayY + screenHeight - COLLAPSED_HEIGHT - 16
  )

  const targetX = dockSide === 'right' ? (displayX + screenWidth - COLLAPSED_WIDTH) : displayX

  transitionState = 'CLOSED'
  isCollapsed = true

  mainWindow.setBounds({
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT
  })

  mainWindow.webContents.send('transition-to', { phase: 'CLOSED', dockSide })
  mainWindow.webContents.send('dock-state-changed', { collapsed: true, dockSide })
}

function requestCollapse() {
  if (transitionState === 'CLOSED' || transitionState === 'CLOSING' || isContextMenuOpen) return
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (openFailsafeTimer) {
    clearTimeout(openFailsafeTimer)
    openFailsafeTimer = null
  }

  transitionState = 'CLOSING'

  mainWindow.webContents.send('transition-to', {
    phase: 'CLOSING',
    dockSide
  })
  mainWindow.webContents.send('request-collapse')

  // Failsafe timer (360ms) ensures window bounds NEVER get stuck if renderer stalls
  if (collapseFailsafeTimer) clearTimeout(collapseFailsafeTimer)
  collapseFailsafeTimer = setTimeout(() => {
    if (transitionState === 'CLOSING') {
      finalizeCollapse()
    }
  }, 360)
}

function collapseWindow() {
  requestCollapse()
}

function expandWindow(targetTab = null) {
  if (transitionState === 'OPEN' || transitionState === 'OPENING') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus()
    }
    return
  }
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (collapseFailsafeTimer) {
    clearTimeout(collapseFailsafeTimer)
    collapseFailsafeTimer = null
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea
  const saved = getSettings()
  const fullW = Math.min(Math.max(saved.windowSize?.width || DEFAULT_WIDTH, MIN_WIDTH), MAX_WIDTH)
  const fullH = Math.min(Math.max(saved.windowSize?.height || DEFAULT_HEIGHT, MIN_HEIGHT), MAX_HEIGHT)

  const windowW = fullW + MARGIN
  const windowH = fullH

  const savedSettings = getSettings()
  const [, currentY] = mainWindow.getPosition()
  const collapsedY = savedSettings.collapsedY !== null ? savedSettings.collapsedY : currentY
  const centerY = collapsedY + Math.round(COLLAPSED_HEIGHT / 2)

  let targetY = centerY - Math.round(fullH / 2)
  targetY = Math.min(
    Math.max(targetY, displayY + 16),
    displayY + screenHeight - fullH - 16
  )

  const targetX = dockSide === 'right'
    ? (displayX + screenWidth - windowW)
    : displayX

  const notchOffsetY = Math.max(collapsedY - targetY, 0)

  transitionState = 'OPENING'
  isCollapsed = false

  mainWindow.setBounds({
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: windowW,
    height: windowH
  })

  if (openFailsafeTimer) clearTimeout(openFailsafeTimer)
  openFailsafeTimer = setTimeout(() => {
    if (transitionState === 'OPENING') {
      transitionState = 'OPEN'
    }
  }, 320)

  mainWindow.webContents.send('transition-to', {
    phase: 'OPENING',
    dockSide,
    targetTab,
    notchOffsetY
  })
  mainWindow.webContents.send('dock-state-changed', { collapsed: false, dockSide, targetTab })
  mainWindow.focus()
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea

  const settings = getSettings()
  dockSide = settings.dockSide || 'right'
  isCollapsed = true

  const targetX = dockSide === 'right' ? (displayX + screenWidth - COLLAPSED_WIDTH) : displayX
  let targetY = settings.collapsedY !== null
    ? settings.collapsedY
    : Math.round(displayY + (screenHeight - COLLAPSED_HEIGHT) / 2)

  targetY = Math.min(
    Math.max(targetY, displayY + 16),
    displayY + screenHeight - COLLAPSED_HEIGHT - 16
  )

  const glassOptions = getGlassWindowOptions()

  mainWindow = new BrowserWindow({
    ...glassOptions,
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT,
    x: Math.round(targetX),
    y: Math.round(targetY),
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
  let moveDebounceTimer = null
  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [winX, winY] = mainWindow.getPosition()
    const [winW, winH] = mainWindow.getSize()
    const pDisplay = screen.getPrimaryDisplay()
    const { x: dX, y: dY, width: sW, height: sH } = pDisplay.workArea
    const midPoint = dX + sW / 2
    const newDockSide = (winX + winW / 2) < midPoint ? 'left' : 'right'

    if (newDockSide !== dockSide) {
      dockSide = newDockSide
      setSetting('dockSide', dockSide)
      mainWindow.webContents.send('dock-state-changed', { collapsed: isCollapsed, dockSide })
    }

    // Performance Optimization: Debounce store writes during dragging to prevent disk I/O thrashing
    if (moveDebounceTimer) clearTimeout(moveDebounceTimer)
    moveDebounceTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!isCollapsed) {
        setSetting('lastPosition', { x: winX, y: winY })
      } else {
        setSetting('collapsedY', winY)
      }
    }, 150)

    if (isCollapsed) {
      // Lock dimensions to COLLAPSED_WIDTH x COLLAPSED_HEIGHT and snap flush to screen edge
      if (moveTimer) clearTimeout(moveTimer)
      moveTimer = setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed() || !isCollapsed) return
        const targetX = dockSide === 'right' ? (dX + sW - COLLAPSED_WIDTH) : dX
        const clampedY = Math.min(Math.max(winY, dY + 16), dY + sH - COLLAPSED_HEIGHT - 16)
        mainWindow.setBounds({
          x: Math.round(targetX),
          y: Math.round(clampedY),
          width: COLLAPSED_WIDTH,
          height: COLLAPSED_HEIGHT
        })
      }, 200)
    }
  })

  // Collapse when user clicks outside the window (blur)
  mainWindow.on('blur', () => {
    if (!isContextMenuOpen && (transitionState === 'OPEN' || transitionState === 'OPENING')) {
      requestCollapse()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.webContents.send('dock-state-changed', { collapsed: true, dockSide })
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

let tray = null

function showNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      const iconPath = join(__dirname, '../../resources/tray-icon.png')
      const notifOptions = {
        title,
        body,
        silent: false
      }
      if (fs.existsSync(iconPath)) {
        notifOptions.icon = iconPath
      }
      const notif = new Notification(notifOptions)
      notif.show()
    }
  } catch (err) {
    console.error('Failed to show notification:', err)
  }
}

function createAndSaveLink(rawUrl, targetTab = null) {
  const url = normalizeUrl(rawUrl)
  const domain = getDomain(url)

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

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('link-added', newLink)
  }

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
}

function saveLinkFromClipboard() {
  const text = clipboard.readText('clipboard').trim()
  if (!text || !isValidUrl(text)) {
    return false
  }

  const normalized = normalizeUrl(text)
  const allLinks = getAllLinks()
  const isDuplicate = allLinks.some((l) => areUrlsEquivalent(l.url, normalized))

  if (isDuplicate) {
    showNotification('SaveLink', 'Already saved')
    return false
  }

  createAndSaveLink(normalized)
  phCapture('link_saved', { total_links: getAllLinks().length })
  showNotification('SaveLink', 'Link saved')
  return true
}

function toggleWidgetVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function openWidget() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  if (isCollapsed) {
    expandWindow()
  } else {
    mainWindow.focus()
  }
}

let updateTrayContextMenu = null

function createTray() {
  const trayImage = getTrayIconImage()
  tray = new Tray(trayImage)
  tray.setToolTip('SaveLink')

  updateTrayContextMenu = function () {
    const isStartAtLogin = getSettings().autoStart !== false

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          openWidget()
        }
      },
      {
        label: 'Save from clipboard',
        click: () => {
          saveLinkFromClipboard()
        }
      },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: isStartAtLogin,
        click: (menuItem) => {
          const val = menuItem.checked
          setSetting('autoStart', val)
          try {
            app.setLoginItemSettings({
              openAtLogin: val,
              path: process.execPath
            })
          } catch (e) {
            console.warn('setLoginItemSettings failed:', e)
          }
          if (updateTrayContextMenu) updateTrayContextMenu()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
  }

  updateTrayContextMenu()

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    if (mainWindow.isVisible()) {
      if (isCollapsed) {
        expandWindow()
      } else {
        mainWindow.focus()
      }
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.savelink.app')
  }

  // ── PostHog: track install (first ever launch) and every app open ──
  const store = getStore()
  const isFirstLaunch = !store.get('deviceId')
  if (isFirstLaunch) {
    phCapture('app_installed')
  }
  phCapture('app_opened', {
    is_first_launch: isFirstLaunch,
    total_links: getAllLinks().length
  })
  // ──────────────────────────────────────────────────────────────────

  // Create Tray Icon near the clock
  createTray()

  // Register Global Shortcuts
  // Primary: Alt+C to save link from clipboard
  globalShortcut.register('Alt+C', () => {
    saveLinkFromClipboard()
  })

  // Fallback / legacy shortcuts
  try {
    globalShortcut.register('CommandOrControl+Alt+S', () => {
      saveLinkFromClipboard()
    })
  } catch (_) {}
  try {
    globalShortcut.register('Super+Alt+S', () => {
      saveLinkFromClipboard()
    })
  } catch (_) {}

  // Ctrl+Alt+L and Win+Alt+L: Show or hide the widget
  globalShortcut.register('CommandOrControl+Alt+L', () => {
    toggleWidgetVisibility()
  })
  try {
    globalShortcut.register('Super+Alt+L', () => {
      toggleWidgetVisibility()
    })
  } catch (err) {
    console.warn('Super+Alt+L registration skipped:', err)
  }

  // 1. Initialize Theme before window creation
  const settings = getSettings()
  const savedMode = settings.theme || 'system'
  nativeTheme.themeSource = savedMode

  // Ensure Auto-Start with Windows is configured according to settings (defaults to true)
  if (settings.autoStart !== false) {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath
      })
    } catch (e) {
      console.warn('Auto-start initialization:', e)
    }
  }

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

  // IPC: Close App (Hides window to tray, keeping background shortcut & tray active)
  ipcMain.on('close-app', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })

  // IPC: Dock & Collapse Handlers
  ipcMain.handle('get-dock-state', () => {
    return { collapsed: transitionState === 'CLOSED', dockSide, phase: transitionState }
  })

  ipcMain.handle('get-transition-state', () => {
    return { phase: transitionState, dockSide, isCollapsed: transitionState === 'CLOSED' }
  })

  ipcMain.handle('notify-opened', () => {
    transitionState = 'OPEN'
    return { phase: 'OPEN' }
  })

  ipcMain.handle('notify-closed', () => {
    finalizeCollapse()
    return { phase: 'CLOSED' }
  })

  ipcMain.handle('expand-window', (_, targetTab) => {
    expandWindow(targetTab)
  })

  ipcMain.handle('collapse-window', () => {
    collapseWindow()
  })

  // IPC: Auto-Start Handlers
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('get-auto-start', () => {
    return getSettings().autoStart !== false
  })

  ipcMain.handle('set-auto-start', (_, enabled) => {
    const val = Boolean(enabled)
    setSetting('autoStart', val)
    try {
      app.setLoginItemSettings({
        openAtLogin: val,
        path: process.execPath
      })
    } catch (e) {
      console.warn('setLoginItemSettings failed:', e)
    }
    if (updateTrayContextMenu) {
      updateTrayContextMenu()
    }
    return val
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
    return createAndSaveLink(rawUrl, targetTab)
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
          if (win && !win.isDestroyed()) {
            win.webContents.send('request-delete-link', id)
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

  // ── Auto Updater Setup ──────────────────────────────────────────────────────
  ipcMain.handle('restart-and-install-update', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('check-for-updates', async () => {
    try {
      const res = await fetch('https://api.github.com/repos/yaagnik-patel/Savelink/releases/latest', {
        headers: { 'User-Agent': 'SaveLink-App' }
      })
      if (!res.ok) return { status: 'up-to-date' }
      const data = await res.json()
      const latestTag = (data.tag_name || '').replace(/^v/, '')
      const currentVer = app.getVersion()

      if (latestTag && latestTag > currentVer) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-downloaded', { version: latestTag })
        }
        return { status: 'update-available', version: latestTag }
      }
      return { status: 'up-to-date' }
    } catch (err) {
      return { status: 'error', message: err?.message }
    }
  })

  function initAutoUpdater() {
    if (!app.isPackaged) return

    autoUpdater.on('update-available', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-available', { version: info?.version })
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-downloaded', { version: info?.version })
      }
    })

    autoUpdater.on('error', (err) => {
      // Silent error logging - never disrupt user
      console.error('[AutoUpdater] Error:', err?.message || err)
    })

    // Initial check delayed by 5 seconds
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)

    // Check periodically every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 4 * 60 * 60 * 1000)
  }

  initAutoUpdater()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
