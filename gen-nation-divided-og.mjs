import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink on a light board, so it goes in as-is.
let logo = readFileSync(join(__dirname, 'assets/logos/nationdivided_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#231f20"');

const W = 1200, H = 630;
const PAPER = '#F5F0E8', INK = '#231f20', CUT = '#E4572E', MUTED = '#8A8073';
const LAND = '#B3A585', COAST = '#4E4636';

const LOGO_VB_W = 52.468, LOGO_VB_H = 19.235;
const LOGO_W = 380;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

// Drawn from the game's own level data and its own clipper, so the two halves
// are the halves that line actually produces. Italy: instantly readable at
// thumbnail size, and lopsided enough that the beam has something to say.
const { levels } = JSON.parse(readFileSync(join(__dirname, 'nation-levels.json'), 'utf8'));
const country = levels.find((l) => l.name === 'Italy') || levels[0];

const pts = [];
for (let i = 0; i < country.outer.length; i += 2) pts.push({ x: country.outer[i], y: country.outer[i + 1] });

function clip(ring, nx, ny, d) {
  const out = [];
  let prev = ring[ring.length - 1];
  let pd = nx * prev.x + ny * prev.y + d;
  for (const cur of ring) {
    const cd = nx * cur.x + ny * cur.y + d;
    if (cd >= 0) {
      if (pd < 0) { const t = pd / (pd - cd); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }); }
      out.push(cur);
    } else if (pd >= 0) {
      const t = pd / (pd - cd); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
    }
    prev = cur; pd = cd;
  }
  return out;
}

// A cut across the middle, close but not equal — which is what the tilted beam
// underneath is reporting.
const P0 = { x: -20, y: 46 }, P1 = { x: 120, y: 58 };
const nx0 = -(P1.y - P0.y), ny0 = (P1.x - P0.x);
const L = Math.hypot(nx0, ny0);
const nx = nx0 / L, ny = ny0 / L, d = -(nx * P0.x + ny * P0.y);
const top = clip(pts, nx, ny, d);
const bot = clip(pts, -nx, -ny, -d);

const centreOf = (ring) => {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

function place(ring, t) {
  const c = Math.cos(t.rot || 0), s = Math.sin(t.rot || 0);
  return ring.map((p, i) => {
    const lx = (p.x - t.cx) * t.k, ly = (p.y - t.cy) * t.k;
    return `${i ? 'L' : 'M'} ${(t.x + lx * c - ly * s).toFixed(1)} ${(t.y + lx * s + ly * c).toFixed(1)}`;
  }).join(' ') + ' Z';
}

const shape = (ring, t, sw) =>
  `<path d="${place(ring, t)}" fill="${LAND}" stroke="${COAST}" stroke-width="${sw}" stroke-linejoin="round"/>`;

// Balance geometry — pushed right so the wordmark and strapline own the left third.
const PX = 858, PY = 384, BEAM = 208, STRING = 50, PANW = 190, TILT = -0.075;
const lx = PX - BEAM * Math.cos(TILT), ly = PY - BEAM * Math.sin(TILT);
const rx = PX + BEAM * Math.cos(TILT), ry = PY + BEAM * Math.sin(TILT);

function pan(ex, ey) {
  const py = ey + STRING;
  return `<line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${(ex - PANW * 0.42).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${INK}" stroke-width="3"/>
    <line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${(ex + PANW * 0.42).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${INK}" stroke-width="3"/>
    <path d="M ${(ex - PANW / 2).toFixed(1)} ${py.toFixed(1)} Q ${ex.toFixed(1)} ${(py + 64).toFixed(1)} ${(ex + PANW / 2).toFixed(1)} ${py.toFixed(1)} Z"
          fill="rgba(35,31,32,0.09)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
}

const topPiece = shape(top, { ...centreOf(top), k: 1.45, rot: -0.14, x: lx, y: ly + STRING + 4 }, 2.5);
const botPiece = shape(bot, { ...centreOf(bot), k: 1.45, rot: 0.16, x: rx, y: ry + STRING + 2 }, 2.5);

// The whole country above, with the line that made those two halves.
const TOP_K = 2.5, TOPX = 858, TOPY = 160;
const whole = shape(pts, { cx: 50, cy: 50, k: TOP_K, rot: 0, x: TOPX, y: TOPY }, 3.5);
const cx0 = TOPX + (P0.x - 50) * TOP_K, cy0 = TOPY + (P0.y - 50) * TOP_K;
const cx1 = TOPX + (P1.x - 50) * TOP_K, cy1 = TOPY + (P1.y - 50) * TOP_K;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${INK}" stroke-opacity="0.12" stroke-width="1"/>

  ${whole}
  <line x1="${cx0.toFixed(1)}" y1="${cy0.toFixed(1)}" x2="${cx1.toFixed(1)}" y2="${cy1.toFixed(1)}"
        stroke="${CUT}" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round"/>

  <path d="M ${PX} ${PY} L ${PX - 40} ${H - 92} L ${PX + 40} ${H - 92} Z" fill="${INK}"/>
  <rect x="${PX - 96}" y="${H - 92}" width="192" height="14" fill="${INK}"/>
  <line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}"
        stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="${PX}" cy="${PY}" r="11" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
  ${pan(lx, ly)}
  ${pan(rx, ry)}
  ${topPiece}
  ${botPiece}

  <g transform="translate(78, 212) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>
  <text x="78" y="${212 + LOGO_H + 64}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="29" fill="${MUTED}">
    One straight cut, no second line.
  </text>
  <text x="78" y="${212 + LOGO_H + 106}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="29" fill="${MUTED}">
    A hundred countries to halve.
  </text>

  <text x="78" y="${H - 62}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="22" font-weight="700"
    letter-spacing="3.2" fill="${CUT}">
    WITHIN 5% OR CUT IT AGAIN
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/nation-divided-og.png'));

console.log('✓ nation-divided-og.png written —', country.name);
