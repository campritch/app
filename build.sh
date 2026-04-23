#!/usr/bin/env bash
# Static build: copy HTML/CSS/JS/assets into dist/.
# Trailing `|| true` on optional copies so missing files don't fail the build.

set -e

mkdir -p dist dist/data dist/api dist/cutouts

cp *.html dist/
cp styles.css script.js dist/ 2>/dev/null || true
cp *.png dist/ 2>/dev/null || true
cp data/*.json dist/data/ 2>/dev/null || true
cp api/cutouts/*.png dist/cutouts/ 2>/dev/null || true
