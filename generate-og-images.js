'use strict';

// generate-og-images.js
// Run: node generate-og-images.js
// Produces 1200×630 PNG OG images for every game and wires og:image / twitter:image
// into each game's <head>.

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1200, H = 630;
const LOGOS_DIR = path.join(__dirname, 'assets', 'logos');
const OUT_DIR   = path.join(__dirname, 'assets', 'og-images');
const BASE_URL  = 'https://www.thebunnygame.com';

// ── Game definitions ──────────────────────────────────────────────────────────
// logo: filename in assets/logos/ — null means render name as text
// logoFill: CSS color to force-fill all paths (e.g. 'white', '#c084fc')
// gradient: true → Shroom Mode rainbow background instead of solid bg
// textShadow: true → drop-shadow on text (used over gradient bg)

const GAMES = [
  { slug: 'classic',      html: 'classic.html',      bg: '#ffffff',  logo: 'classic_logo.svg',     desc: 'Click matching tiles to clear the board.',                          textColor: '#111111', descColor: 'rgba(0,0,0,0.55)' },
  { slug: 'colorbomb',    html: 'colorbomb.html',    bg: '#100000',  logo: 'colorbomb_logo.svg',   logoFill: 'white', desc: "Minesweeper, but the numbers are colors — and you don't know which is which.", textColor: '#fca5a5', descColor: 'rgba(255,255,255,0.65)' },
  { slug: 'niner',        html: 'niner.html',        bg: '#0f172a',  logo: 'niner_logo.svg',       logoFill: 'white', desc: 'Nine letters. One word. Trace the path.',                            textColor: '#a5b4fc', descColor: 'rgba(255,255,255,0.6)' },
  { slug: 'colorblind',   html: 'colorblind.html',   bg: '#f0ece4',  logo: 'colorblind_logo.svg',  desc: 'One square is different. Can you find it?',                         textColor: '#111111', descColor: 'rgba(0,0,0,0.52)' },
  { slug: 'solo',         html: 'solo.html',          bg: '#0d0101',  logo: 'solo_logo.svg',        desc: 'Five shapes. Five stars. None of them touching.',                   textColor: '#f1f5f9', descColor: 'rgba(255,255,255,0.6)' },
  { slug: 'honey',        html: 'honey.html',         bg: '#1C1200',  logo: 'honey_logo.svg',       desc: 'Rotate the hive. Connect every cell. Watch the honey flow.',        textColor: '#f1f5f9', descColor: 'rgba(245,200,66,0.72)' },
  { slug: 'next',         html: 'next.html',          bg: '#2B2B2E',  logo: 'next_logo.svg',        desc: 'Read the sequence. Find the rule. Pick the next color.',            textColor: '#f1f5f9', descColor: 'rgba(255,255,255,0.5)' },
  { slug: 'fuse',         html: 'fuse.html',          bg: '#0c1a2e',  logo: 'fuse_logo.svg',        desc: 'Trace every cell. Land the final step exactly on the spark.',       textColor: '#fbbf24', descColor: 'rgba(255,255,255,0.6)' },
  { slug: 'race-to-zero', html: 'race-to-zero.html', bg: '#000000',  logo: 'racetozero_logo.svg',  desc: "Clear matching digits. Hit exactly zero. Don't overshoot.",         textColor: '#f1f5f9', descColor: 'rgba(255,255,255,0.6)' },
  { slug: 'cubrick',      html: 'cubrick.html',       bg: '#E8DCC8',  logo: 'cubrick_logo.svg',     desc: 'Fill the board. Build the cube. Eight puzzle levels.',              textColor: '#1a1a1a', descColor: 'rgba(26,26,26,0.65)' },
  { slug: 'hexflip',      html: 'hexflip.html',       bg: '#ffffff',  logo: 'Hexflip_Logo.svg',     desc: 'Click exactly 3 hexes to turn the whole board black.',             textColor: '#0f172a', descColor: 'rgba(15,23,42,0.6)' },
  { slug: 'cropped',      html: 'cropped.html',       bg: '#F5F0E8',  logo: 'cropped_logo.svg',     desc: 'One painting. One crop. One guess.',                                textColor: '#1a1a1a', descColor: 'rgba(26,26,26,0.65)' },
  { slug: 'flagged',      html: 'flagged.html',       bg: '#3b82f6',  logo: 'flagged_logo.svg',     desc: 'Eight flags. Two capitals sit closest. Find them and streak.',      textColor: '#ffffff', descColor: 'rgba(255,255,255,0.75)' },
  { slug: 'wave',         html: 'wave.html',          bg: '#dc2626',  logo: 'wave_logo.svg',     logoFill: 'white', desc: 'One flag. One sweep. Four guesses. How far can you get?',    textColor: '#ffffff', descColor: 'rgba(255,255,255,0.82)' },
  { slug: 'mascot-wave',  html: 'mascot-wave.html',  bg: '#4c1d95',  logo: 'mascot_logo.svg',   logoFill: 'white', desc: 'One logo. One sweep. Four guesses. Name the school.',        textColor: '#ffffff', descColor: 'rgba(237,233,254,0.75)' },
  { slug: 'pickler',      html: 'pickler.html',       bg: '#1B3A2B',  logo: 'pickler_logo.svg',  logoFill: 'white', desc: 'Time the launch. Stick the nostril. How many rounds can you clear?', textColor: '#ffffff', descColor: 'rgba(167,243,208,0.75)' },
  { slug: 'snek',         html: 'snek.html',          bg: '#0f1e14',  logo: 'snek_logo.svg',     logoFill: '#c084fc', desc: "Trace every cell. Don't box yourself in.",                 textColor: '#f1f5f9', descColor: 'rgba(148,163,184,0.8)' },
  { slug: 'mobi',         html: 'mobi.html',          bg: '#000000',  logo: 'mobi_logo.svg',     logoFill: '#39FF14', desc: 'Rotate the pieces. Discover the picture.',                 textColor: '#f1f5f9', descColor: 'rgba(57,255,20,0.65)' },
  { slug: 'hare-trigger', html: 'hare-trigger.html', bg: '#ea580c',  name: 'Hare Trigger', desc: 'Clear connected characters before the board shifts under you.',      textColor: '#ffffff', descColor: 'rgba(255,255,255,0.82)' },
  { slug: 'hare-brain',   html: 'hare-brain.html',   bg: '#7c3aed',  name: 'Hare Brain',   desc: 'Solve the math before the board fills up.',                         textColor: '#ffffff', descColor: 'rgba(255,255,255,0.82)' },
  { slug: 'bomb-mode',    html: 'bomb-mode.html',    bg: '#0a0a0a',  name: 'Bomb Mode',    desc: 'Guide the bomb to the bottom row.',                                 textColor: '#f1f5f9', descColor: 'rgba(255,255,255,0.6)' },
  { slug: '86-bunnies',   html: '86-bunnies.html',   bg: '#2563eb',  name: '86 Bunnies',   desc: 'Clear everything to bring the blue bunnies together.',              textColor: '#ffffff', descColor: 'rgba(255,255,255,0.82)' },
  { slug: 'hare-line',    html: 'hare-line.html',    bg: '#dc2626',  name: 'Hare Line',    desc: 'Slide tiles to line up all five red bunnies.',                     textColor: '#ffffff', descColor: 'rgba(255,255,255,0.82)' },
  { slug: 'shroom-mode',  html: 'shroom-mode.html',  gradient: true, name: 'Shroom Mode',  desc: 'Match tiles as the board pulses with color.',                       textColor: '#ffffff', descColor: 'rgba(255,255,255,0.9)', textShadow: true },
  { slug: 'bunny-hop',    html: 'bunny-hop.html',    bg: '#92400e',  name: 'Bunny Hop',    desc: 'Jump bunnies to end with exactly one.',                            textColor: '#fef3c7', descColor: 'rgba(254,243,199,0.75)' },
  { slug: 'cabbage-drop', html: 'cabbage-drop.html', bg: '#15803d',  name: 'Cabbage Drop', desc: '60 seconds. Full board. Race the clock.',                          textColor: '#dcfce7', descColor: 'rgba(220,252,231,0.75)' },
  { slug: 'whiskers',     html: 'whiskers.html',     bg: '#1e1b4b',  name: 'WHISKers',     desc: 'Memorize the pairs. Match them all. One wrong flip ends your run.', textColor: '#e0e7ff', descColor: 'rgba(148,163,184,0.8)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wrap text to lines of at most maxChars, breaking on word boundaries.
function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxChars) { cur = test; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Inject a <style> block into an SVG string (before the first closing </defs>,
// or by creating a <defs> block right after the opening <svg...> tag).
function injectSvgStyle(svg, css) {
  if (/<\/defs>/i.test(svg)) {
    return svg.replace(/<\/defs>/i, `<style>${css}</style></defs>`);
  }
  if (/<defs[^>]*>/i.test(svg)) {
    return svg.replace(/<defs([^>]*)>/i, `<defs$1><style>${css}</style>`);
  }
  return svg.replace(/(<svg[^>]*>)/i, `$1<defs><style>${css}</style></defs>`);
}

// Parse the viewBox and return the natural aspect ratio (w/h).
function svgAspect(svg) {
  const m = svg.match(/viewBox=["']([^"']+)["']/i);
  if (!m) return 2;
  const p = m[1].trim().split(/[\s,]+/).map(Number);
  const vbW = p[p.length - 2], vbH = p[p.length - 1];
  return vbW > 0 && vbH > 0 ? vbW / vbH : 2;
}

// Split an rgba() string into {fill, opacity} for SVG presentation attributes.
// SVG fill-opacity is more reliable than rgba() across renderers.
function splitColor(color) {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]]
      .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
      .join('');
    return { fill: hex, opacity: m[4] != null ? m[4] : null };
  }
  return { fill: color, opacity: null };
}

