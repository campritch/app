import React from 'react'

export default function BottomBar({ cartCount }) {
  if (cartCount === 0) return null

  return (
    <div className="bottom-bar" role="complementary" aria-label="Campaign checkout">
      <div className="bottom-bar__inner">
        <div className="bottom-bar__left">
          <h3 className="bottom-bar__title">Start your campaign</h3>
          <p className="bottom-bar__subtitle">Add shows to your campaign and checkout</p>
        </div>
        <div className="bottom-bar__right">
          <span className="bottom-bar__count">{cartCount} shows added to cart</span>
          <button type="button" className="bottom-bar__launch-btn">
            Launch Campaign
          </button>
        </div>
      </div>
    </div>
  )
}
