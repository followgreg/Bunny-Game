import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink. Here it goes fluorescent yellow — the
// game's one accent colour, and the only thing on the card that is not purple.
let logo = readFileSync(join(__dirname, 'assets/logos/bubbleplanet_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#E8FF00"');

// The face, from the same two files the game draws it from. Its stylesheet is
// stripped and the class inlined for the same reason the logo's is: a <style>
// block dropped into another document styles everything in it, and both files
// happen to call their one class st0.
let eyes = readFileSync(join(__dirname, 'assets/icons/bubbleplanet_eyes.svg'), 'utf8');
eyes = eyes
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#ffffff"');

const EYES_VB = 144;

const W = 1200, H = 630;
const BG = '#1A0A2E';
const NEB = '#2D1B69';
const WELL = '#0D0521';
const YEL = '#E8FF00';
const INK = '#F2ECFF';

// The three colours actually in play.
const COLORS = ['#FF4757', '#2ED573', '#1E90FF'];

const LOGO_VB_W = 71.22, LOGO_VB_H = 27.409;
const LOGO_W = 430;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

const TAU = Math.PI * 2;

// The planet sits right of centre with its cluster around it, and the wordmark
// takes the left — the same read as the game, where the mass is the thing you
// are looking at and the copy stays out of its way.
const PX = 872, PY = H / 2;
const PR = 96;
const R = 25;

// ── Star field ──────────────────────────────────────────────────────────────
let seed = 20260807;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

let stars = '';
for (let i = 0; i < 150; i++) {
  const x = rnd() * W, y = rnd() * H;
  // Keep the field out of the wordmark's box so the type stays clean.
  if (x < 620 && y > 210 && y < 430) continue;
  const s = rnd() < 0.75 ? 1.4 : 2.4;
  stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s}" fill="#fff" fill-opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
}

// ── The cluster ─────────────────────────────────────────────────────────────
// Concentric shells, spaced by chord rather than arc so neighbours touch instead
// of overlapping — the same packing arithmetic the game uses.
let cluster = '';
const placed = [];
for (let k = 0; k < 2; k++) {
  const rad = PR + R + k * R * 2 * 0.97;
  const n = Math.max(3, Math.floor(Math.PI / Math.asin(Math.min(1, R / rad))));
  const off = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    // A few gaps bitten out, so the mass reads as played rather than dealt.
    if (k > 0 && rnd() < 0.2) continue;
    const a = off + (i / n) * TAU;
    placed.push({ x: PX + Math.cos(a) * rad, y: PY + Math.sin(a) * rad,
                  c: COLORS[(rnd() * COLORS.length) | 0] });
  }
}

function bubble(x, y, c, r = R, alpha = 1) {
  const id = `g${Math.round(x * 7 + y * 13)}${Math.round(r)}`;
  return `
  <defs>
    <radialGradient id="${id}" cx="35%" cy="32%" r="72%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="42%"  stop-color="${c}"/>
      <stop offset="100%" stop-color="${c}" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <g opacity="${alpha}">
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${c}"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="url(#${id})"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r - 0.9}" fill="none"
      stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.6"/>
    <ellipse cx="${(x - r * 0.3).toFixed(1)}" cy="${(y - r * 0.34).toFixed(1)}"
      rx="${(r * 0.26).toFixed(1)}" ry="${(r * 0.16).toFixed(1)}"
      transform="rotate(-34 ${(x - r * 0.3).toFixed(1)} ${(y - r * 0.34).toFixed(1)})"
      fill="#ffffff" fill-opacity="0.7"/>
  </g>`;
}

cluster = placed.map(b => bubble(b.x, b.y, b.c)).join('');

