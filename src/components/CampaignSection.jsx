import React, { useState } from 'react'
import CampaignCard from './CampaignCard'
import AddonRow from './AddonRow'
import { mockCoreShows, mockAddonShows } from '../data/mockListings'
import { mockCampaign } from '../data/mockMetrics'

// The 4th card in the first row shows the "Why it matches" flip — index 3
const WHY_CARD_INDEX = 3

export default function CampaignSection({ onCartChange }) {
  const [coreShows, setCoreShows] = useState(mockCoreShows)
  const [addonSearch, setAddonSearch] = useState('')

  const filteredAddons = mockAddonShows.filter(
    (s) =>
      !coreShows.find((c) => c.id === s.id) &&
      (addonSearch.trim() === '' ||
        s.title.toLowerCase().includes(addonSearch.toLowerCase()) ||
        s.categories.some((c) => c.toLowerCase().includes(addonSearch.toLowerCase())))
  )

  function handleRemove(id) {
    const updated = coreShows.filter((s) => s.id !== id)
    setCoreShows(updated)
    onCartChange(updated.length)
  }

  function handleAdd(show) {
    const coreShow = {
      ...show,
      type: 'core',
      category: show.categories[0],
      matchScore: 80,
      episodeSize: show.impressions,
      demoMatch: 75,
      roasEst: 2.4,
      interestMatch: 78,
      price: show.discountedPrice,
    }
    const updated = [...coreShows, coreShow]
    setCoreShows(updated)
    onCartChange(updated.length)
  }

  return (
    <>
      {/* ── CORE CAMPAIGN SECTION ─────────────────────────────── */}
      <section className="core-section" aria-labelledby="core-heading">
        <div className="core-section__header">
          <h2 id="core-heading" className="core-section__title">
            <span className="core-section__count">{coreShows.length}</span> shows included in campaign
          </h2>
          <span className="core-section__analyzed">
            {mockCampaign.showsAnalyzed.toLocaleString()} analyzed
          </span>
        </div>

        <div className="core-grid" role="list">
          {coreShows.map((show, index) => (
            <div key={show.id} role="listitem">
              <CampaignCard
                show={show}
                onRemove={handleRemove}
                flipped={index === WHY_CARD_INDEX && !!show.whyItMatches}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── ADD-ONS / FLASH SALES SECTION ─────────────────────── */}
      <section className="addon-section" aria-labelledby="addon-heading">
        <div className="addon-section__inner">
          <div className="addon-section__header">
            <div className="addon-section__header-left">
              <h2 id="addon-heading" className="addon-section__title">
                Add more shows to your campaign
              </h2>
              <span className="addon-section__flash-badge">
                🔥 FLASH SALES
              </span>
            </div>
            <div className="addon-section__search-wrap">
              <input
                type="search"
                className="addon-section__search"
                placeholder="Quick add shows"
                value={addonSearch}
                onChange={(e) => setAddonSearch(e.target.value)}
                aria-label="Quick add shows"
              />
              <button type="button" className="addon-section__search-btn" aria-label="Search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
          </div>
          <p className="addon-section__subtitle">
            Recommended shows at reduced rates — limited availability.
          </p>

          <div className="addon-list" role="list">
            {filteredAddons.map((show) => (
              <div key={show.id} role="listitem" className="addon-list__item">
                <AddonRow show={show} onAdd={handleAdd} />
              </div>
            ))}
            {filteredAddons.length === 0 && (
              <p className="addon-section__empty">All available shows have been added to your campaign.</p>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
