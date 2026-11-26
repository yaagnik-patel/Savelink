import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import CollapsedWidget from './CollapsedWidget'
import OpenContainer from './OpenContainer'
import SettingsWindow from './SettingsWindow'
import ConfirmDeleteModal from './ConfirmDeleteModal'

const CARD_THEMES = ['theme-indigo', 'theme-magenta', 'theme-yellow', 'theme-green']

// Pre-computed hash cache for domain colors to avoid re-hashing strings repeatedly
const domainColorCache = new Map()
const DOMAIN_PALETTE = [
  '#6A0FFC',
  '#FF00D9',
  '#059669',
  '#CA8A04',
  '#2563EB',
  '#7C3AED',
  '#DB2777'
]

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
  if (domainColorCache.has(domain)) {
    return domainColorCache.get(domain)
  }
  let hash = 0
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = DOMAIN_PALETTE[Math.abs(hash) % DOMAIN_PALETTE.length]
  domainColorCache.set(domain, color)
  return color
}

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

function getInitial(title, domain) {
  const text = (title || domain || 'L').trim()
  return text.charAt(0).toUpperCase() || 'L'
}

function App() {
  const [links, setLinks] = useState([])
  const [tags, setTags] = useState(['Work', 'Later'])
  const [activeTab, setActiveTab] = useState('All')
  const [destTab, setDestTab] = useState('All')
  const [themeMode, setThemeMode] = useState('system')
  const [resolvedTheme, setResolvedTheme] = useState('dark')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [linkToDelete, setLinkToDelete] = useState(null)
  const [imageErrors, setImageErrors] = useState({})
  const [now, setNow] = useState(Date.now())
  const [inputValue, setInputValue] = useState('')
  const [shakeInput, setShakeInput] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(null)
  const [phase, setPhase] = useState('CLOSED') // 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING'
  const [dockSide, setDockSide] = useState('right')
  const [notchOffsetY, setNotchOffsetY] = useState(184)
  const inputRef = useRef(null)

  // Performance Optimization: Only run highlight decay timer when there are active <60s links
  useEffect(() => {
    const hasRecent = links.some(
      (l) => l.createdAt && Date.now() - new Date(l.createdAt).getTime() < 60000
    )
    if (!hasRecent) return

    const timer = setInterval(() => {
      const stillHasRecent = links.some(
        (l) => l.createdAt && Date.now() - new Date(l.createdAt).getTime() < 60000
      )
      if (stillHasRecent) {
        setNow(Date.now())
      }
    }, 10000)

    return () => clearInterval(timer)
  }, [links])

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

    // Fetch transition / dock state
    if (window.api?.getTransitionState) {
      window.api.getTransitionState().then((state) => {
        if (!isMounted || !state) return
        if (state.phase) setPhase(state.phase)
        if (state.dockSide) setDockSide(state.dockSide)
      })
    } else if (window.api?.getDockState) {
      window.api.getDockState().then((state) => {
        if (!isMounted || !state) return
        setPhase(state.collapsed ? 'CLOSED' : 'OPEN')
        setDockSide(state.dockSide || 'right')
      })
    }

    // Subscribe to coordinated transition events from Electron main
    const unsubscribeTransition = window.api?.onTransitionTo?.((data) => {
      if (!data) return
      const { phase: nextPhase, dockSide: newDockSide, targetTab, notchOffsetY: offset } = data
      if (newDockSide) setDockSide(newDockSide)
      if (typeof offset === 'number') setNotchOffsetY(offset)
      if (targetTab) setActiveTab(targetTab)

      if (nextPhase === 'OPENING') {
        setPhase('OPENING')
        setTimeout(() => inputRef.current?.focus(), 140)
      } else if (nextPhase === 'CLOSING') {
        setLinkToDelete(null)
        setPhase('CLOSING')
      } else if (nextPhase === 'CLOSED') {
        setPhase('CLOSED')
      } else if (nextPhase === 'OPEN') {
        setPhase('OPEN')
      }
    })

    // Backwards-compatible dock state change listener
    const unsubscribeDock = window.api?.onDockStateChanged?.((state) => {
      if (!state) return
      if (state.dockSide) setDockSide(state.dockSide)
      if (state.targetTab) setActiveTab(state.targetTab)
      if (state.collapsed) {
        setPhase('CLOSED')
      }
    })

    // Backwards-compatible request collapse listener
    const unsubscribeRequestCollapse = window.api?.onRequestCollapse?.(() => {
      setLinkToDelete(null)
      setPhase('CLOSING')
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

    // Subscribe to newly added links (e.g. from global shortcut or tray)
    const unsubscribeAdded = window.api?.onLinkAdded?.((newLink) => {
      setLinks((prev) => [newLink, ...prev.filter((item) => item.id !== newLink.id)])
    })

    // Subscribe to context-menu deletion
    const unsubscribeDeleted = window.api?.onLinkDeleted?.((deletedId) => {
      setLinks((prev) => prev.filter((item) => item.id !== deletedId))
    })

    // Subscribe to context-menu delete confirmation request
    const unsubscribeReqDelete = window.api?.onRequestDeleteLink?.((id) => {
      setLinks((currentLinks) => {
        const target = currentLinks.find((l) => l.id === id)
        if (target) {
          setLinkToDelete(target)
        }
        return currentLinks
      })
    })

    // Subscribe to background update downloaded notification
    const unsubscribeUpdate = window.api?.onUpdateDownloaded?.((info) => {
      setUpdateDownloaded(info || { version: '' })
    })

    return () => {
      isMounted = false
      if (typeof unsubscribeTransition === 'function') unsubscribeTransition()
      if (typeof unsubscribeDock === 'function') unsubscribeDock()
      if (typeof unsubscribeRequestCollapse === 'function') unsubscribeRequestCollapse()
      if (typeof unsubscribeTheme === 'function') unsubscribeTheme()
      if (typeof unsubscribeLink === 'function') unsubscribeLink()
      if (typeof unsubscribeDeleted === 'function') unsubscribeDeleted()
      if (typeof unsubscribeReqDelete === 'function') unsubscribeReqDelete()
      if (typeof unsubscribeAdded === 'function') unsubscribeAdded()
      if (typeof unsubscribeUpdate === 'function') unsubscribeUpdate()
    }
  }, [])

  // Explicitly select theme mode (Dark, Light, Window/System)
  const handleSelectTheme = useCallback(async (mode) => {
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
  }, [])

  // Cycle Theme: System -> Light -> Dark -> System
  const handleCycleTheme = useCallback(async () => {
    const cycle = { system: 'light', light: 'dark', dark: 'system' }
    const nextMode = cycle[themeMode] || 'system'
    await handleSelectTheme(nextMode)
  }, [themeMode, handleSelectTheme])

  // Tags Management: Add & Delete custom tags
  const handleAddTag = useCallback(async (newTag) => {
    const trimmed = (newTag || '').trim()
    if (!trimmed || trimmed.toLowerCase() === 'all') return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    const updated = [...tags, trimmed]
    setTags(updated)
    if (window.api?.setTags) {
      await window.api.setTags(updated)
    }
  }, [tags])

  const handleDeleteTag = useCallback(async (tagToDelete) => {
    const updated = tags.filter((t) => t !== tagToDelete)
    setTags(updated)
    if (window.api?.setTags) {
      await window.api.setTags(updated)
    }
    setActiveTab((prev) => (prev === tagToDelete ? 'All' : prev))
    setDestTab((prev) => (prev === tagToDelete ? 'All' : prev))
  }, [tags])

  const handleManualCollapse = useCallback(() => {
    if (phase === 'CLOSED' || phase === 'CLOSING') return
    setLinkToDelete(null)
    setPhase('CLOSING')
    window.api?.collapseWindow?.()
  }, [phase])

  const handleClose = useCallback(() => {
    handleManualCollapse()
  }, [handleManualCollapse])

  const handleExpand = useCallback((targetTab = null) => {
    if (phase === 'OPEN' || phase === 'OPENING') return
    if (targetTab) {
      setActiveTab(targetTab)
    }
    window.api?.expandWindow?.(targetTab)
  }, [phase])

  const handleAnimationComplete = useCallback(async (completedPhase) => {
    if (completedPhase === 'OPENING') {
      setPhase('OPEN')
      window.api?.notifyOpened?.()
    } else if (completedPhase === 'CLOSING') {
      try {
        if (window.api?.notifyClosed) {
          await window.api.notifyClosed()
        }
      } catch (err) {
        console.error('Failed to notify closed:', err)
      } finally {
        setPhase('CLOSED')
      }
    }
  }, [])

  // Handle saving link from input bar
  const handleSaveLink = useCallback(async (e) => {
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
  }, [inputValue, destTab])

  // Open link in default browser
  const handleOpen = useCallback((url, e) => {
    if (e) e.stopPropagation()
    window.api?.openLink?.(url)
  }, [])

  // Request delete confirmation before deleting
  const handleDeleteLink = useCallback((linkOrId, e) => {
    if (e) e.stopPropagation()
    if (!linkOrId) return
    const target =
      typeof linkOrId === 'object'
        ? linkOrId
        : links.find((l) => l.id === linkOrId)
    if (target) {
      setLinkToDelete(target)
    }
  }, [links])

  // Confirm delete handler (called from ConfirmDeleteModal)
  const handleConfirmDelete = useCallback(async () => {
    if (!linkToDelete) return
    const id = linkToDelete.id
    try {
      if (window.api?.deleteLink) {
        const updated = await window.api.deleteLink(id)
        if (updated) {
          setLinks(updated)
        } else {
          setLinks((prev) => prev.filter((item) => item.id !== id))
        }
      } else {
        setLinks((prev) => prev.filter((item) => item.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete link:', err)
    } finally {
      setLinkToDelete(null)
    }
  }, [linkToDelete])

  // Cancel delete handler
  const handleCancelDelete = useCallback(() => {
    setLinkToDelete(null)
  }, [])

  const handleRestartUpdate = useCallback(() => {
    if (window.api?.restartAndInstallUpdate) {
      window.api.restartAndInstallUpdate()
    }
  }, [])

  // Open native Electron context menu
  const handleContextMenu = useCallback((link, e) => {
    e.preventDefault()
    e.stopPropagation()
    window.api?.showLinkContextMenu?.({
      id: link.id,
      url: link.url,
      currentTab: link.tab
    })
  }, [])

  // Cycle tab badge directly on card: All -> Work -> Later -> [Custom Tags] -> All
  const handleCycleTab = useCallback(async (link, e) => {
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
  }, [tags])

  // Drag & Drop: move link to target tab category
  const handleDropLinkOnTab = useCallback(async (linkId, targetTab) => {
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
  }, [])

  const handleImageError = useCallback((id) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }))
  }, [])

  // Filter links according to active tab
  const filteredLinks = useMemo(() => {
    if (activeTab === 'All') return links
    return links.filter((link) => link.tab === activeTab)
  }, [links, activeTab])

  // Count links per tab for badge indicators
  const tabCounts = useMemo(() => {
    const counts = { All: links.length }
    for (let i = 0; i < tags.length; i++) {
      counts[tags[i]] = 0
    }
    for (let i = 0; i < links.length; i++) {
      const t = links[i].tab
      if (t && t !== 'All') {
        counts[t] = (counts[t] || 0) + 1
      }
    }
    return counts
  }, [links, tags])

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  return (
    <>
      {phase === 'CLOSED' ? (
        <CollapsedWidget
          dockSide={dockSide}
          activeTab={activeTab}
          destTab={destTab}
          onExpand={handleExpand}
          resolvedTheme={resolvedTheme}
        />
      ) : (
        <OpenContainer
          dockSide={dockSide}
          phase={phase}
          isEntering={phase === 'OPENING'}
          isClosing={phase === 'CLOSING'}
          notchOffsetY={notchOffsetY}
          onAnimationComplete={handleAnimationComplete}
          themeMode={themeMode}
          onCycleTheme={handleCycleTheme}
          onManualCollapse={handleManualCollapse}
          onClose={handleClose}
          onOpenSettings={handleOpenSettings}
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
          handleDeleteLink={handleDeleteLink}
          handleContextMenu={handleContextMenu}
          handleCycleTab={handleCycleTab}
          handleImageError={handleImageError}
          onDropLinkOnTab={handleDropLinkOnTab}
          getCardTheme={getCardTheme}
          getDomainColor={getDomainColor}
          getInitial={getInitial}
          updateDownloaded={updateDownloaded}
          onRestartUpdate={handleRestartUpdate}
        />
      )}

      {/* Settings Modal Window (Centered Popup) */}
      <SettingsWindow
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        themeMode={themeMode}
        onSelectTheme={handleSelectTheme}
        tags={tags}
        onAddTag={handleAddTag}
        onDeleteTag={handleDeleteTag}
      />

      {/* Confirmation Modal before deleting link */}
      <ConfirmDeleteModal
        isOpen={Boolean(linkToDelete)}
        link={linkToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  )
}

export default App