// Bubbles already blasted loose, shrinking and trailing as they go — the combo,
// caught mid-flight, which is the thing the card is actually selling. They have
// to sit clear of the mass: run them through it and they read as smudges on the
// cluster rather than as anything leaving it.
let escaping = '';
[[-0.62, 214, 0.85, 1], [0.42, 246, 0.6, 0], [-1.32, 268, 0.42, 2]]
  .forEach(([a, d, al, ci]) => {
    const ex = PX + Math.cos(a) * d, ey = PY + Math.sin(a) * d;
    const c = COLORS[ci];
    for (let t = 1; t <= 4; t++) {
      const td = d - t * 21;
      const f = 1 - t / 5;
      escaping += `<circle cx="${(PX + Math.cos(a) * td).toFixed(1)}"
        cy="${(PY + Math.sin(a) * td).toFixed(1)}" r="${(R * 0.42 * f).toFixed(1)}"
        fill="${c}" fill-opacity="${(al * f * 0.5).toFixed(2)}"/>`;
    }
    escaping += bubble(ex, ey, c, R * (0.5 + al * 0.45), al);
  });

// ── The planet ──────────────────────────────────────────────────────────────
const craters = [[-0.30, -0.20, 0.15], [0.20, 0.30, 0.10], [-0.10, 0.40, 0.08], [0.34, -0.28, 0.07]]
  .map(([ox, oy, r]) =>
    `<circle cx="${(PX + ox * PR).toFixed(1)}" cy="${(PY + oy * PR).toFixed(1)}"
       r="${(r * PR).toFixed(1)}" fill="#140A32" fill-opacity="0.55"/>`).join('');

// Sized and placed the way drawFace does it: 95% of the planet's diameter,
// centred, and drawn over the surface rather than clipped into it — the sphere
// turns, the face does not.
const FACE_SIZE = PR * 2 * 0.95;
const face = `<g transform="translate(${(PX - FACE_SIZE / 2).toFixed(1)} ${(PY - FACE_SIZE / 2).toFixed(1)}) scale(${(FACE_SIZE / EYES_VB).toFixed(4)})">${eyes}</g>`;

