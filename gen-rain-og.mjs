import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink. Here it goes white — the card is the
// game, and the game is two colours.
let logo = readFileSync(join(__dirname, 'assets/logos/rain_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#ffffff"');

const W = 1200, H = 630;

const LOGO_VB_W = 85.923, LOGO_VB_H = 41.158;
const LOGO_W = 430;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

// The street. Everything above KERB is city, everything below is road.
const KERB = 452;
const FEET = 566;
const RS   = 252;          // rabbit height, ear tips to soles
const RX   = 856;          // where he is standing

// The pool of lamplight he is walking through — the whole point of the card,
// since it is what flips him from white to black at the waist.
// It starts a little way into the road rather than at the kerb, so the line it
// cuts across him lands at the hem of the coat instead of across his chest.
const POOL = { x0: 706, x1: 1022, top: 470, spread: 34 };
const poolPath =
  `M ${POOL.x0} ${POOL.top} L ${POOL.x1} ${POOL.top} ` +
  `L ${POOL.x1 + POOL.spread} ${H} L ${POOL.x0 - POOL.spread} ${H} Z`;

let seed = 20260809;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const n = v => Math.round(v * 100) / 100;

// ── Skyline ─────────────────────────────────────────────────────────────────
// Filled black, stroked white, open at the bottom so a row of them does not
// turn into a picket fence of shared edges.
// The left third stays low and far off, so the wordmark sits on clean black
// instead of fighting a row of outlines.
let city = '';
let bx = -30;
while (bx < W + 30) {
  const near = bx > 470;
  const bw = near ? 74 + rnd() * 96 : 90 + rnd() * 70;
  const bt = near ? 132 + rnd() * 208 : 400 + rnd() * 34;
  city += `<rect x="${n(bx)}" y="${n(bt)}" width="${n(bw)}" height="${n(KERB - bt)}" fill="#000000"/>`;
  city += `<path d="M ${n(bx + 1)} ${KERB} L ${n(bx + 1)} ${n(bt + 1)} ` +
          `L ${n(bx + bw - 1)} ${n(bt + 1)} L ${n(bx + bw - 1)} ${KERB}" ` +
          `fill="none" stroke="#ffffff" stroke-width="3"/>`;
  for (let wy = bt + 30; wy < KERB - 34; wy += 46) {
    for (let wx = bx + 16; wx < bx + bw - 24; wx += 30) {
      if (rnd() > 0.30) continue;
      city += `<rect x="${n(wx)}" y="${n(wy)}" width="13" height="16" fill="#ffffff"/>`;
    }
  }
  bx += bw;
}

// A lamppost, so the pool has something making it
const LPX = POOL.x1 + 6, LPY = KERB - 296;
const lamp =
  `<path d="M ${LPX} ${KERB} L ${LPX} ${LPY}" stroke="#ffffff" stroke-width="7" fill="none"/>` +
  `<path d="M ${LPX - 30} ${LPY + 8} Q ${LPX} ${LPY - 18} ${LPX + 30} ${LPY + 8}" ` +
  `stroke="#ffffff" stroke-width="5" fill="none"/>` +
  `<path d="M ${LPX - 25} ${LPY + 4} L ${LPX + 25} ${LPY + 4} L ${LPX + 13} ${LPY + 32} ` +
  `L ${LPX - 13} ${LPY + 32} Z" fill="#ffffff"/>`;

// ── Rain ────────────────────────────────────────────────────────────────────
// Two registers: fat streaks, which are the ones that end your run, and a fine
// drizzle behind them that is only weather.
const streaks = [];
for (let i = 0; i < 34; i++) {
  const x = rnd() * W;
  // Keep the fat ones off the wordmark so the type stays clean
  if (x < 560 && x > 60) continue;
  streaks.push({ x, y: rnd() * (H - 120), len: 66 + rnd() * 128, w: 5 + rnd() * 5 });
}
const streakRects = streaks.map(s =>
  `<rect x="${n(s.x - s.w / 2)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.len)}"/>`).join('');

let drizzle = '';
for (let i = 0; i < 210; i++) {
  const x = rnd() * W, y = rnd() * H, l = 14 + rnd() * 30;
  drizzle += `<path d="M ${n(x)} ${n(y)} L ${n(x)} ${n(y + l)}"/>`;
}

// ── The rabbit ──────────────────────────────────────────────────────────────
// Same geometry the game draws, in the same unit space: origin between the
// soles, y negative going up, one unit = his full height.
function ear(bxu, byu, txu, tyu, wd) {
  const mid = byu * 0.45 + tyu * 0.55;
  return `M ${bxu - wd} ${byu} ` +
         `C ${txu - wd * 1.5} ${mid} ${txu - wd * 1.15} ${tyu + wd * 1.1} ${txu} ${tyu} ` +
         `C ${txu + wd * 1.15} ${tyu + wd * 1.1} ${txu + wd * 1.5} ${mid} ${bxu + wd} ${byu} Z`;
}

function legStroke(swing, hipX) {
  const footX = hipX + swing * 0.100;
  const footY = -Math.max(0, swing) * 0.045;
  return `M ${hipX} -0.310 Q ${hipX + swing * 0.050} -0.150 ${n2(footX)} ${n2(footY - 0.016)}`;
}
function legShoe(swing, hipX) {
  const footX = hipX + swing * 0.100;
  const footY = -Math.max(0, swing) * 0.045;
  return `M ${n2(footX - 0.034)} ${n2(footY - 0.028)} L ${n2(footX + 0.060)} ${n2(footY - 0.022)} ` +
         `Q ${n2(footX + 0.078)} ${n2(footY - 0.003)} ${n2(footX + 0.050)} ${n2(footY)} ` +
         `L ${n2(footX - 0.038)} ${n2(footY)} Z`;
}
const n2 = v => Math.round(v * 10000) / 10000;

// Caught mid-stride rather than standing to attention
const SWING = 0.62;

function rabbit(body, detail) {
  return `
  <g fill="${body}" stroke="${body}" stroke-linejoin="round" stroke-linecap="round">
    <path d="${legStroke(-SWING, -0.040)}" fill="none" stroke-width="0.056"/>
    <path d="${legShoe(-SWING, -0.040)}" stroke="none"/>
    <path d="${ear(-0.014, -0.630, -0.128, -0.975, 0.032)}" stroke="none"/>
    <path d="${ear(0.066, -0.630, 0.150, -0.938, 0.030)}" stroke="none"/>
    <path stroke="none" d="M -0.128 -0.572
      C -0.150 -0.498 -0.146 -0.432 -0.132 -0.374
      C -0.170 -0.332 -0.214 -0.292 -0.238 -0.242
      L -0.152 -0.262
      C -0.086 -0.300 0.030 -0.312 0.132 -0.298
      C 0.152 -0.392 0.148 -0.492 0.138 -0.572 Z"/>
    <path d="${legStroke(SWING, 0.042)}" fill="none" stroke-width="0.056"/>
    <path d="${legShoe(SWING, 0.042)}" stroke="none"/>
    <path stroke="none" d="M -0.126 -0.556 L -0.104 -0.646 L -0.030 -0.592 Z"/>
    <path stroke="none" d="M 0.142 -0.552 L 0.128 -0.640 L 0.062 -0.590 Z"/>
    <ellipse cx="0.030" cy="-0.648" rx="0.084" ry="0.062"
      transform="rotate(-2.9 0.030 -0.648)" stroke="none"/>
    <path stroke="none" d="M 0.062 -0.692
      C 0.152 -0.684 0.180 -0.644 0.156 -0.612
      C 0.130 -0.588 0.062 -0.584 0.036 -0.596 Z"/>
    <ellipse cx="0.030" cy="-0.700" rx="0.203" ry="0.030"
      transform="rotate(-2.6 0.030 -0.700)" stroke="none"/>
    <path stroke="none" d="M -0.058 -0.702 L -0.048 -0.836
      Q -0.030 -0.886 0.014 -0.874
      Q 0.038 -0.866 0.062 -0.878
      Q 0.100 -0.892 0.108 -0.836
      L 0.116 -0.702 Z"/>
  </g>
  <g fill="${detail}" stroke="${detail}" stroke-linecap="round">
    <path stroke="none" d="M -0.058 -0.706 L 0.116 -0.706 L 0.113 -0.742 L -0.055 -0.742 Z"/>
    <path fill="none" stroke-width="0.012" d="M -0.058 -0.742 L -0.048 -0.836
      Q -0.030 -0.886 0.014 -0.874
      Q 0.038 -0.866 0.062 -0.878
      Q 0.100 -0.892 0.108 -0.836
      L 0.114 -0.742"/>
    <path fill="none" stroke-width="0.010" d="M 0.106 -0.812 Q 0.124 -0.862 0.138 -0.902"/>
    <circle cx="0.062" cy="-0.652" r="0.0135" stroke="none"/>
    <circle cx="0.164" cy="-0.640" r="0.0105" stroke="none"/>
    <path fill="none" stroke-width="0.010" d="M 0.152 -0.618 L 0.112 -0.612"/>
    <path fill="none" stroke-width="0.012" d="M 0.052 -0.564
      C 0.080 -0.500 0.086 -0.430 0.082 -0.320"/>
    <path fill="none" stroke-width="0.014" d="M -0.140 -0.408 L 0.148 -0.420"/>
    <path fill="none" stroke-width="0.011" d="M 0.112 -0.548
      C 0.128 -0.492 0.128 -0.456 0.122 -0.424"/>
  </g>`;
}

// The shear leans him into the weather, pivoting on his soles
const RTRANSFORM = `translate(${RX} ${FEET}) scale(${RS}) matrix(1 0 -0.055 1 0 0)`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="pool"><path d="${poolPath}"/></clipPath>
    <clipPath id="dry"><path d="M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z ${poolPath}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#000000"/>

  ${city}
  ${lamp}

  <!-- road, then the pool of light on it -->
  <rect x="0" y="${KERB}" width="${W}" height="${H - KERB}" fill="#000000"/>
  <path d="M 0 ${KERB} L ${W} ${KERB}" stroke="#ffffff" stroke-width="3"/>
  <path d="${poolPath}" fill="#ffffff"/>

  <g stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.30" fill="none">${drizzle}</g>

  <!-- the rabbit: white on the dark street, black where the lamplight is -->
  <g clip-path="url(#dry)"><g transform="${RTRANSFORM}">${rabbit('#ffffff', '#000000')}</g></g>
  <g clip-path="url(#pool)"><g transform="${RTRANSFORM}">${rabbit('#000000', '#ffffff')}</g></g>

  <!-- and the rain does the same thing -->
  <g clip-path="url(#dry)" fill="#ffffff">${streakRects}</g>
  <g clip-path="url(#pool)" fill="#000000">${streakRects}</g>

  <g transform="translate(84, ${(H - LOGO_H) / 2 - 76}) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>

  <text x="88" y="${(H - LOGO_H) / 2 - 76 + LOGO_H + 48}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="33" font-weight="700" fill="#ffffff" fill-opacity="0.92">
    Cross the street. Dodge the downpour.
  </text>

  <text x="90" y="${H - 56}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="21" font-weight="700"
    letter-spacing="3.4" fill="#ffffff" fill-opacity="0.5">
    IT NEVER STOPS RAINING IN THIS TOWN
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/rain-og.png'));

console.log('✓ rain-og.png written');
