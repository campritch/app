(function () {
  'use strict';

  var mockMetrics = {
    impressions: '---',
    clicks: '---',
    addedToCart: '---',
    requests: '---',
    totalEarned: '---'
  };

  var mockListings = [
    { id: '1', title: 'Daily Stoic', episodes: '30K per episode', cpm: '$22 CPM', cpmOld: '$27 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=1', category: 'Health', daysToBuy: '5 Days to Buy', dai: 'DAI', stats: ['USA only', '58% Male', '18-24yo', '2x Mid roll'], status: 'live' },
    { id: '2', title: 'Daily Stoic', episodes: '30K per episode', cpm: '$22 CPM', cpmOld: '$27 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=2', category: 'Health', daysToBuy: '5 Days to Buy', dai: 'DAI', stats: ['USA only', '2.5M', '58% Male', '18-24yo', '2x Mid roll'], status: 'hidden' },
    { id: '3', title: 'Daily Stoic', episodes: '30K per episode', cpm: '$22 CPM', cpmOld: '$27 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=3', category: 'Health', daysToBuy: '5 Days to Buy', dai: 'DAI', stats: ['USA only', '58% Male', '18-24yo', '2x Mid roll'], status: 'live' },
    { id: '4', title: 'Primetime Travel', episodes: '45K per episode', cpm: '$28 CPM', cpmOld: '$32 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=4', category: 'Business', daysToBuy: '7 Days to Buy', dai: 'DAI', stats: ['Global', '2.5M', '55% Male', '25-34yo', '1x Pre-roll'], status: 'live' },
    { id: '5', title: 'NFL Bash', episodes: '100K per episode', cpm: '$35 CPM', cpmOld: '$40 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=5', category: 'Sports', daysToBuy: '3 Days to Buy', dai: 'DAI', stats: ['USA only', '5M', '62% Male', '18-34yo', '2x Mid roll'], status: 'live' },
    { id: '6', title: 'Tech Talk Daily', episodes: '20K per episode', cpm: '$18 CPM', cpmOld: '$24 CPM', image: 'https://placehold.co/60x60/e7e7e7/707481?text=6', category: 'Technology', daysToBuy: '10 Days to Buy', dai: 'DAI', stats: ['USA only', '58% Male', '25-44yo', '1x Post-roll'], status: 'live' }
  ];

  var FILTER_TABS = ['All', 'YouTubers', 'Podcasts', 'Agencies', 'Brands'];

  var searchInput = document.getElementById('listings-search');
  var typeTabButtons = document.querySelectorAll('.listings-tab');
  var gridEl = document.getElementById('listings-grid');
  var showLiveOnly = true;

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderListingCard(listing, cardId) {
    var isOn = listing.status === 'live';
    var showAsHidden = listing.status === 'hidden' || !isOn;
    var imgSrc = (listing.image && (listing.image.indexOf('http') === 0 || listing.image.indexOf('data:') === 0))
      ? listing.image
      : 'https://placehold.co/60x60/e7e7e7/707481?text=Show';
    var statsHtml = listing.stats.map(function (s) {
      return '<span>' + escapeHtml(s) + '</span>';
    }).join('');
    var card = document.createElement('article');
    card.className = 'listing-card' + (showAsHidden ? ' is-hidden' : '');
    card.setAttribute('aria-label', 'Listing: ' + escapeHtml(listing.title));
    card.dataset.listingId = listing.id;
    card.innerHTML =
      '<div class="listing-card__header">' +
        '<div class="listing-card__header-text">' +
          '<h4 class="listing-card__title">' + escapeHtml(listing.title) + '</h4>' +
          '<span class="listing-card__meta">' + escapeHtml(listing.episodes) + '</span>' +
          '<div class="listing-card__cpm">' +
            '<span>' + escapeHtml(listing.cpm) + '</span>' +
            '<span class="listing-card__cpm-old">' + escapeHtml(listing.cpmOld) + '</span>' +
          '</div>' +
        '</div>' +
        '<img src="' + escapeHtml(imgSrc) + '" alt="" class="listing-card__thumb" width="60" height="60">' +
      '</div>' +
      '<div class="listing-card__body">' +
        '<div class="listing-card__pills">' +
          '<span class="listing-card__pill listing-card__pill--green">' + escapeHtml(listing.category) + '</span>' +
          '<span class="listing-card__pill listing-card__pill--grey">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            escapeHtml(listing.daysToBuy) +
          '</span>' +
          '<span class="listing-card__pill listing-card__pill--grey" style="margin-left:auto">' + escapeHtml(listing.dai) + '</span>' +
        '</div>' +
        '<div class="listing-card__stats">' + statsHtml + '<button type="button" class="listing-card__view-details">View details</button></div>' +
      '</div>' +
      '<div class="listing-card__footer">' +
        '<div class="listing-card__toggle">' +
          '<button type="button" class="toggle' + (isOn ? ' is-on' : '') + '" aria-pressed="' + isOn + '" aria-label="' + (isOn ? 'Listing visible' : 'Listing hidden') + '"></button>' +
          '<span>' + (isOn ? 'Live' : 'Hidden') + '</span>' +
        '</div>' +
        '<button type="button" class="listing-card__preview">Preview</button>' +
      '</div>';
    var toggleBtn = card.querySelector('.toggle');
    var toggleLabel = card.querySelector('.listing-card__footer .listing-card__toggle span');
    toggleBtn.addEventListener('click', function () {
      var on = toggleBtn.getAttribute('aria-pressed') === 'true';
      on = !on;
      toggleBtn.setAttribute('aria-pressed', on);
      toggleBtn.classList.toggle('is-on', on);
      toggleLabel.textContent = on ? 'Live' : 'Hidden';
      card.classList.toggle('is-hidden', !on || listing.status === 'hidden');
    });
    return card;
  }

  function getFilteredListings() {
    var list = showLiveOnly ? mockListings.filter(function (l) { return l.status === 'live'; }) : mockListings.slice();
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (q) {
      list = list.filter(function (l) {
        return l.title.toLowerCase().indexOf(q) !== -1 || l.category.toLowerCase().indexOf(q) !== -1;
      });
    }
    return list;
  }

  function renderListings() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    var list = getFilteredListings();
    list.forEach(function (listing, i) {
      gridEl.appendChild(renderListingCard(listing, 'card-' + i));
    });
  }

  function setActiveTab(activeTab) {
    typeTabButtons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.textContent.trim() === activeTab);
    });
  }

  function initMetrics() {
    var valueEls = document.querySelectorAll('.stat-card__value[data-metric]');
    valueEls.forEach(function (el) {
      var key = el.getAttribute('data-metric');
      if (key === 'totalEarned') {
        el.textContent = '$ ' + (mockMetrics[key] || '---');
      } else if (mockMetrics[key] !== undefined) {
        el.textContent = mockMetrics[key];
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderListings);
  }
  typeTabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActiveTab(btn.textContent.trim());
      renderListings();
    });
  });

  initMetrics();
  renderListings();
})();
