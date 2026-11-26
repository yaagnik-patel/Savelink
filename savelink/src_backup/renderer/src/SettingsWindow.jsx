import React, { useState } from 'react'
import './SettingsWindow.css'

export default function SettingsWindow({
  isOpen,
  onClose,
  themeMode,
  onSelectTheme,
  tags,
  onAddTag,
  onDeleteTag
}) {
  const [newTagInput, setNewTagInput] = useState('')

  if (!isOpen) return null

  const handleAddSubmit = (e) => {
    e.preventDefault()
    const trimmed = newTagInput.trim()
    if (!trimmed) return
    if (trimmed.toLowerCase() === 'all') return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    onAddTag(trimmed)
    setNewTagInput('')
  }

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="settings-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="settings-window">
        {/* Header */}
        <div className="settings-header">
          <h2 id="settings-title" className="settings-title">
            Settings
          </h2>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            title="Close Settings"
            aria-label="Close Settings"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {/* Section 1: Appearance / Theme Mode */}
          <div className="settings-section">
            <span className="section-label">Appearance Mode</span>
            <p className="section-caption">
              Choose your display appearance or match your Windows OS system.
            </p>
            <div className="theme-options-grid">
              {/* Dark Mode Option */}
              <button
                type="button"
                className={`theme-option-card ${themeMode === 'dark' ? 'active' : ''}`}
                onClick={() => onSelectTheme('dark')}
              >
                <div className="theme-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </div>
                <span className="theme-card-label">Dark</span>
              </button>

              {/* Light Mode Option */}
              <button
                type="button"
                className={`theme-option-card ${themeMode === 'light' ? 'active' : ''}`}
                onClick={() => onSelectTheme('light')}
              >
                <div className="theme-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                </div>
                <span className="theme-card-label">Light</span>
              </button>

              {/* Windows Mode Option */}
              <button
                type="button"
                className={`theme-option-card ${themeMode === 'system' ? 'active' : ''}`}
                onClick={() => onSelectTheme('system')}
              >
                <div className="theme-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" />
                    <rect x="13" y="3" width="8" height="8" rx="1.5" />
                    <rect x="3" y="13" width="8" height="8" rx="1.5" />
                    <rect x="13" y="13" width="8" height="8" rx="1.5" />
                  </svg>
                </div>
                <span className="theme-card-label">Window</span>
              </button>
            </div>
          </div>

          {/* Section 2: Tags Management */}
          <div className="settings-section">
            <span className="section-label">Tags & Categories</span>
            <p className="section-caption">
              Create tags to organize links when saving. Default categories like Work & Later can be extended.
            </p>

            <div className="tags-chips-list">
              <span className="tag-badge badge-system" title="Default master tab">
                All 🔒
              </span>
              {tags.map((tag) => (
                <span key={tag} className="tag-badge">
                  {tag}
                  <button
                    type="button"
                    className="tag-delete-btn"
                    onClick={() => onDeleteTag(tag)}
                    title={`Delete tag ${tag}`}
                    aria-label={`Delete tag ${tag}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* Add Tag Form */}
            <form className="add-tag-form" onSubmit={handleAddSubmit}>
              <input
                type="text"
                className="tag-input"
                placeholder="New tag name..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                maxLength={20}
              />
              <button
                type="submit"
                className="tag-add-btn"
                disabled={!newTagInput.trim()}
              >
                + Add
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
