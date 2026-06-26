(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var RADIUS = 3;   // hex grid radius → 37 cells
  var SIZE   = 34;  // main grid hex circumradius in pixels

  var SQRT3 = Math.sqrt(3);

  // Axial direction vectors for pointy-top hexagons, 0–5 clockwise from E.
  // Edge e (between corner e and corner (e+1)%6) faces direction (e+1)%6.
  // Edge e midpoint: angle = 60*(e+1)°, distance = SIZE*√3/2 from center.
  var HEX_DIRS = [
    [+1,  0],  // 0: E
    [ 0, +1],  // 1: SE
    [-1, +1],  // 2: SW
    [-1,  0],  // 3: W
    [ 0, -1],  // 4: NW
    [+1, -1],  // 5: NE
  ];

  var NS = 'http://www.w3.org/2000/svg';

  // ── Hex grid math ────────────────────────────────────────────────────────────

  function getGridCells(radius) {
    var cells = [];
    for (var q = -radius; q <= radius; q++)
      for (var r = -radius; r <= radius; r++)
        if (Math.abs(q + r) <= radius) cells.push({ q: q, r: r });
    return cells;
  }

  function hexToPixel(q, r, sz) {
    sz = sz || SIZE;
    return {
      x: sz * (SQRT3 * q + SQRT3 / 2 * r),
      y: sz * (1.5 * r)
    };
  }

  function inGrid(q, r) {
    return Math.abs(q) <= RADIUS && Math.abs(r) <= RADIUS && Math.abs(q + r) <= RADIUS;
  }

  function getNeighbors(q, r) {
    var result = [];
    for (var d = 0; d < 6; d++) {
      var nq = q + HEX_DIRS[d][0];
      var nr = r + HEX_DIRS[d][1];
      if (inGrid(nq, nr)) result.push({ q: nq, r: nr, dir: d });
    }
    return result;
  }

  // SVG polygon points for a pointy-top hex at local origin (inside a translate group).
  function hexPoints(sz) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = Math.PI * (30 + 60 * i) / 180;
      pts.push(
        (sz * Math.cos(angle)).toFixed(2) + ',' +
        (sz * Math.sin(angle)).toFixed(2)
      );
    }
    return pts.join(' ');
  }

  // ── Pipe piece definitions ────────────────────────────────────────────────────

  // Edge e midpoint at local origin: angle = 60*(e+1)°, distance = apothem.
  function edgeMidpoint(e, apo) {
    var angle = Math.PI * 60 * (e + 1) / 180;
    return { x: apo * Math.cos(angle), y: apo * Math.sin(angle) };
  }

  // Rotate an edge set clockwise by r steps (1 step = 60°).
  function rotateEdges(edges, r) {
    return edges.map(function (e) { return (e + r) % 6; });
  }

  // Draw a hex tile + pipe arms into a <g> translated to (cx, cy).
  // q, r are stored as data attributes for future click handling.
  function drawTile(parent, cx, cy, edges, sz, q, r) {
    sz = sz || SIZE;
    var apo = sz * SQRT3 / 2;
    var pw  = Math.max(4, Math.round(sz * 0.22));  // pipe stroke width
    var hr  = Math.max(3, Math.round(sz * 0.15));  // hub radius

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')');
    g.classList.add('hn-tile');
    if (q !== undefined) { g.dataset.q = q; g.dataset.r = r; }

    // 1. Hex outline
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', hexPoints(sz));
    poly.classList.add('hn-hex');
    g.appendChild(poly);

    if (edges.length === 0) { parent.appendChild(g); return g; }

    // 2. Shadow arms
    edges.forEach(function (e) {
      var m = edgeMidpoint(e, apo);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', '0'); l.setAttribute('y1', '0');
      l.setAttribute('x2', m.x.toFixed(2)); l.setAttribute('y2', m.y.toFixed(2));
      l.setAttribute('stroke', '#5C3A00');
      l.setAttribute('stroke-width', pw + 3);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    });

    // 3. Bright amber arms
    edges.forEach(function (e) {
      var m = edgeMidpoint(e, apo);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', '0'); l.setAttribute('y1', '0');
      l.setAttribute('x2', m.x.toFixed(2)); l.setAttribute('y2', m.y.toFixed(2));
      l.setAttribute('stroke', '#C88500');
      l.setAttribute('stroke-width', pw);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    });

    // 4. Hub circle
    var hs = document.createElementNS(NS, 'circle');
    hs.setAttribute('cx', '0'); hs.setAttribute('cy', '0');
    hs.setAttribute('r', hr + 1.5); hs.setAttribute('fill', '#5C3A00');
    g.appendChild(hs);

    var h = document.createElementNS(NS, 'circle');
    h.setAttribute('cx', '0'); h.setAttribute('cy', '0');
    h.setAttribute('r', hr); h.setAttribute('fill', '#C88500');
    g.appendChild(h);

    parent.appendChild(g);
    return g;
  }

  // ── Board grid rendering ──────────────────────────────────────────────────────

  // Compute SVG viewBox from actual cell positions — works for any radius.
  // sz: hex circumradius (SIZE for radius-3, larger for demo radius-1).
  function computeViewBox(cells, sz) {
    sz = sz || SIZE;
    var apo  = sz * SQRT3 / 2;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    cells.forEach(function (c) {
      var px = hexToPixel(c.q, c.r, sz);
      if (px.x - apo < minX) minX = px.x - apo;
      if (px.x + apo > maxX) maxX = px.x + apo;
      if (px.y - sz  < minY) minY = px.y - sz;
      if (px.y + sz  > maxY) maxY = px.y + sz;
    });
    var pad = 10;
    return (minX - pad).toFixed(1) + ' ' + (minY - pad).toFixed(1) + ' ' +
           (maxX - minX + 2 * pad).toFixed(1) + ' ' + (maxY - minY + 2 * pad).toFixed(1);
  }

  // Render a level in scrambled or solved state.
  //   level  — {demo, cells:[{q,r,edges,startRot}]}
  //   solved — true → show edges as-is; false → apply startRot scramble
  function renderBoard(level, solved) {
    var sz  = level.demo ? 52 : SIZE;
    var svg = document.getElementById('hn-svg');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', computeViewBox(level.cells, sz));

    level.cells.forEach(function (cell) {
      var displayEdges = solved
        ? cell.edges.slice()
        : cell.edges.map(function (e) { return (e + cell.startRot) % 6; });
      var px = hexToPixel(cell.q, cell.r, sz);
      drawTile(svg, px.x, px.y, displayEdges, sz, cell.q, cell.r);
    });
  }

  // ── Test harness (Part 2 — kept for reference) ────────────────────────────────

  var TEST_CASES = [
    { edges: [0, 3], r: 0 }, { edges: [0, 3], r: 1 },
    { edges: [0, 2], r: 0 }, { edges: [0, 2], r: 1 },
    { edges: [0, 1], r: 0 },
    { edges: [0, 2, 4], r: 0 }, { edges: [0, 2, 4], r: 1 },
    { edges: [0, 1, 3], r: 0 }, { edges: [0, 1, 3], r: 1 },
    { edges: [0, 1, 2], r: 0 },
    { edges: [0, 1, 2, 3], r: 0 }, { edges: [0, 1, 2, 3], r: 2 },
    { edges: [0, 1, 3, 4], r: 0 }, { edges: [0, 2, 3, 5], r: 0 },
    { edges: [0, 1, 2, 4], r: 0 },
    { edges: [0, 1, 2, 3, 4], r: 0 }, { edges: [0, 1, 2, 3, 4], r: 1 },
    { edges: [0, 1, 2, 3, 4, 5], r: 0 }, { edges: [0, 1, 2, 3, 4, 5], r: 1 },
    { edges: [1, 2, 3, 4, 5], r: 0 },
  ];

  var COLS = 5, TEST_SZ = 28, COL_STEP = TEST_SZ * 2 + 14, ROW_STEP = TEST_SZ * 2 + 26;
  var ROW_LABELS = ['2-edge', '3-edge', '4-edge', '5/6-edge'];

  function renderTestHarness() {
    var svg = document.getElementById('hn-svg');
    svg.innerHTML = '';
    var rows = Math.ceil(TEST_CASES.length / COLS);
    svg.setAttribute('viewBox', '-2 -2 ' + (COLS * COL_STEP + 8) + ' ' + (rows * ROW_STEP + 8));

    TEST_CASES.forEach(function (tc, idx) {
      var col = idx % COLS, row = Math.floor(idx / COLS);
      var cx = col * COL_STEP + TEST_SZ, cy = row * ROW_STEP + TEST_SZ;

      if (col === 0 && ROW_LABELS[row]) {
        var h = document.createElementNS(NS, 'text');
        h.setAttribute('x', cx); h.setAttribute('y', cy - TEST_SZ - 4);
        h.setAttribute('text-anchor', 'middle');
        h.setAttribute('font-family', 'DM Sans, sans-serif');
        h.setAttribute('font-size', '8'); h.setAttribute('fill', 'rgba(245,200,66,0.35)');
        h.textContent = ROW_LABELS[row];
        svg.appendChild(h);
      }

      drawTile(svg, cx, cy, rotateEdges(tc.edges, tc.r), TEST_SZ);

      var lbl = document.createElementNS(NS, 'text');
      lbl.setAttribute('x', cx); lbl.setAttribute('y', cy + TEST_SZ + 13);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-family', 'DM Sans, sans-serif');
      lbl.setAttribute('font-size', '8'); lbl.setAttribute('fill', 'rgba(245,200,66,0.4)');
      lbl.textContent = '[' + tc.edges.join(',') + ']' + (tc.r ? '+' + tc.r : '');
      svg.appendChild(lbl);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('help-btn').addEventListener('click', function () {
      document.getElementById('directions-overlay').classList.remove('hidden');
    });
    document.getElementById('dir-close-btn').addEventListener('click', function () {
      document.getElementById('directions-overlay').classList.add('hidden');
    });

    // Part 4 spot-check: show scrambled starting state of level 1.
    // Click the board to toggle solved/scrambled for visual verification.
    var showSolved = false;
    var currentLevel = null;

    document.getElementById('hn-furthest-label').textContent = 'tap to verify';

    document.getElementById('hn-board-wrap').addEventListener('click', function () {
      if (!currentLevel) return;
      showSolved = !showSolved;
      document.getElementById('hn-level-label').textContent =
        showSolved ? 'Level 1 — solved ✓' : 'Level 1 — scrambled';
      renderBoard(currentLevel, showSolved);
    });

    fetch('/assets/data/honey-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (levels) {
        currentLevel = levels[1];  // index 0 = demo, index 1 = level 1
        document.getElementById('hn-level-label').textContent = 'Level 1 — scrambled';
        renderBoard(currentLevel, false);
      });
  });

})();
