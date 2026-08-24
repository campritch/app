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
# NDA: never publish the vetting demo to the live site. The Acme OS shell
# iframes acme-vetting.html, so ship a clean placeholder in its place instead
# of a dead link. Real vetting demo source stays local-only.
rm -f dist/vetting-demo.html
cp acme-vetting-locked.html dist/acme-vetting.html
# Pulled offline: Magellan pixel-setup flow (tracking-pixel pages). Keep source, never publish.
rm -f dist/pixel-setup.html dist/submit-creative.html
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
