import React, { useState } from 'react'
import TopBar from './components/TopBar'
import CampaignHeader from './components/CampaignHeader'
import CampaignSection from './components/CampaignSection'
import BottomBar from './components/BottomBar'
import { mockCampaign } from './data/mockMetrics'
import { mockCoreShows } from './data/mockListings'

export default function App() {
  const [cartCount, setCartCount] = useState(mockCoreShows.length)

  return (
    <div className="campaign-page">
      <TopBar cartCount={cartCount} />
      <main className="campaign-main">
        <CampaignHeader campaign={mockCampaign} />
        <CampaignSection onCartChange={setCartCount} />
      </main>
      <BottomBar cartCount={cartCount} />
    </div>
  )
}
