import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink; the board is deep navy, so it goes white.
let logo = readFileSync(join(__dirname, 'assets/logos/cluster_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#F8FAFC"');

const W = 1200, H = 630;
const BG = '#080d18', BG_HI = '#152238';
const INK = '#F8FAFC';

// Same palette the game ships.
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7'];

const LOGO_VB_W = 102.318, LOGO_VB_H = 21.765;
const LOGO_W = 380;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

// The cluster sits right of centre; the wordmark and copy take the left third.
// One picture has to say "hex mass on a spinner, and a shot is coming in at an
// angle that will turn it" — so the incoming shot is drawn off-centre, with the
// rotation arrow it implies.
const CX = 852, CY = 292;
const R = 24, SP = R * 2, SQ3_2 = Math.sqrt(3) / 2;
const RING = 4;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Deterministic colouring so the image is identical on every regeneration.
let seed = 20260804;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

let defs = '';
COLORS.forEach((c, i) => {
  defs += `<radialGradient id="b${i}" cx="33%" cy="30%" r="72%">` +
          `<stop offset="0%" stop-color="${shade(c, 0.58)}"/>` +
          `<stop offset="55%" stop-color="${c}"/>` +
          `<stop offset="100%" stop-color="${shade(c, -0.36)}"/></radialGradient>`;
});

let balls = '';
const cells = [];
for (let q = -RING; q <= RING; q++) {
  const lo = Math.max(-RING, -q - RING), hi = Math.min(RING, -q + RING);
  for (let r = lo; r <= hi; r++) {
    if (q === 0 && r === 0) continue;              // the hub sits here
    cells.push([q, r]);
  }
}

// A light rotation on the whole mass, so it reads as a thing that turns rather
// than a tidy grid someone drew.
const TILT = 0.14, ct = Math.cos(TILT), st = Math.sin(TILT);

for (const [q, r] of cells) {
  const lx = SP * (q + r / 2), ly = SP * SQ3_2 * r;
  const x = CX + lx * ct - ly * st;
  const y = CY + lx * st + ly * ct;
  const i = (rnd() * COLORS.length) | 0;
  balls += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R}" fill="url(#b${i})" ` +
           `stroke="rgba(0,0,0,0.30)" stroke-width="1.1"/>` +
           `<ellipse cx="${(x - R * 0.30).toFixed(1)}" cy="${(y - R * 0.38).toFixed(1)}" ` +
           `rx="${(R * 0.30).toFixed(1)}" ry="${(R * 0.19).toFixed(1)}" ` +
           `fill="rgba(255,255,255,0.55)" transform="rotate(-34 ${(x - R * 0.30).toFixed(1)} ${(y - R * 0.38).toFixed(1)})"/>`;
}

// Hub with spokes — the thing everything hangs off.
const HUB_R = R * 1.45;
let hub = `<circle cx="${CX}" cy="${CY}" r="${HUB_R + 3}" fill="rgba(148,163,184,0.10)"/>` +
          `<circle cx="${CX}" cy="${CY}" r="${HUB_R}" fill="url(#hubg)"/>`;
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2 + TILT;
  hub += `<line x1="${CX}" y1="${CY}" x2="${(CX + Math.cos(a) * HUB_R * 0.85).toFixed(1)}" ` +
         `y2="${(CY + Math.sin(a) * HUB_R * 0.85).toFixed(1)}" stroke="rgba(15,23,42,0.75)" stroke-width="2.4"/>`;
}

// The incoming shot: a dashed line arriving off-centre at the lower-right rim,
// which is exactly the shot that spins the mass hardest. It lives bottom-right
// because the left third of the frame belongs to the wordmark and the strapline.
const sx = 1086, sy = 556;
const hitX = CX + 116, hitY = CY + 132;
const shot =
  `<line x1="${sx}" y1="${sy}" x2="${hitX.toFixed(1)}" y2="${hitY.toFixed(1)}" stroke="${INK}" ` +
  `stroke-opacity="0.45" stroke-width="3" stroke-dasharray="9 10" stroke-linecap="round"/>` +
  `<circle cx="${sx}" cy="${sy}" r="${R}" fill="url(#b2)" stroke="rgba(0,0,0,0.3)" stroke-width="1.1"/>` +
  `<ellipse cx="${sx - R * 0.30}" cy="${sy - R * 0.38}" rx="${R * 0.30}" ry="${R * 0.19}" ` +
  `fill="rgba(255,255,255,0.55)"/>`;

// The turn it causes — an annotation drawn over the mass, centred on the hub,
// because that is the one thing the picture has to say and it cannot say it
// from behind eighty bubbles.
const ARC_R = 104;
function onArc(deg) {
  const a = deg * Math.PI / 180;
  return [(CX + Math.cos(a) * ARC_R).toFixed(1), (CY + Math.sin(a) * ARC_R).toFixed(1)];
}
const [ax0, ay0] = onArc(168);
const [ax1, ay1] = onArc(348);
const [tx, ty] = onArc(340);
const spinArc =
  `<path d="M ${ax0} ${ay0} A ${ARC_R} ${ARC_R} 0 1 1 ${ax1} ${ay1}" fill="none" ` +
  `stroke="rgba(8,13,24,0.55)" stroke-width="11" stroke-linecap="round"/>` +
  `<path d="M ${ax0} ${ay0} A ${ARC_R} ${ARC_R} 0 1 1 ${ax1} ${ay1}" fill="none" ` +
  `stroke="${INK}" stroke-opacity="0.92" stroke-width="5" stroke-linecap="round"/>` +
  `<path d="M ${ax1} ${ay1} L ${tx} ${(+ty - 26).toFixed(1)} L ${(+tx + 26).toFixed(1)} ${ty} Z" ` +
  `fill="${INK}" fill-opacity="0.92" stroke="rgba(8,13,24,0.55)" stroke-width="3" stroke-linejoin="round"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="70%" cy="45%" r="80%">
      <stop offset="0%" stop-color="${BG_HI}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <radialGradient id="hubg" cx="34%" cy="34%" r="70%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#33415a"/>
    </radialGradient>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${INK}" stroke-opacity="0.10" stroke-width="1"/>

  ${balls}
  ${hub}
  ${spinArc}
  ${shot}

  <g transform="translate(78, 214) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>
  <text x="78" y="${214 + LOGO_H + 54}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="29" fill="${INK}" fill-opacity="0.62">
    Match three to pop.
  </text>
  <text x="78" y="${214 + LOGO_H + 92}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="29" fill="${INK}" fill-opacity="0.62">
    Cut a bubble off the hub and it falls.
  </text>

  <text x="78" y="${H - 62}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="22" font-weight="700"
    letter-spacing="3.2" fill="${INK}" fill-opacity="0.5">
    EVERY SHOT SPINS THE WHOLE CLUSTER
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/cluster-og.png'));

console.log('✓ cluster-og.png written');
