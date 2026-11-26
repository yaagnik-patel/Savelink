import React, { useState } from 'react'
import './OpenContainer.css'

export default function OpenContainer({
  themeMode,
  onCycleTheme,
  onManualCollapse,
  onClose,
  onOpenSettings,
  tags = ['Work', 'Later'],
  inputValue,
  setInputValue,
  destTab,
  setDestTab,
  activeTab,
  setActiveTab,
  shakeInput,
  handleSaveLink,
  filteredLinks,
  tabCounts,
  inputRef,
  now,
  imageErrors,
  handleOpen,
  handleContextMenu,
  handleCycleTab,
  handleImageError,
  onDropLinkOnTab,
  getCardTheme,
  getDomainColor,
  getInitial
}) {
  const allTabs = ['All', ...tags]
  const [draggingLinkId, setDraggingLinkId] = useState(null)
  const [dragOverTab, setDragOverTab] = useState(null)
  const [dragOverChip, setDragOverChip] = useState(null)

  const listRef = React.useRef(null)
  const [thumbTop, setThumbTop] = useState(0)
  const [canScroll, setCanScroll] = useState(false)

  const updateScrollIndicator = () => {
    const el = listRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll > 6) {
      setCanScroll(true)
      const thumbHeight = 36
      const trackHeight = el.clientHeight - 16
      const maxTop = Math.max(trackHeight - thumbHeight, 0)
      const ratio = Math.min(Math.max(el.scrollTop / maxScroll, 0), 1)
      setThumbTop(ratio * maxTop)
    } else {
      setCanScroll(false)
    }
  }

  React.useEffect(() => {
    updateScrollIndicator()
    window.addEventListener('resize', updateScrollIndicator)
    return () => window.removeEventListener('resize', updateScrollIndicator)
  }, [filteredLinks])

  return (
    <div className="app-container">
      {/* 1. Header Row */}
      <div className="header-row">
        <h1 className="app-title">SaveLink</h1>
        <div className="header-actions">
          {/* Settings Button */}
          <button
            type="button"
            className="icon-btn settings-btn"
            onClick={onOpenSettings}
            title="Settings & Tags"
            aria-label="Settings & Tags"
          >
            <svg
              className="settings-icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* Collapse Button */}
          <button
            type="button"
            className="icon-btn collapse-btn"
            onClick={onManualCollapse}
            title="Collapse to screen edge"
            aria-label="Collapse to screen edge"
          >
            <svg className="icon-svg" viewBox="0 0 24 24">
              <path
                d="M5 12h14"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Theme Switcher Button */}
          <button
            type="button"
            className="icon-btn theme-btn"
            onClick={onCycleTheme}
            title={`Theme: ${themeMode.charAt(0).toUpperCase() + themeMode.slice(1)}`}
            aria-label={`Switch theme (currently ${themeMode})`}
          >
            {themeMode === 'light' ? (
              <svg className="icon-svg" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : themeMode === 'dark' ? (
              <svg className="icon-svg" viewBox="0 0 24 24">
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            ) : (
              <svg className="icon-svg" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
                <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
              </svg>
            )}
          </button>

          {/* Close Button */}
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 2. Acrylic Input Bar to Add Links */}
      <form
        onSubmit={handleSaveLink}
        className={`input-container ${shakeInput ? 'shake' : ''}`}
      >
        <div className="input-bar">
          <span className="input-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="search-svg">
              <path
                d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="link-input"
            placeholder={
              destTab === 'All'
                ? 'Paste link here...'
                : `Paste link into ${destTab}...`
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button
            type="submit"
            className="save-button"
            disabled={!inputValue.trim()}
          >
            Save
          </button>
        </div>

        {/* Tab Destination Selector: user picks where this link will be saved & acts as drop target */}
        <div className="dest-tab-row">
          <span className="dest-tab-label">Save to:</span>
          {allTabs.map((t) => (
            <button
              key={t}
              type="button"
              className={`dest-chip chip-${t.toLowerCase()} ${destTab === t ? 'active' : ''} ${dragOverChip === t ? 'drag-over-target' : ''}`}
              onClick={() => setDestTab(t)}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverChip !== t) setDragOverChip(t)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (dragOverChip === t) setDragOverChip(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const linkId = e.dataTransfer.getData('text/plain') || draggingLinkId
                if (linkId && onDropLinkOnTab) {
                  onDropLinkOnTab(linkId, t)
                }
                setDragOverChip(null)
                setDraggingLinkId(null)
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </form>

      {/* 3. Tabs Row & Drag Drop Filter Pills */}
      <div className="tabs-row">
        {allTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'active' : ''} ${dragOverTab === tab ? 'drag-over-target' : ''}`}
            onClick={() => {
              setActiveTab(tab)
              setDestTab(tab)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverTab !== tab) setDragOverTab(tab)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (dragOverTab === tab) setDragOverTab(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const linkId = e.dataTransfer.getData('text/plain') || draggingLinkId
              if (linkId && onDropLinkOnTab) {
                onDropLinkOnTab(linkId, tab)
              }
              setDragOverTab(null)
              setDraggingLinkId(null)
            }}
          >
            {tab}
            {tabCounts[tab] > 0 && (
              <span className="tab-count">({tabCounts[tab]})</span>
            )}
          </button>
        ))}
      </div>

      {/* 4. Links List Container with Small Floating Scroll Line */}
      <div className="links-list-wrapper">
        <div ref={listRef} className="links-list" onScroll={updateScrollIndicator}>
          {filteredLinks.length === 0 ? (
            <div className="empty-state">
              <p className="empty-text">Paste a link above to get started</p>
            </div>
          ) : (
            filteredLinks.map((link, index) => {
              const isNewest =
                link.createdAt && now - new Date(link.createdAt).getTime() < 60000
              const hasImgError = imageErrors[link.id]
              const isLoading = link.status === 'loading' || link.isLoading
              const isDragging = draggingLinkId === link.id

              return (
                <div
                  key={link.id}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', link.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingLinkId(link.id)
                  }}
                  onDragEnd={() => {
                    setDraggingLinkId(null)
                    setDragOverTab(null)
                    setDragOverChip(null)
                  }}
                  className={`link-card ${getCardTheme(link, index)} ${isNewest ? 'highlight' : ''} ${isDragging ? 'is-dragging' : ''}`}
                  onClick={(e) => handleOpen(link.url, e)}
                  onContextMenu={(e) => handleContextMenu(link, e)}
                >
                  {/* 34px Logo or Letter Tile */}
                  <div className="logo-tile">
                    {!hasImgError && link.logo ? (
                      <img
                        src={link.logo}
                        alt=""
                        className="logo-img"
                        onError={() => handleImageError(link.id)}
                      />
                    ) : (
                      <div
                        className="letter-tile"
                        style={{ backgroundColor: getDomainColor(link.domain) }}
                      >
                        {getInitial(link.title, link.domain)}
                      </div>
                    )}
                  </div>

                  {/* Meta details */}
                  <div className="meta-col">
                    {isLoading ? (
                      <div className="shimmer-skeleton" />
                    ) : (
                      <span className="link-title" title={link.title}>
                        {link.title}
                      </span>
                    )}
                    <div className="domain-row">
                      <span className="link-domain">{link.domain}</span>
                      <button
                        type="button"
                        className={`card-tab-badge badge-${(link.tab || 'All').toLowerCase()}`}
                        onClick={(e) => handleCycleTab(link, e)}
                        title={`Tab: ${link.tab || 'All'}. Click to cycle category.`}
                      >
                        {link.tab || 'All'}
                      </button>
                    </div>
                  </div>

                  {/* Open Button */}
                  <button
                    type="button"
                    className="open-pill"
                    onClick={(e) => handleOpen(link.url, e)}
                    title={`Open ${link.url}`}
                  >
                    Open
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Small Minimal Scroll Line (36px Height) */}
        {canScroll && (
          <div className="mini-scroll-track" aria-hidden="true">
            <div
              className="mini-scroll-thumb"
              style={{
                transform: `translateY(${thumbTop}px)`
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
