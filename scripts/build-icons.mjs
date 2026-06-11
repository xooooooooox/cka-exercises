#!/usr/bin/env node
// Render the brand SVG into the PWA icon set under docs/icons/.
// Usage: npm run build:icons
//
// Generated files (committed to the repo):
//   docs/icons/icon.svg                  — vector source
//   docs/icons/icon-180.png              — iOS apple-touch-icon
//   docs/icons/icon-192.png              — standard PWA
//   docs/icons/icon-512.png              — high-res PWA
//   docs/icons/icon-512-maskable.png     — adaptive (10% safe-area padded)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'icons');

// Brand colour (matches --accent in style.css) and dark background
const ACCENT = '#0969da';
const FG     = '#ffffff';

// Helm-style mark inspired by the kubernetes logo. Hand-traced as paths so we
// don't depend on a system emoji font when rendering on Linux CI runners.
// The "CKA" wordmark sits below the helm.
function makeSvg({ size = 512, padding = 0 } = {}) {
  const safe = size - padding * 2;
  // viewBox stays at 0 0 512 512 so all sub-paths are size-agnostic;
  // the surrounding <svg> handles the safe-area padding for maskable icons.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${ACCENT}"/>
  <g transform="translate(${padding} ${padding}) scale(${safe / 512})">
    <!-- Helm wheel: outer ring + 8 spokes + inner hub -->
    <g transform="translate(256 200)" fill="none" stroke="${FG}" stroke-width="16" stroke-linecap="round">
      <circle r="110"/>
      <g>
        <line x1="0" y1="-110" x2="0" y2="-60"/>
        <line x1="0" y1="60"  x2="0" y2="110"/>
        <line x1="-110" y1="0" x2="-60" y2="0"/>
        <line x1="60"  y1="0" x2="110" y2="0"/>
        <line x1="-78" y1="-78" x2="-42" y2="-42"/>
        <line x1="42"  y1="42"  x2="78"  y2="78"/>
        <line x1="-78" y1="78"  x2="-42" y2="42"/>
        <line x1="42"  y1="-42" x2="78"  y2="-78"/>
      </g>
      <circle r="36" fill="${FG}" stroke="none"/>
    </g>
    <!-- CKA wordmark -->
    <text x="256" y="410" fill="${FG}" text-anchor="middle"
          font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif"
          font-weight="800" font-size="96" letter-spacing="6">CKA</text>
  </g>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const svg = makeSvg();
  // The exposed SVG (no extra padding — used as <link rel="icon">)
  fs.writeFileSync(path.join(OUT_DIR, 'icon.svg'), svg);

  const variants = [
    { name: 'icon-180.png', size: 180, padding: 0 },
    { name: 'icon-192.png', size: 192, padding: 0 },
    { name: 'icon-512.png', size: 512, padding: 0 },
    // Maskable variant: same artwork but inside a 10% safe area so
    // adaptive-icon platforms can crop without clipping the helm.
    { name: 'icon-512-maskable.png', size: 512, padding: 51 },
  ];

  for (const v of variants) {
    const buf = Buffer.from(makeSvg({ size: 512, padding: v.padding }));
    await sharp(buf).resize(v.size, v.size).png().toFile(path.join(OUT_DIR, v.name));
    console.log('wrote', path.relative(ROOT, path.join(OUT_DIR, v.name)));
  }
  console.log('wrote', path.relative(ROOT, path.join(OUT_DIR, 'icon.svg')));
}

main().catch(e => { console.error(e); process.exit(1); });
