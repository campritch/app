import React, { useState } from 'react'

export default function CampaignCard({ show, onRemove, flipped }) {
  const [showPrice, setShowPrice] = useState(false)

  return (
    <article className={`campaign-card ${flipped ? 'campaign-card--flipped' : ''}`} aria-label={`Campaign show: ${show.title}`}>
      {flipped ? (
        <div className="campaign-card__why">
          <p className="campaign-card__why-label">Why it matches:</p>
          <p className="campaign-card__why-text">{show.whyItMatches}</p>
          <button type="button" className="campaign-card__review-btn">Review match</button>
        </div>
      ) : (
        <>
          <div className="campaign-card__top">
            <img
              src={show.image}
              alt=""
              className="campaign-card__thumb"
              width="48"
              height="48"
            />
            <div className="campaign-card__top-info">
              <h4 className="campaign-card__title">{show.title}</h4>
              <div className="campaign-card__top-row">
                <span className="campaign-card__category-pill">{show.category}</span>
                <span className="campaign-card__match">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#0d6832" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  {show.matchScore}%
                </span>
              </div>
              <button
                type="button"
                className="campaign-card__price-toggle"
                onClick={() => setShowPrice(!showPrice)}
                aria-expanded={showPrice}
              >
                {showPrice ? show.price : 'Show price'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  {showPrice
                    ? <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  }
                </svg>
              </button>
            </div>
          </div>

          <div className="campaign-card__metrics">
            <div className="campaign-card__metric">
              <span className="campaign-card__metric-label">EPISODE SIZE</span>
              <span className="campaign-card__metric-value">{show.episodeSize.toLocaleString()}</span>
            </div>
            <div className="campaign-card__metric">
              <span className="campaign-card__metric-label">DEMO MATCH</span>
              <span className="campaign-card__metric-value">{show.demoMatch}%</span>
            </div>
            <div className="campaign-card__metric">
              <span className="campaign-card__metric-label">ROAS EST.</span>
              <span className="campaign-card__metric-value">{show.roasEst}X</span>
            </div>
            <div className="campaign-card__metric">
              <span className="campaign-card__metric-label">INTEREST MATCH</span>
              <span className="campaign-card__metric-value">{show.interestMatch}%</span>
            </div>
          </div>

          <div className="campaign-card__footer">
            <button type="button" className="campaign-card__review-btn">Review match</button>
            <button
              type="button"
              className="campaign-card__remove-btn"
              aria-label={`Remove ${show.title} from campaign`}
              onClick={() => onRemove(show.id)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </>
      )}
    </article>
  )
}
