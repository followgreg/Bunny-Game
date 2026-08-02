import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Protractor wordmark — ships as black paths, kept dark navy on the white card
let logo = readFileSync(join(__dirname, 'assets/logos/protractor_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '');

const W = 1200, H = 630;

// Palette lifted straight from the game
const ORANGE = '#FF6B35';
const BLUE   = '#3498DB';
const DARK   = '#2C3E50';

// Wordmark viewBox is 106.583 x 15.166
const LOGO_VB_W = 106.583, LOGO_VB_H = 15.166;
const LOGO_W = 520;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);
const logoX = (W - LOGO_W) / 2;
const logoY = 96;
const taglineY = logoY + LOGO_H + 58;

// ── The angle diagram, drawn the same way the game draws it ──────────────────
// Maths in normal orientation, flipped on y at the end because SVG's y grows
// downward. 52 degrees is acute enough to read instantly at thumbnail size.
const ANGLE = 52;
const RAY   = 270;
const ARC_R = 82;

const rad = (ANGLE * Math.PI) / 180;
const cos = Math.cos(rad), sin = Math.sin(rad);

// The vertex is not the drawing's centre — for an acute angle the ink spans
// [cx, cx+RAY] across and [cy-RAY*sin, cy] down. Centring the vertex would hang
// the whole figure off to the right, so the bounding box is centred instead.
const ART_CY = 428;                       // middle of the space under the tagline
const cx = W / 2 - RAY / 2;
const cy = ART_CY + (RAY * sin) / 2;

const hx = cx + RAY;                 // horizontal ray tip
const ax = cx + RAY * cos;           // angled ray tip
const ay = cy - RAY * sin;

const arcStartX = cx + ARC_R;
const arcEndX   = cx + ARC_R * cos;
const arcEndY   = cy - ARC_R * sin;

// Arrowhead: 18 back from the tip, 8 either side, perpendicular of (dx, dy)
function head(tipX, tipY, dx, dy) {
  const bx = tipX - 18 * dx, by = tipY - 18 * dy;
  const px = -dy, py = dx;
  return [
    `${tipX},${tipY}`,
    `${bx + 8 * px},${by + 8 * py}`,
    `${bx - 8 * px},${by - 8 * py}`,
  ].join(' ');
}

const f = (n) => Math.round(n * 100) / 100;

// Label on the bisector, outside the arc
const labelR = ARC_R * 1.62;
const half   = rad / 2;
const lx = cx + labelR * Math.cos(half);
const ly = cy - labelR * Math.sin(half) + 12;

const diagram = `
  <path d="M ${f(arcStartX)} ${f(cy)} A ${ARC_R} ${ARC_R} 0 0 0 ${f(arcEndX)} ${f(arcEndY)}"
        fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round"/>
  <line x1="${f(cx)}" y1="${f(cy)}" x2="${f(hx)}" y2="${f(cy)}"
        stroke="${DARK}" stroke-width="6" stroke-linecap="round"/>
  <polygon points="${head(f(hx), f(cy), 1, 0)}" fill="${DARK}"/>
  <line x1="${f(cx)}" y1="${f(cy)}" x2="${f(ax)}" y2="${f(ay)}"
        stroke="${BLUE}" stroke-width="6" stroke-linecap="round"/>
  <polygon points="${head(f(ax), f(ay), cos, -sin)}" fill="${BLUE}"/>
  <circle cx="${f(cx)}" cy="${f(cy)}" r="9" fill="${DARK}"/>
  <text x="${f(lx)}" y="${f(ly)}" font-size="44" font-weight="700"
        fill="${ORANGE}" text-anchor="middle"
        font-family="DM Sans, Helvetica, Arial, sans-serif">?°</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${DARK}" stroke-opacity="0.12" stroke-width="1"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / LOGO_VB_W})">
    <g fill="${DARK}">${logo}</g>
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="34" font-weight="500" fill="${DARK}" fill-opacity="0.60" text-anchor="middle">
    Two rays. One angle. How close can you get?
  </text>
  ${diagram}
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/protractor-og.png'));

console.log('✓ protractor-og.png written');
