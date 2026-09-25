#!/usr/bin/env bash
# Static build: copy HTML/CSS/JS/assets into dist/.
# Trailing `|| true` on optional copies so missing files don't fail the build.

set -e

# Security guardrail: fail the build if any secret-leaking pattern reaches
# client code (see scripts/scan-secrets.mjs). Stops the 2026-06 key-leak class
# of bug from ever shipping again.
node scripts/scan-secrets.mjs

mkdir -p dist dist/data dist/api dist/cutouts

cp *.html dist/
# The Acme OS vetting agent (acme-vetting.html) ships live. It is rebranded to
# Acme Network, scrubbed of client identifiers, AND gated to SpotsNow accounts
# only (Google SSO team tier in middleware.js) - so it is never reachable by the
# public. The old raw source (vetting-demo.html) is never published.
rm -f dist/vetting-demo.html
# Pulled offline: Magellan pixel-setup flow (tracking-pixel pages). Keep source, never publish.
rm -f dist/pixel-setup.html dist/submit-creative.html
# NDA / scratch: raw un-rebranded module sources and one-off scratch pages must
# never publish. The Acme OS demo ships acme-outbound-bw.html (scrubbed), NOT the
# raw bw-outbound-source.html which still carries the original client identity.
rm -f dist/bw-outbound-source.html dist/partner-leads.html dist/brand-dashboard.html dist/scratch_io_terms.html
# Privacy: Relationship Intelligence holds real personal contact data (contacts-data.js).
# Keep source, never publish to the public (unauthenticated) wiki.
rm -f dist/contacts.html
cp styles.css script.js dist/ 2>/dev/null || true
# VC CRM investor data (real pipeline). Ships ONLY because middleware.js gates
# /vc-fund-data.js behind the sn_vc password cookie - keep those in sync.
cp vc-fund-data.js dist/ 2>/dev/null || true
# Marketplace page assets (kept out of the generic css/js copy on purpose).
cp credits.css credits.js data.js dist/ 2>/dev/null || true
cp *.png dist/ 2>/dev/null || true
cp *.jpg dist/ 2>/dev/null || true
cp *.jpeg dist/ 2>/dev/null || true
cp *.webp dist/ 2>/dev/null || true
cp *.svg dist/ 2>/dev/null || true
cp robots.txt dist/ 2>/dev/null || true
cp data/*.json dist/data/ 2>/dev/null || true
cp cutouts/*.png dist/cutouts/ 2>/dev/null || true