const continents = [[0.10, -0.34, 0.52, 0.20, -20, 0.34], [-0.28, 0.26, 0.38, 0.16, 32, 0.28]]
  .map(([ox, oy, rx, ry, rot, a]) =>
    `<ellipse cx="${(PX + ox * PR).toFixed(1)}" cy="${(PY + oy * PR).toFixed(1)}"
       rx="${(rx * PR).toFixed(1)}" ry="${(ry * PR).toFixed(1)}"
       transform="rotate(${rot} ${(PX + ox * PR).toFixed(1)} ${(PY + oy * PR).toFixed(1)})"
       fill="#2DD4BF" fill-opacity="${a}"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="neb" cx="30%" cy="20%" r="85%">
      <stop offset="0%" stop-color="${NEB}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${NEB}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="well" cx="70%" cy="80%" r="70%">
      <stop offset="0%" stop-color="${WELL}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${WELL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="planet" cx="35%" cy="35%" r="72%">
      <stop offset="0%"   stop-color="#A78BFA"/>
      <stop offset="40%"  stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#2D1B69"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="76%"  stop-color="#00FFC8" stop-opacity="0"/>
      <stop offset="88%"  stop-color="#00FFC8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#00FFC8" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="pclip"><circle cx="${PX}" cy="${PY}" r="${PR}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#neb)"/>
  <rect width="${W}" height="${H}" fill="url(#well)"/>
  ${stars}

  <!-- ring, far half -->
  <g transform="translate(${PX} ${PY}) scale(1 0.3)">
    <path d="M ${-PR * 1.6} 0 A ${PR * 1.6} ${PR * 1.6} 0 0 1 ${PR * 1.6} 0"
      fill="none" stroke="#00FFC8" stroke-opacity="0.42" stroke-width="${10 / 0.3}" stroke-linecap="round"/>
  </g>

  <circle cx="${PX}" cy="${PY}" r="${PR * 1.26}" fill="url(#halo)"/>
  <circle cx="${PX}" cy="${PY}" r="${PR}" fill="url(#planet)"/>
  <g clip-path="url(#pclip)">${continents}${craters}</g>
  ${face}

  ${cluster}
  ${escaping}

  <!-- ring, near half: over the cluster, which is the only way it stays visible -->
  <g transform="translate(${PX} ${PY}) scale(1 0.3)">
    <path d="M ${PR * 1.6} 0 A ${PR * 1.6} ${PR * 1.6} 0 0 1 ${-PR * 1.6} 0"
      fill="none" stroke="#00FFC8" stroke-opacity="0.7" stroke-width="${10 / 0.3}" stroke-linecap="round"/>
  </g>

  <g transform="translate(78, ${(H - LOGO_H) / 2 - 26}) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>

  <text x="78" y="${(H - LOGO_H) / 2 + LOGO_H + 34}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="32" font-weight="700" fill="${INK}" fill-opacity="0.9">
    Match. Combo. Defend the planet.
  </text>

  <text x="78" y="${H - 58}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="22" font-weight="700"
    letter-spacing="3.2" fill="${YEL}" fill-opacity="0.72">
    CUT IT LOOSE AND IT FLIES OFF INTO SPACE
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/bubbleplanet-og.png'));

console.log('✓ bubbleplanet-og.png written');

// ── The same artwork, on its own ─────────────────────────────────────────────
// The splash screen wants the planet and its cluster without the card around
// them. Cut from here rather than redrawn there, so the picture a player meets
// on the start screen is the one they saw on the link they followed in.
//
// Cropped to what is actually drawn — the loose bubbles reach further out than
// the mass, and on three sides only, so a symmetric box would hang the whole
// thing off centre. Written as SVG: it is a few kilobytes, it stays sharp at any
// size, and it carries no background, so the splash shows through behind it.
const ART_PAD = 10;
let minX = PX - PR * 1.6, maxX = PX + PR * 1.6;      // the ring is the widest part
let minY = PY - PR * 1.26, maxY = PY + PR * 1.26;    // and the halo the tallest
placed.forEach(b => {
  minX = Math.min(minX, b.x - R); maxX = Math.max(maxX, b.x + R);
  minY = Math.min(minY, b.y - R); maxY = Math.max(maxY, b.y + R);
});
[[-0.62, 214, 0.85], [0.42, 246, 0.6], [-1.32, 268, 0.42]].forEach(([a, d, al]) => {
  const r = R * (0.5 + al * 0.45);
  const ex = PX + Math.cos(a) * d, ey = PY + Math.sin(a) * d;
  minX = Math.min(minX, ex - r); maxX = Math.max(maxX, ex + r);
  minY = Math.min(minY, ey - r); maxY = Math.max(maxY, ey + r);
});
minX -= ART_PAD; minY -= ART_PAD; maxX += ART_PAD; maxY += ART_PAD;

const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}">
  <defs>
    <radialGradient id="planet" cx="35%" cy="35%" r="72%">
      <stop offset="0%"   stop-color="#A78BFA"/>
      <stop offset="40%"  stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#2D1B69"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="76%"  stop-color="#00FFC8" stop-opacity="0"/>
      <stop offset="88%"  stop-color="#00FFC8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#00FFC8" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="pclip"><circle cx="${PX}" cy="${PY}" r="${PR}"/></clipPath>
  </defs>

  <g transform="translate(${PX} ${PY}) scale(1 0.3)">
    <path d="M ${-PR * 1.6} 0 A ${PR * 1.6} ${PR * 1.6} 0 0 1 ${PR * 1.6} 0"
      fill="none" stroke="#00FFC8" stroke-opacity="0.42" stroke-width="${10 / 0.3}" stroke-linecap="round"/>
  </g>

  <circle cx="${PX}" cy="${PY}" r="${PR * 1.26}" fill="url(#halo)"/>
  <circle cx="${PX}" cy="${PY}" r="${PR}" fill="url(#planet)"/>
  <g clip-path="url(#pclip)">${continents}${craters}</g>
  ${face}

  ${cluster}
  ${escaping}

  <g transform="translate(${PX} ${PY}) scale(1 0.3)">
    <path d="M ${PR * 1.6} 0 A ${PR * 1.6} ${PR * 1.6} 0 0 1 ${-PR * 1.6} 0"
      fill="none" stroke="#00FFC8" stroke-opacity="0.7" stroke-width="${10 / 0.3}" stroke-linecap="round"/>
  </g>
</svg>`;

writeFileSync(join(__dirname, 'assets/logos/bubbleplanet_planet.svg'), art);
console.log('✓ bubbleplanet_planet.svg written');
