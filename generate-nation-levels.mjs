/* ============================================================
   Nation Divided — level generator

   Reads world-atlas countries-110m (public domain, Natural Earth), keeps each
   country's largest contiguous landmass, projects it, simplifies it to a point
   budget the clipper is happy with, and writes nation-levels.json ordered by
   shape complexity.

   Run:  node generate-nation-levels.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { feature } from 'topojson-client';
import { geoAzimuthalEqualArea } from 'd3-geo';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── The launch set ──────────────────────────────────────────────────────────
// [display name, ISO 3166-1 alpha-2 (the flag file), world-atlas name if it
// differs from the display name].
const COUNTRIES = [
  // Africa
  ['Egypt','eg'], ['Libya','ly'], ['Algeria','dz'], ['Morocco','ma'], ['Tunisia','tn'],
  ['Chad','td'], ['Niger','ne'], ['Mali','ml'], ['Sudan','sd'], ['Ethiopia','et'],
  ['Somalia','so'], ['Kenya','ke'], ['Tanzania','tz'], ['Uganda','ug'], ['Rwanda','rw'],
  ['Nigeria','ng'], ['Ghana','gh'], ['Senegal','sn'], ['Cameroon','cm'],
  ['DR Congo','cd','Dem. Rep. Congo'], ['Congo','cg'], ['Gabon','ga'], ['Angola','ao'],
  ['Zambia','zm'], ['Zimbabwe','zw'], ['Mozambique','mz'], ['Madagascar','mg'],
  ['South Africa','za'], ['Namibia','na'], ['Botswana','bw'],
  // Europe
  ['France','fr'], ['Spain','es'], ['Portugal','pt'], ['Italy','it'], ['Germany','de'],
  ['Poland','pl'], ['Ukraine','ua'], ['Romania','ro'], ['Greece','gr'], ['Norway','no'],
  ['Sweden','se'], ['Finland','fi'], ['United Kingdom','gb'], ['Ireland','ie'],
  ['Iceland','is'], ['Switzerland','ch'], ['Austria','at'], ['Belgium','be'],
  ['Netherlands','nl'], ['Denmark','dk'], ['Hungary','hu'],
  ['Czech Republic','cz','Czechia'], ['Croatia','hr'], ['Bulgaria','bg'],
  // Asia
  ['China','cn'], ['India','in'], ['Russia','ru'], ['Mongolia','mn'], ['Kazakhstan','kz'],
  ['Saudi Arabia','sa'], ['Iran','ir'], ['Iraq','iq'], ['Turkey','tr'], ['Pakistan','pk'],
  ['Afghanistan','af'], ['Thailand','th'], ['Vietnam','vn'], ['Myanmar','mm'],
  ['South Korea','kr'], ['North Korea','kp'], ['Japan','jp'], ['Nepal','np'],
  ['Sri Lanka','lk'], ['Yemen','ye'], ['Oman','om'], ['Israel','il'], ['Jordan','jo'],
  ['Syria','sy'],
  // Americas
  ['United States','us','United States of America'], ['Canada','ca'], ['Mexico','mx'],
  ['Brazil','br'], ['Argentina','ar'], ['Chile','cl'], ['Peru','pe'], ['Colombia','co'],
  ['Venezuela','ve'], ['Bolivia','bo'], ['Ecuador','ec'], ['Paraguay','py'],
  ['Uruguay','uy'], ['Cuba','cu'], ['Guatemala','gt'], ['Honduras','hn'],
  ['Costa Rica','cr'], ['Panama','pa'], ['Dominican Republic','do','Dominican Rep.'],
  // Oceania
  ['Australia','au'], ['New Zealand','nz'], ['Papua New Guinea','pg'],
];

const MIN_PTS = 20;       // below this a country stops reading as itself
const MAX_PTS = 80;       // above this the clipper is doing needless work
const HARD_MAX = 260;     // ...but accuracy outranks the budget, see AREA_TOL
const AREA_TOL = 0.5;     // percent — "off by X%" has to mean the real thing
const HOLE_MIN_PTS = 8;

// One simplification threshold for every country: a vertex survives if the
// triangle it makes with its neighbours is at least this fraction of the
// country's own area.
//
// Measuring against the country's area rather than a fixed size in the box is
// the whole trick. Chad's borders are long straight runs that Natural Earth
// stores as many nearly collinear points, and those cost almost nothing to
// drop, so Chad collapses to a handful of corners. Norway's fjords cannot be
// dropped that cheaply. An absolute threshold got this backwards, because
// normalising to a 100x100 box shrinks a long thin country's detail until its
// fjords look like noise — Norway came out simpler than Chad, which is exactly
// wrong. Relative to its own area, Norway's coastline is enormous.
const SIMPLIFY_FRAC = Number(process.env.ND_FRAC || 0.0008);

// ── Geometry ────────────────────────────────────────────────────────────────
function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}

function tri(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

// Visvalingam–Whyatt: repeatedly drop the point whose triangle with its two
// neighbours is smallest, and record the area it cost. This is the algorithm
// topojson-simplify uses, and it is chosen over Douglas–Peucker precisely
// because it is area-based — it gives up the least area per point removed,
// which is what keeps "percent off" honest after simplification.
//
// Returns the ring's points each tagged with an effective area, forced upward
// so it never decreases along the removal order. That monotonicity is what
// lets one global threshold and a point count be read off the same ranking.
function rank(ring) {
  const pts = ring.map((p) => ({ p, w: 0 }));
  if (pts.length <= 3) { pts.forEach((q) => { q.w = Infinity; }); return pts; }
  const live = pts.map((_, i) => i);
  const at = (k) => pts[live[(k + live.length) % live.length]].p;
  const areas = new Map();
  const calc = (k) => tri(at(k - 1), at(k), at(k + 1));
  for (let k = 0; k < live.length; k++) areas.set(live[k], calc(k));

  let floor = 0;
  while (live.length > 3) {
    let worstK = 0, worst = Infinity;
    for (let k = 0; k < live.length; k++) {
      const a = areas.get(live[k]);
      if (a < worst) { worst = a; worstK = k; }
    }
    floor = Math.max(floor, worst);
    pts[live[worstK]].w = floor;
    live.splice(worstK, 1);
    const n = live.length;
    for (const k of [(worstK - 1 + n) % n, worstK % n]) areas.set(live[k], calc(k));
  }
  for (const i of live) pts[i].w = Infinity;
  return pts;
}

// The n most important points, in original order.
function takeTop(ranked, n) {
  n = Math.max(3, Math.min(n, ranked.length));
  const cut = ranked.map((q) => q.w).sort((a, b) => b - a)[n - 1];
  const keep = ranked.filter((q) => q.w >= cut);
  // Ties at the cut can overshoot; trimming the earliest of them keeps the
  // count exact without disturbing the ring's order.
  while (keep.length > n) {
    let idx = -1;
    for (let i = 0; i < keep.length; i++) if (keep[i].w === cut) { idx = i; break; }
    if (idx < 0) break;
    keep.splice(idx, 1);
  }
  return keep.map((q) => q.p);
}

function countAbove(ranked, t) {
  let n = 0;
  for (const q of ranked) if (q.w >= t) n++;
  return n;
}

// ── Source data ─────────────────────────────────────────────────────────────
// 50m, not 110m. At 110m the render would be fine, but the ordering would not:
// that resolution stores Norway in 50 points and Chad in 58, so it has no
// fjords left to notice and ranks Norway as the simpler shape. 50m carries
// Norway at 994 points against Chad's 291, which is the signal the complexity
// sort is supposed to read. Everything still simplifies to the same budget
// before it ships, so the board draws no more than it did.
const topo = JSON.parse(readFileSync(join(__dirname, 'node_modules/world-atlas/countries-50m.json'), 'utf8'));
const fc = feature(topo, topo.objects.countries);
const byName = new Map(fc.features.map((f) => [f.properties.name, f]));

function polygonsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

// Rough spherical area, only ever used to rank a country's own polygons against
// each other so the mainland wins over its offshore islands.
function lonLatArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i];
    const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    a += (x1 * k) * y2 - (x2 * k) * y1;
  }
  return Math.abs(a / 2);
}

const levels = [];
const report = [];

for (const [name, cc, atlasName] of COUNTRIES) {
  const f = byName.get(atlasName || name);
  if (!f) { console.error('MISSING:', name); continue; }

  // Largest contiguous landmass only. An archipelago cannot be cut by one
  // straight line in any way the player can reason about, so Japan is Honshu,
  // the UK is Great Britain, and Italy leaves Sicily and Sardinia behind.
  const polys = polygonsOf(f.geometry);
  let best = null, bestA = -1, dropped = 0;
  for (const p of polys) {
    const a = lonLatArea(p[0]);
    if (a > bestA) { if (best) dropped++; bestA = a; best = p; } else dropped++;
  }

  // Centre an equal-area projection on the country itself. A world-wide
  // equirectangular would hand Norway and Canada a silhouette stretched to
  // twice their width; this keeps every shape recognisable and, being equal
  // area, keeps the two pieces' areas comparable to the real thing.
  // The centre longitude is a circular mean, not a bounding-box midpoint.
  // Russia's mainland runs past the antimeridian, so its longitudes span the
  // full -180..180 range and a midpoint lands at 0 degrees — in the Atlantic,
  // on the far side of the globe from the country being projected. That threw
  // Russia through the back of the projection and came out as a vertical blob.
  let sx = 0, sy = 0, la0 = Infinity, la1 = -Infinity;
  for (const [lon, lat] of best[0]) {
    sx += Math.cos(lon * Math.PI / 180);
    sy += Math.sin(lon * Math.PI / 180);
    if (lat < la0) la0 = lat; if (lat > la1) la1 = lat;
  }
  const lon0 = Math.atan2(sy, sx) * 180 / Math.PI;
  const projection = geoAzimuthalEqualArea()
    .rotate([-lon0, -(la0 + la1) / 2])
    .scale(1000)
    .translate([0, 0]);

  const project = (ring) => {
    const out = [];
    for (const c of ring) {
      const p = projection(c);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      out.push([p[0], p[1]]);
    }
    // TopoJSON rings close by repeating the first point; the clipper closes
    // its own rings, so the duplicate would be a zero-length edge.
    if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    return out;
  };

  // Normalise into a 0–100 box, aspect preserved, BEFORE simplifying — the
  // threshold has to mean the same thing for Russia as it does for Rwanda.
  const rawOuter = project(best[0]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of rawOuter) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const k = 100 / Math.max(x1 - x0, y1 - y0);
  const ox = (100 - (x1 - x0) * k) / 2, oy = (100 - (y1 - y0) * k) / 2;
  const norm = (ring) => ring.map(([x, y]) => [(x - x0) * k + ox, (y - y0) * k + oy]);

  const srcOuter = norm(rawOuter);
  const outerArea = ringArea(srcOuter);
  // Keep the enclaves that are actually a hole in the country — Lesotho is
  // 2.5% of South Africa and changes where half of it is. Drop the rest: San
  // Marino and the Vatican round to nothing, and Natural Earth leaves a couple
  // of sliver artifacts that are pure clipping cost with nothing to show.
  const srcHoles = best.slice(1)
    .map((r) => norm(project(r)))
    .filter((h) => h.length >= 3 && ringArea(h) / outerArea >= 0.002);
  const srcArea = ringArea(srcOuter) - srcHoles.reduce((s, h) => s + ringArea(h), 0);

  const rankedOuter = rank(srcOuter);
  const rankedHoles = srcHoles.map(rank);

  // One threshold for everyone. The uncapped count is kept as the complexity
  // key: sixteen countries want more than the budget allows, and ordering them
  // by the clamped count would put them in alphabetical order pretending to be
  // difficulty order.
  const natural = countAbove(rankedOuter, SIMPLIFY_FRAC * srcArea);
  let n = Math.max(MIN_PTS, Math.min(MAX_PTS, natural));
  n = Math.min(n, srcOuter.length);

  const build = (count) => {
    const o = takeTop(rankedOuter, count);
    const h = rankedHoles.map((r) => takeTop(r, Math.max(HOLE_MIN_PTS, Math.round(count / 4))));
    const a = ringArea(o) - h.reduce((s, x) => s + ringArea(x), 0);
    return { o, h, err: Math.abs(a - srcArea) / srcArea * 100 };
  };

  // Area is the entire game, so tolerance wins over the budget: a country that
  // is still off by more than half a percent gets points back until it is not.
  // Visvalingam removals alternate between shaving area off and adding it back,
  // so the error wobbles as it falls rather than dropping monotonically. Take
  // the first count that clears the tolerance, and failing that the best one
  // seen — not simply wherever the walk happened to stop.
  let out = build(n), bestOut = out, bestN = n;
  const ceiling = Math.min(HARD_MAX, srcOuter.length);
  while (out.err > AREA_TOL && n < ceiling) {
    n = Math.min(ceiling, n + 2);
    out = build(n);
    if (out.err < bestOut.err) { bestOut = out; bestN = n; }
  }
  if (out.err > AREA_TOL) { out = bestOut; n = bestN; }

  const flat = (ring) => {
    const f = [];
    for (const [x, y] of ring) f.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    return f;
  };

  const lvl = { name, cc, outer: flat(out.o), pts: out.o.length };
  if (out.h.length) {
    lvl.holes = out.h.map(flat);
    lvl.pts += out.h.reduce((s, h) => s + h.length, 0);
  }
  lvl.k = natural;                    // complexity key, stripped before writing
  levels.push(lvl);
  report.push({ name, pts: lvl.pts, natural, srcPts: srcOuter.length,
                areaErrPct: +out.err.toFixed(3), droppedPolys: dropped });
}

// Ascending by complexity: compact borders first, shredded coastlines last.
// Ties break alphabetically so the order is stable between regenerations.
levels.sort((a, b) => a.k - b.k || a.pts - b.pts || a.name.localeCompare(b.name));
levels.forEach((l) => { delete l.k; });

writeFileSync(join(__dirname, 'nation-levels.json'),
  JSON.stringify({ v: 1, source: 'world-atlas countries-110m (Natural Earth, public domain)', levels }));

// ── Flags ───────────────────────────────────────────────────────────────────
const flagDir = join(__dirname, 'assets/flags');
if (!existsSync(flagDir)) mkdirSync(flagDir, { recursive: true });
let flagged = 0;
for (const l of levels) {
  const src = join(__dirname, 'node_modules/flag-icons/flags/4x3', l.cc + '.svg');
  if (!existsSync(src)) { console.error('MISSING FLAG:', l.name, l.cc); continue; }
  copyFileSync(src, join(flagDir, l.cc + '.svg'));
  flagged++;
}

// ── Report ──────────────────────────────────────────────────────────────────
const over = report.filter((r) => r.areaErrPct > AREA_TOL).sort((a, b) => b.areaErrPct - a.areaErrPct);
const worst = report.slice().sort((a, b) => b.areaErrPct - a.areaErrPct)[0];
console.log('✓ nation-levels.json —', levels.length, 'countries,', flagged, 'flags copied');
console.log('  points:', Math.min(...levels.map(l => l.pts)), '–', Math.max(...levels.map(l => l.pts)));
console.log('  worst area error:', worst.name, worst.areaErrPct + '%');
console.log('  over ' + AREA_TOL + '% tolerance:', over.length ? over.map(r => r.name + ' ' + r.areaErrPct + '%').join(', ') : 'none');
console.log('  first 8:', levels.slice(0, 8).map(l => l.name + '(' + l.pts + ')').join(', '));
console.log('  last 8:', levels.slice(-8).map(l => l.name + '(' + l.pts + ')').join(', '));
