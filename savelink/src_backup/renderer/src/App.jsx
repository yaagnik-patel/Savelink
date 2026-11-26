import React, { useState, useEffect, useMemo, useRef } from 'react'
import CollapsedWidget from './CollapsedWidget'
import OpenContainer from './OpenContainer'
import SettingsWindow from './SettingsWindow'

const CARD_THEMES = ['theme-indigo', 'theme-magenta', 'theme-yellow', 'theme-green']

function getCardTheme(link, index) {
  if (typeof index === 'number') {
    return CARD_THEMES[index % CARD_THEMES.length]
  }
  const key = link.id || link.domain || link.url || ''
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CARD_THEMES[Math.abs(hash) % CARD_THEMES.length]
}

function getDomainColor(domain) {
  if (!domain) return '#6A0FFC'
  const colors = [
    '#6A0FFC',
    '#FF00D9',
    '#059669',
    '#CA8A04',
    '#2563EB',
    '#7C3AED',
    '#DB2777'
  ]
  let hash = 0
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

function isValidUrl(string) {
  try {
    const trimmed = (string || '').trim()
    if (!trimmed) return false
    const testUrl = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed
    const parsed = new URL(testUrl)
    return Boolean(parsed.hostname && parsed.hostname.includes('.'))
  } catch {
    return false
  }
}

function App() {
  const [links, setLinks] = useState([])
  const [tags, setTags] = useState(['Work', 'Later'])
  const [activeTab, setActiveTab] = useState('All')
  const [destTab, setDestTab] = useState('All')
  const [themeMode, setThemeMode] = useState('system')
  const [resolvedTheme, setResolvedTheme] = useState('dark')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [imageErrors, setImageErrors] = useState({})
  const [now, setNow] = useState(Date.now())
  const [inputValue, setInputValue] = useState('')
  const [shakeInput, setShakeInput] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [dockSide, setDockSide] = useState('right')
  const inputRef = useRef(null)

  // Keep 'now' updated every 10 seconds to refresh the 60s highlight status
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])

  // Initialize Theme, Dock state, Tags & Load Links
  useEffect(() => {
    let isMounted = true

    // Fetch theme
    if (window.api?.getTheme) {
      window.api.getTheme().then(({ mode, resolved }) => {
        if (!isMounted) return
        setThemeMode(mode)
        setResolvedTheme(resolved)
        document.documentElement.dataset.theme = resolved
      })
    }

    // Fetch tags
    if (window.api?.getTags) {
      window.api.getTags().then((storedTags) => {
        if (!isMounted) return
        if (Array.isArray(storedTags) && storedTags.length > 0) {
          setTags(storedTags)
        }
      })
    }

    // Fetch dock state
    if (window.api?.getDockState) {
      window.api.getDockState().then((state) => {
        if (!isMounted || !state) return
        setIsCollapsed(Boolean(state.collapsed))
        setDockSide(state.dockSide || 'right')
      })
    }

    // Subscribe to dock state change (blur collapse or expand)
    const unsubscribeDock = window.api?.onDockStateChanged?.((state) => {
      setIsCollapsed(Boolean(state.collapsed))
      if (state.dockSide) setDockSide(state.dockSide)
      if (state.targetTab) setActiveTab(state.targetTab)
      if (!state.collapsed) {
        setTimeout(() => inputRef.current?.focus(), 150)
      }
    })

    // Subscribe to live theme updates (nativeTheme changes)
    const unsubscribeTheme = window.api?.onThemeChanged?.(({ mode, resolved }) => {
      setThemeMode(mode)
      setResolvedTheme(resolved)
      document.documentElement.dataset.theme = resolved
    })

    // Fetch saved links
    if (window.api?.getLinks) {
      window.api.getLinks().then((stored) => {
        if (isMounted && Array.isArray(stored)) {
          setLinks(stored)
        }
      })
    }

    // Subscribe to background link updates
    const unsubscribeLink = window.api?.onLinkUpdated?.((updatedLink) => {
      setLinks((prev) =>
        prev.map((item) => (item.id === updatedLink.id ? updatedLink : item))
      )
    })

    // Subscribe to context-menu deletion
    const unsubscribeDeleted = window.api?.onLinkDeleted?.((deletedId) => {
      setLinks((prev) => prev.filter((item) => item.id !== deletedId))
    })

    return () => {
      isMounted = false
      if (typeof unsubscribeDock === 'function') unsubscribeDock()
      if (typeof unsubscribeTheme === 'function') unsubscribeTheme()
      if (typeof unsubscribeLink === 'function') unsubscribeLink()
      if (typeof unsubscribeDeleted === 'function') unsubscribeDeleted()
    }
  }, [])

  // Explicitly select theme mode (Dark, Light, Window/System)
  const handleSelectTheme = async (mode) => {
    if (window.api?.setTheme) {
      const res = await window.api.setTheme(mode)
      if (res) {
        setThemeMode(res.mode)
        setResolvedTheme(res.resolved)
        document.documentElement.dataset.theme = res.resolved
      }
    } else {
      setThemeMode(mode)
      const res = mode === 'system' ? 'dark' : mode
      setResolvedTheme(res)
      document.documentElement.dataset.theme = res
    }
  }

  // Cycle Theme: System -> Light -> Dark -> System
  const handleCycleTheme = async () => {
    const cycle = { system: 'light', light: 'dark', dark: 'system' }
    const nextMode = cycle[themeMode] || 'system'
    await handleSelectTheme(nextMode)
  }

  // Tags Management: Add & Delete custom tags
  const handleAddTag = async (newTag) => {
    const trimmed = (newTag || '').trim()
    if (!trimmed || trimmed.toLowerCase() === 'all') return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    const updated = [...tags, trimmed]
    setTags(updated)
    if (window.api?.setTags) {
      await window.api.setTags(updated)
    }
  }

  const handleDeleteTag = async (tagToDelete) => {
    const updated = tags.filter((t) => t !== tagToDelete)
    setTags(updated)
    if (window.api?.setTags) {
      await window.api.setTags(updated)
    }
    if (activeTab === tagToDelete) setActiveTab('All')
    if (destTab === tagToDelete) setDestTab('All')
  }

  const handleClose = () => {
    window.api?.closeApp?.()
  }

  const handleManualCollapse = () => {
    setIsCollapsed(true)
    window.api?.collapseWindow?.()
  }

  const handleExpand = (targetTab = null) => {
    if (targetTab) {
      setActiveTab(targetTab)
    }
    setIsCollapsed(false)
    window.api?.expandWindow?.(targetTab)
  }

  // Handle saving link from input bar
  const handleSaveLink = async (e) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return

    if (!isValidUrl(trimmed)) {
      setShakeInput(true)
      setTimeout(() => setShakeInput(false), 600)
      return
    }

    if (window.api?.addLink) {
      const selectedTab = destTab === 'All' ? null : destTab
      const newLink = await window.api.addLink(trimmed, selectedTab)
      if (newLink) {
        setLinks((prev) => [newLink, ...prev.filter((l) => l.url !== newLink.url)])
        setInputValue('')
        if (selectedTab) {
          setActiveTab(selectedTab)
        }
      }
    }
  }

  // Open link in default browser
  const handleOpen = (url, e) => {
    if (e) e.stopPropagation()
    window.api?.openLink?.(url)
  }

  // Open native Electron context menu
  const handleContextMenu = (link, e) => {
    e.preventDefault()
    e.stopPropagation()
    window.api?.showLinkContextMenu?.({
      id: link.id,
      url: link.url,
      currentTab: link.tab
    })
  }

  // Cycle tab badge directly on card: All -> Work -> Later -> [Custom Tags] -> All
  const handleCycleTab = async (link, e) => {
    e.stopPropagation()
    const allCycle = ['All', ...tags]
    const current = link.tab || 'All'
    const curIdx = allCycle.indexOf(current)
    const nextIdx = curIdx >= 0 ? (curIdx + 1) % allCycle.length : 0
    const next = allCycle[nextIdx] === 'All' ? null : allCycle[nextIdx]

    if (window.api?.updateLinkTab) {
      const updated = await window.api.updateLinkTab(link.id, next)
      if (updated) {
        setLinks((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        )
      }
    }
  }

  // Drag & Drop: move link to target tab category
  const handleDropLinkOnTab = async (linkId, targetTab) => {
    const nextTab = targetTab === 'All' ? null : targetTab
    if (window.api?.updateLinkTab) {
      const updated = await window.api.updateLinkTab(linkId, nextTab)
      if (updated) {
        setLinks((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        )
      }
    } else {
      setLinks((prev) =>
        prev.map((item) => (item.id === linkId ? { ...item, tab: nextTab } : item))
      )
    }
  }

  const handleImageError = (id) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }))
  }

  // Filter links according to active tab
  const filteredLinks = useMemo(() => {
    if (activeTab === 'All') return links
    return links.filter((link) => link.tab === activeTab)
  }, [links, activeTab])

  const getInitial = (title, domain) => {
    const text = (title || domain || 'L').trim()
    return text.charAt(0).toUpperCase() || 'L'
  }

  // Count links per tab for badge indicators
  const tabCounts = useMemo(() => {
    const counts = { All: links.length }
    tags.forEach((t) => {
      counts[t] = 0
    })
    links.forEach((l) => {
      if (l.tab && l.tab !== 'All') {
        counts[l.tab] = (counts[l.tab] || 0) + 1
      }
    })
    return counts
  }, [links, tags])

  return (
    <>
      {isCollapsed ? (
        <CollapsedWidget
          dockSide={dockSide}
          activeTab={activeTab}
          destTab={destTab}
          onExpand={handleExpand}
          resolvedTheme={resolvedTheme}
        />
      ) : (
        <OpenContainer
          themeMode={themeMode}
          onCycleTheme={handleCycleTheme}
          onManualCollapse={handleManualCollapse}
          onClose={handleClose}
          onOpenSettings={() => setIsSettingsOpen(true)}
          tags={tags}
          inputValue={inputValue}
          setInputValue={setInputValue}
          destTab={destTab}
          setDestTab={setDestTab}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          shakeInput={shakeInput}
          handleSaveLink={handleSaveLink}
          filteredLinks={filteredLinks}
          tabCounts={tabCounts}
          inputRef={inputRef}
          now={now}
          imageErrors={imageErrors}
          handleOpen={handleOpen}
          handleContextMenu={handleContextMenu}
          handleCycleTab={handleCycleTab}
          handleImageError={handleImageError}
          onDropLinkOnTab={handleDropLinkOnTab}
          getCardTheme={getCardTheme}
          getDomainColor={getDomainColor}
          getInitial={getInitial}
        />
      )}

      {/* Settings Modal Window (Centered Popup) */}
      <SettingsWindow
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onSelectTheme={handleSelectTheme}
        tags={tags}
        onAddTag={handleAddTag}
        onDeleteTag={handleDeleteTag}
      />
    </>
  )
}

export default App
