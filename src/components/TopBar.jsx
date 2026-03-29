import React from 'react'
import { mockCampaign } from '../data/mockMetrics'

export default function TopBar({ cartCount = 0 }) {
  return (
    <header className="top-bar" role="banner">
      <a href="#" className="top-bar__logo" aria-label="SpotsNow home">
        {/* SpotsNow wordmark */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="#ff6b6b" />
          <circle cx="10" cy="10" r="4" fill="#fff" />
        </svg>
        <span>SpotsNow</span>
      </a>

      {/* URL + targeting pill */}
      <div className="top-bar__url-pill">
        <span className="top-bar__url-name">{mockCampaign.targetUrl}</span>
        <span className="top-bar__url-targeting">{mockCampaign.targeting}</span>
      </div>

      <nav className="top-bar__actions" aria-label="Campaign actions">
        {/* Filter */}
        <button type="button" className="top-bar__icon-btn" aria-label="Filters">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          <span className="top-bar__badge">5</span>
        </button>

        {/* Cart */}
        <button type="button" className="top-bar__icon-btn" aria-label={`Cart, ${cartCount} items`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && <span className="top-bar__badge top-bar__badge--coral">{cartCount}</span>}
        </button>

        <button type="button" className="top-bar__login-btn">Login</button>

        {/* Hamburger */}
        <button type="button" className="top-bar__icon-btn" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </nav>
    </header>
  )
}
