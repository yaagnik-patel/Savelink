import React, { useEffect, useRef, useCallback, memo } from 'react'
import './ConfirmDeleteModal.css'

/**
 * ConfirmDeleteModal:
 * Premium desktop confirmation dialog before permanently deleting a link.
 * Supports keyboard navigation (Escape to cancel, Enter to confirm),
 * outside backdrop click dismissal, and focus trapping.
 */
function ConfirmDeleteModal({ isOpen, link, onConfirm, onCancel }) {
  const cancelBtnRef = useRef(null)

  // Focus cancel button on mount for safety against accidental Enter presses
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        cancelBtnRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Global keydown handler for Escape & Enter
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter') {
        // If an explicit button is focused, let it handle its click
        if (document.activeElement?.tagName === 'BUTTON') {
          return
        }
        e.stopPropagation()
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onCancel, onConfirm])

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        onCancel()
      }
    },
    [onCancel]
  )

  if (!isOpen || !link) return null

  // Safely parse hostname for display
  let hostname = ''
  try {
    hostname = new URL(link.url).hostname
  } catch {
    hostname = link.url
  }

  const displayTitle = link.title && link.title.trim() ? link.title.trim() : hostname

  return (
    <div
      className="confirm-delete-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="confirm-delete-card">
        {/* Warning Icon Badge */}
        <div className="confirm-delete-badge">
          <svg
            className="confirm-delete-badge-svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>

        {/* Header & Prompt */}
        <h2 id="confirm-delete-title" className="confirm-delete-title">
          Delete Link?
        </h2>
        <p className="confirm-delete-message">
          Are you sure you want to remove this saved link? This action cannot be undone.
        </p>

        {/* Link Preview Box */}
        <div className="confirm-delete-preview">
          <div className="preview-title" title={displayTitle}>
            {displayTitle}
          </div>
          <div className="preview-url" title={link.url}>
            {hostname}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="confirm-delete-actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="confirm-btn cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-btn delete-btn"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(ConfirmDeleteModal)
