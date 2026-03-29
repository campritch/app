import React from 'react'

export default function AddonRow({ show, onAdd }) {
  return (
    <div className="addon-row" aria-label={`Add-on show: ${show.title}`}>
      <img
        src={show.image}
        alt=""
        className="addon-row__thumb"
        width="52"
        height="52"
      />

      <div className="addon-row__info">
        <div className="addon-row__title-row">
          <span className="addon-row__title">{show.title}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
        <div className="addon-row__cats">
          {show.categories.map((cat) => (
            <span key={cat} className="addon-row__cat-pill">{cat}</span>
          ))}
        </div>
      </div>

      <div className="addon-row__impressions">
        <span className="addon-row__impressions-label">EST IMPRESSIONS</span>
        <span className="addon-row__impressions-value">{show.impressions.toLocaleString()}</span>
      </div>

      <p className="addon-row__desc">{show.description}</p>

      <div className="addon-row__pricing">
        <span className="addon-row__save-badge">Save {show.savePct}%</span>
        <span className="addon-row__price-old">{show.originalPrice}</span>
        <span className="addon-row__price-new">{show.discountedPrice}</span>
      </div>

      <div className="addon-row__actions">
        <button type="button" className="addon-row__review-btn">Review match</button>
        <button
          type="button"
          className="addon-row__add-btn"
          onClick={() => onAdd(show)}
          aria-label={`Add ${show.title} to campaign`}
        >
          + Add
        </button>
      </div>
    </div>
  )
}
