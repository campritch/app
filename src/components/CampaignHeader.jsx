import React, { useState } from 'react'

export default function CampaignHeader({ campaign }) {
  const [expanded, setExpanded] = useState(false)

  const shortDesc = campaign.description.slice(0, 120)
  const isLong = campaign.description.length > 120

  return (
    <section className="campaign-header" aria-label="Campaign overview">
      <div className="campaign-header__left">
        <img
          src={campaign.brandLogo}
          alt={campaign.brandName}
          className="campaign-header__logo"
          width="112"
          height="112"
        />
        <div className="campaign-header__info">
          <h1 className="campaign-header__title">Build your campaign</h1>
          <p className="campaign-header__desc">
            {expanded || !isLong ? campaign.description : shortDesc + '…'}
            {isLong && (
              <button
                type="button"
                className="campaign-header__show-more"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </p>
          <div className="campaign-header__actions">
            <button type="button" className="campaign-header__share-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
            <span className="campaign-header__saved">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Campaign · Saved
            </span>
          </div>
        </div>
      </div>

      <div className="campaign-header__stats">
        <div className="campaign-stat campaign-stat--light">
          <span className="campaign-stat__label">Impressions</span>
          <span className="campaign-stat__value">{campaign.impressions.toLocaleString()}</span>
        </div>
        <div className="campaign-stat campaign-stat--dark">
          <span className="campaign-stat__label">Your Potential Sales</span>
          <span className="campaign-stat__value">${campaign.potentialSales.toLocaleString()}</span>
        </div>
        <div className="campaign-stat campaign-stat--light">
          <span className="campaign-stat__label">Est. ROAS</span>
          <span className="campaign-stat__value">{campaign.estROAS}x</span>
        </div>
        <div className="campaign-stat campaign-stat--light">
          <span className="campaign-stat__label">Estimated Spend</span>
          <span className="campaign-stat__value">${campaign.estimatedSpend.toLocaleString()}</span>
        </div>
      </div>
    </section>
  )
}
