import React, { useMemo } from 'react'
import './CollapsedWidget.css'

/**
 * Performance-optimized CollapsedWidget:
 * - Wrapped in React.memo to prevent unnecessary re-renders when parent state changes.
 * - SVG path string memoized to avoid recalculation on unrelated renders.
 */
function CollapsedWidget({
  dockSide,
  activeTab,
  destTab,
  onExpand,
  resolvedTheme = 'dark'
}) {
  const isLight = resolvedTheme === 'light'

  // Mirrored SVG notch tab: 56px wide x 152px tall (All & Add buttons only), identical 20px flares
  const pathD = useMemo(() => {
    return dockSide === 'left'
      ? 'M 0 0 A 20 20 0 0 0 20 20 L 36 20 A 20 20 0 0 1 56 40 L 56 112 A 20 20 0 0 1 36 132 L 20 132 A 20 20 0 0 0 0 152 Z'
      : 'M 56 0 A 20 20 0 0 1 36 20 L 20 20 A 20 20 0 0 0 0 40 L 0 112 A 20 20 0 0 0 20 132 L 36 132 A 20 20 0 0 1 56 152 Z'
  }, [dockSide])

  return (
    <div
      className={`collapsed-capsule dock-${dockSide}`}
      title="Drag to reposition, click an icon to open"
    >
      {/* 1. SVG Notch Surface (Solid Black #000000 / White in light mode) */}
      <svg
        className="tab-shape-svg"
        viewBox="0 0 56 152"
        aria-hidden="true"
      >
        <path
          d={pathD}
          fill={isLight ? '#ffffff' : '#000000'}
          stroke="none"
        />
      </svg>

      {/* 2. Top Drag Handle Grip Zone */}
      <div className="capsule-drag-handle" title="Drag to reposition" />

      {/* 3. Action Icon: All Links */}
      <div className="capsule-icons-list">
        <button
          type="button"
          className={`capsule-icon-btn ${activeTab === 'All' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onExpand('All')
          }}
          title="All Links"
          aria-label="All Links"
        >
          <svg viewBox="0 0 24 24" className="capsule-svg">
            <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" fill="currentColor" />
            <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" fill="currentColor" />
            <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" fill="currentColor" />
            <rect x="14" y="14" width="6.5" height="6.5" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* 4. Add Link Button: #8ab4ff background, black icon, soft glow */}
      <button
        type="button"
        className="capsule-add-btn"
        onClick={(e) => {
          e.stopPropagation()
          onExpand(destTab !== 'All' ? destTab : null)
        }}
        title="Add Link"
        aria-label="Add Link"
      >
        <svg viewBox="0 0 24 24" className="capsule-svg">
          <line
            x1="12"
            y1="5"
            x2="12"
            y2="19"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="5"
            y1="12"
            x2="19"
            y2="12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

export default React.memo(CollapsedWidget)