function fillAttrs(colorStr) {
  const { fill, opacity } = splitColor(colorStr);
  return opacity != null ? `fill="${fill}" fill-opacity="${opacity}"` : `fill="${fill}"`;
}

// ── SVG builder ───────────────────────────────────────────────────────────────

function buildOgSvg(game) {
  const CX = W / 2;
  const LOGO_MAX_W = 700, LOGO_MAX_H = 210;
  const LOGO_TOP_Y = 115;   // top edge of logo / name block
  const LINE_H = 44;        // descriptor line height
  const DESC_FONT = 34;
  const BOTTOM_PAD = 50;

  // ── Background ──
  let defs = '';
  let bgFill;

  if (game.gradient) {
    defs += `
    <linearGradient id="og-bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"    stop-color="#f24444"/>
      <stop offset="12.5%" stop-color="#f2a044"/>
      <stop offset="25%"   stop-color="#b6f244"/>
      <stop offset="37.5%" stop-color="#29e64d"/>
      <stop offset="50%"   stop-color="#29e6c9"/>
      <stop offset="62.5%" stop-color="#4488f2"/>
      <stop offset="75%"   stop-color="#a244f2"/>
      <stop offset="87.5%" stop-color="#f244b7"/>
      <stop offset="100%"  stop-color="#f24444"/>
    </linearGradient>`;
    bgFill = 'url(#og-bg)';
  } else {
    bgFill = game.bg;
  }

  if (game.textShadow) {
    defs += `
    <filter id="og-ts" x="-5%" y="-10%" width="110%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.6)"/>
    </filter>`;
  }

  const tsAttr = game.textShadow ? ' filter="url(#og-ts)"' : '';

  // ── Main element: logo image or text name ──
  let mainEl = '';
  let descTopY;

  if (game.logo) {
    const logoPath = path.join(LOGOS_DIR, game.logo);
    let logoSvg = fs.readFileSync(logoPath, 'utf8');

    if (game.logoFill) {
      // Force all paths/shapes to the specified fill color.
      // Using !important ensures we override both presentation attributes and
      // existing class-based styles within the embedded SVG.
      const css = `path,rect,circle,polygon,ellipse,polyline,line{fill:${game.logoFill}!important;stroke:none!important}`;
      logoSvg = injectSvgStyle(logoSvg, css);
    }

    const b64 = Buffer.from(logoSvg).toString('base64');
    const uri = `data:image/svg+xml;base64,${b64}`;

    const aspect = svgAspect(logoSvg);
    let lw = LOGO_MAX_W, lh = lw / aspect;
    if (lh > LOGO_MAX_H) { lh = LOGO_MAX_H; lw = lh * aspect; }

    const lx = (W - lw) / 2;
    const ly = LOGO_TOP_Y;
    descTopY = ly + lh + 58;

    mainEl = `<image href="${uri}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}"/>`;

  } else {
    // Text name — large, bold, centered
    const nameFontSize = game.name.length > 14 ? 74 : 90;
    // Baseline at LOGO_TOP_Y + approximate cap height + centering offset
    const nameBaselineY = LOGO_TOP_Y + nameFontSize * 0.78;
    descTopY = nameBaselineY + nameFontSize * 0.3 + 40;

    mainEl = `<text x="${CX}" y="${nameBaselineY.toFixed(1)}" text-anchor="middle" font-family="Arial Black, Helvetica Neue, Arial, sans-serif" font-size="${nameFontSize}" font-weight="900" ${fillAttrs(game.textColor)}${tsAttr}>${escapeXml(game.name)}</text>`;
  }

  // ── Descriptor text ──
  const lines = wrapText(game.desc, 46);
  const blockH = lines.length * LINE_H;

  // Center the desc block vertically in the space between descTopY and bottom padding.
  const availTop  = Math.max(descTopY, descTopY);
  const availBot  = H - BOTTOM_PAD;
  const blockCY   = (availTop + availBot) / 2;
  const blockStartY = blockCY - blockH / 2 + LINE_H * 0.78; // baseline of first line

  const descEls = lines.map((line, i) =>
    `<text x="${CX}" y="${(blockStartY + i * LINE_H).toFixed(1)}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${DESC_FONT}" ${fillAttrs(game.descColor)}${tsAttr}>${escapeXml(line)}</text>`
  ).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="${bgFill}"/>
  ${mainEl}
  ${descEls}
</svg>`;
}

// ── HTML updater ──────────────────────────────────────────────────────────────

function updateHtml(game) {
  const htmlPath = path.join(__dirname, game.html);
  if (!fs.existsSync(htmlPath)) {
    console.log(`  ⚠  ${game.html} not found — skipping`);
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');
  const imgUrl = `${BASE_URL}/assets/og-images/${game.slug}-og.png`;

  // Strip any existing og:image, og:image:width/height, twitter:card, twitter:image tags.
  html = html
    .replace(/[ \t]*<meta property="og:image[^"]*"[^>]*>\n?/g, '')
    .replace(/[ \t]*<meta name="twitter:[^"]*"[^>]*>\n?/g, '');

  const block = [
    `  <meta property="og:image" content="${imgUrl}">`,
    `  <meta property="og:image:width" content="1200">`,
    `  <meta property="og:image:height" content="630">`,
    `  <meta name="twitter:card" content="summary_large_image">`,
    `  <meta name="twitter:image" content="${imgUrl}">`,
  ].join('\n');

  // Insert after og:url (preferred) or before </head> as fallback.
  if (/<meta property="og:url"[^>]*>/i.test(html)) {
    html = html.replace(
      /(<meta property="og:url"[^>]*>)/i,
      `$1\n${block}`
    );
  } else {
    html = html.replace('</head>', `${block}\n</head>`);
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating ${GAMES.length} OG images → ${OUT_DIR}\n`);

  for (const game of GAMES) {
    process.stdout.write(`  ${game.slug.padEnd(18)} `);
    try {
      const svgStr = buildOgSvg(game);
      const outPath = path.join(OUT_DIR, `${game.slug}-og.png`);
      await sharp(Buffer.from(svgStr)).png().toFile(outPath);
      process.stdout.write('✓ image\n');
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`);
    }
  }

  console.log('\nUpdating HTML og:image tags...\n');

  for (const game of GAMES) {
    try {
      updateHtml(game);
      console.log(`  ✓ ${game.html}`);
    } catch (err) {
      console.log(`  ✗ ${game.html}: ${err.message}`);
    }
  }

  console.log('\nAll done.');
}

run().catch(err => { console.error(err); process.exit(1); });
