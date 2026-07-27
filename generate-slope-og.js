'use strict';
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1200, H = 630;
const OUT = path.join(__dirname, 'assets', 'og-images', 'slope-og.png');
const LOGO_PATH = path.join(__dirname, 'assets', 'logos', 'slope_logo.svg');

let logoSvg = fs.readFileSync(LOGO_PATH, 'utf8');

// Force all paths ivory/white
logoSvg = logoSvg.replace(/<\/defs>/i, '<style>path,rect,circle,polygon,text{fill:#F5F0E8 !important;stroke:none !important}</style></defs>');
if (!/<\/defs>/i.test(logoSvg)) {
  logoSvg = logoSvg.replace(/(<svg[^>]*>)/i, '$1<defs><style>path,rect,circle,polygon,text{fill:#F5F0E8 !important;stroke:none !important}</style></defs>');
}

// Parse viewBox for aspect ratio
const vbMatch = logoSvg.match(/viewBox=["']([^"']+)["']/i);
let logoW = 480, logoH = 160;
if (vbMatch) {
  const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
  const vbW = parts[parts.length - 2], vbH = parts[parts.length - 1];
  if (vbW > 0 && vbH > 0) {
    const aspect = vbW / vbH;
    const maxW = 560, maxH = 180;
    if (aspect > maxW / maxH) { logoW = maxW; logoH = Math.round(maxW / aspect); }
    else                       { logoH = maxH; logoW = Math.round(maxH * aspect); }
  }
}

const logoX = Math.round((W - logoW) / 2);
const logoY = Math.round((H - logoH) / 2) - 40;

const tagline  = 'Place the ramps. Drop the marble.';
const tagFontSize = 34;
const tagY = logoY + logoH + 52;

const svgStr = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- Piano black background with radial sheen -->
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="70%">
      <stop offset="0%"  stop-color="#1A1A1A"/>
      <stop offset="60%" stop-color="#0A0A0A"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- Gold accent line above logo -->
  <rect x="${W/2 - 40}" y="${logoY - 22}" width="80" height="3" rx="2" fill="#FFD700" fill-opacity="0.7"/>
  <!-- Tagline -->
  <text
    x="${W/2}" y="${tagY}"
    font-family="'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    font-size="${tagFontSize}"
    font-weight="500"
    fill="#F5F0E8"
    fill-opacity="0.55"
    text-anchor="middle"
    dominant-baseline="auto"
  >${tagline}</text>
</svg>`;

async function run() {
  // Render logo to PNG buffer at target size
  const logoPng = await sharp(Buffer.from(logoSvg))
    .resize(logoW, logoH, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .png()
    .toBuffer();

  // Compose: background SVG + logo overlay
  await sharp(Buffer.from(svgStr))
    .resize(W, H)
    .composite([{ input: logoPng, top: logoY, left: logoX }])
    .png()
    .toFile(OUT);

  console.log('Wrote', OUT);
}

run().catch(err => { console.error(err); process.exit(1); });
