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
cp styles.css script.js dist/ 2>/dev/null || true
cp *.png dist/ 2>/dev/null || true
cp *.jpg dist/ 2>/dev/null || true
cp *.jpeg dist/ 2>/dev/null || true
cp *.webp dist/ 2>/dev/null || true
cp *.svg dist/ 2>/dev/null || true
cp robots.txt dist/ 2>/dev/null || true
cp data/*.json dist/data/ 2>/dev/null || true
cp cutouts/*.png dist/cutouts/ 2>/dev/null || true
