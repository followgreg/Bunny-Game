import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Excerpt wordmark — already dark ink, so it needs no recolouring on parchment
let logo = readFileSync(join(__dirname, 'assets/logos/excerpt_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#1E1A16"');

const W = 1200, H = 630;
const LOGO_W = 560;
const LOGO_H = LOGO_W * (19.085 / 72.267);
const logoX = (W - LOGO_W) / 2;
const logoY = H / 2 - LOGO_H / 2 - 34;
const taglineY = logoY + LOGO_H + 74;

// The four reveal stages, drawn as widening rules — the game's core idea at a glance
const barY = H - 132;
const barW = [90, 200, 320, 470];
let bars = '';
barW.forEach((w, i) => {
  const x = W / 2 - w / 2;
  bars += `<rect x="${x}" y="${barY + i * 15}" width="${w}" height="3" rx="1.5" ` +
          `fill="#1E1A16" opacity="${(0.16 + i * 0.10).toFixed(2)}"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#F5F0E8"/>
  <!-- faint page edge -->
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="#1E1A16" stroke-opacity="0.10" stroke-width="1"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 72.267})">
    ${logo}
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="34" fill="#1E1A16" fill-opacity="0.62" text-anchor="middle">
    Can you identify the passage?
  </text>
  ${bars}
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/excerpt-og.png'));

console.log('✓ excerpt-og.png written');
