import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink on a light board, so it goes in as-is.
let logo = readFileSync(join(__dirname, 'assets/logos/topcut_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#231f20"');

const W = 1200, H = 630;
const PAPER = '#F5F0E8', INK = '#231f20', CUT = '#E4572E', MUTED = '#8A8073';
const BUN = '#F0B36B', BUN_EDGE = '#A9702F', SAUSAGE = '#C0472B', MUSTARD = '#F5C518';

const LOGO_VB_W = 99.523, LOGO_VB_H = 18.787;
const LOGO_W = 400;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

// The picture has one job: show a shape already split by a straight line, with
// the two halves sitting in the pans of a balance that is very slightly off
// level. It is drawn from the game's own level-one polygon and its own clipper,
// so those are the halves that line actually produces.
const DOG = [4,44, 10,40, 14,36, 20,32, 30,30, 50,29, 70,30, 80,32, 86,36, 90,40,
             96,44, 98,50, 96,56, 90,60, 86,64, 80,68, 70,70, 50,71, 30,70, 20,68,
             14,64, 10,60, 4,56, 2,50];
const BAND = [8,47, 20,44, 36,42, 50,41, 64,42, 80,44, 92,47,
              92,54, 80,57, 64,59, 50,60, 36,59, 20,57, 8,54];
const SQUIRT = [14,50, 24,45, 34,53, 44,45, 54,53, 64,45, 74,53, 86,47];

const toPts = (f) => { const a = []; for (let i = 0; i < f.length; i += 2) a.push({ x: f[i], y: f[i + 1] }); return a; };
const dog = toPts(DOG), band = toPts(BAND), squirt = toPts(SQUIRT);

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

// A cut a touch left of centre — the halves are near equal but not equal, which
// is exactly what the tilted beam underneath is reporting.
const P0 = { x: 46, y: 0 }, P1 = { x: 49, y: 100 };
const nx0 = -(P1.y - P0.y), ny0 = (P1.x - P0.x);
const L = Math.hypot(nx0, ny0);
const nx = nx0 / L, ny = ny0 / L, d = -(nx * P0.x + ny * P0.y);
const left = clip(dog, nx, ny, d);
const right = clip(dog, -nx, -ny, -d);

const centreOf = (ring) => {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

// One transform per placement, shared by the silhouette and its decoration, so
// the sausage stays where it was inside the bun.
function place(ring, t, close = true) {
  const c = Math.cos(t.rot || 0), s = Math.sin(t.rot || 0);
  return ring.map((p, i) => {
    const lx = (p.x - t.cx) * t.k, ly = (p.y - t.cy) * t.k;
    return `${i ? 'L' : 'M'} ${(t.x + lx * c - ly * s).toFixed(1)} ${(t.y + lx * s + ly * c).toFixed(1)}`;
  }).join(' ') + (close ? ' Z' : '');
}

let clipDefs = '';
let uid = 0;
function dog_(ring, t) {
  const id = `cp${uid++}`;
  const outline = place(ring, t);
  clipDefs += `<clipPath id="${id}"><path d="${outline}"/></clipPath>`;
  return `<g clip-path="url(#${id})">
      <path d="${place(dog, t)}" fill="${BUN}"/>
      <path d="${place(band, t)}" fill="${SAUSAGE}"/>
      <path d="${place(squirt, t, false)}" fill="none" stroke="${MUSTARD}" stroke-width="${(3.4 * t.k).toFixed(1)}"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <path d="${outline}" fill="none" stroke="${BUN_EDGE}" stroke-width="4" stroke-linejoin="round"/>`;
}

// Balance geometry — pushed right so the wordmark and strapline own the left third.
const PX = 858, PY = 384, BEAM = 208, STRING = 50, PANW = 190, TILT = 0.085;
const lx = PX - BEAM * Math.cos(TILT), ly = PY - BEAM * Math.sin(TILT);
const rx = PX + BEAM * Math.cos(TILT), ry = PY + BEAM * Math.sin(TILT);

function pan(ex, ey) {
  const py = ey + STRING;
  return `<line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${(ex - PANW * 0.42).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${INK}" stroke-width="3"/>
    <line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${(ex + PANW * 0.42).toFixed(1)}" y2="${py.toFixed(1)}" stroke="${INK}" stroke-width="3"/>
    <path d="M ${(ex - PANW / 2).toFixed(1)} ${py.toFixed(1)} Q ${ex.toFixed(1)} ${(py + 64).toFixed(1)} ${(ex + PANW / 2).toFixed(1)} ${py.toFixed(1)} Z"
          fill="rgba(35,31,32,0.09)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
}

const lc = centreOf(left), rc = centreOf(right);
const leftPiece = dog_(left, { ...lc, cx: lc.x, cy: lc.y, k: 1.5, rot: -0.13, x: lx, y: ly + STRING + 6 });
const rightPiece = dog_(right, { ...rc, cx: rc.x, cy: rc.y, k: 1.5, rot: 0.15, x: rx, y: ry + STRING + 2 });

// The uncut object above, with the line that made those two halves.
const TOP_K = 2.8, TOPX = 858, TOPY = 158;
const whole = dog_(dog, { cx: 50, cy: 50, k: TOP_K, rot: 0, x: TOPX, y: TOPY });
const cutX0 = TOPX + (P0.x - 50) * TOP_K, cutX1 = TOPX + (P1.x - 50) * TOP_K;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${clipDefs}</defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${INK}" stroke-opacity="0.12" stroke-width="1"/>

  ${whole}
  <line x1="${cutX0.toFixed(1)}" y1="76" x2="${cutX1.toFixed(1)}" y2="248"
        stroke="${CUT}" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round"/>

  <path d="M ${PX} ${PY} L ${PX - 40} ${H - 92} L ${PX + 40} ${H - 92} Z" fill="${INK}"/>
  <rect x="${PX - 96}" y="${H - 92}" width="192" height="14" fill="${INK}"/>
  <line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}"
        stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="${PX}" cy="${PY}" r="11" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>
  ${pan(lx, ly)}
  ${pan(rx, ry)}
  ${leftPiece}
  ${rightPiece}

  <g transform="translate(78, 210) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>
  <text x="78" y="${210 + LOGO_H + 66}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="29" fill="${MUTED}">
    One straight cut, no second line.
  </text>
  <text x="78" y="${210 + LOGO_H + 108}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="29" fill="${MUTED}">
    The scale says how close you got.
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
  .toFile(join(__dirname, 'assets/og-images/topcut-og.png'));

console.log('✓ topcut-og.png written');
