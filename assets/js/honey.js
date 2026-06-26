(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var RADIUS = 3;   // hex grid radius → 37 cells
  var SIZE   = 34;  // main grid hex circumradius in pixels

  var SQRT3 = Math.sqrt(3);

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

  function hexToPixel(q, r, sz) {
    sz = sz || SIZE;
    return {
      x: sz * (SQRT3 * q + SQRT3 / 2 * r),
      y: sz * (1.5 * r)
    };
  }

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

  // ── Pipe piece rendering ──────────────────────────────────────────────────────

  function edgeMidpoint(e, apo) {
    var angle = Math.PI * 60 * (e + 1) / 180;
    return { x: apo * Math.cos(angle), y: apo * Math.sin(angle) };
  }

  // connectedDirs: array of display-edge directions on this tile that have a
  // live mutual connection to their neighbour. These arms get a flow overlay.
  function drawTile(parent, cx, cy, edges, sz, q, r, connectedDirs) {
    sz = sz || SIZE;
    var apo = sz * SQRT3 / 2;
    var pw  = Math.max(4, Math.round(sz * 0.22));
    var hr  = Math.max(3, Math.round(sz * 0.15));
    var cd  = connectedDirs || [];

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

    // 2. Shadow arms (all)
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

    // 3. Base amber arms (all)
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

    // 4. Honey-flow overlay (connected arms only) — animated dashes via CSS
    edges.forEach(function (e) {
      if (cd.indexOf(e) === -1) return;
      var m = edgeMidpoint(e, apo);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', '0'); l.setAttribute('y1', '0');
      l.setAttribute('x2', m.x.toFixed(2)); l.setAttribute('y2', m.y.toFixed(2));
      l.setAttribute('stroke-width', Math.max(2, pw - 2));
      l.setAttribute('stroke-linecap', 'round');
      l.classList.add('hn-arm-flow');
      g.appendChild(l);
    });

    // 5. Hub shadow
    var hs = document.createElementNS(NS, 'circle');
    hs.setAttribute('cx', '0'); hs.setAttribute('cy', '0');
    hs.setAttribute('r', hr + 1.5); hs.setAttribute('fill', '#5C3A00');
    g.appendChild(hs);

    // 6. Hub — brighter fill when any arm is live
    var h = document.createElementNS(NS, 'circle');
    h.setAttribute('cx', '0'); h.setAttribute('cy', '0');
    h.setAttribute('r', hr); h.setAttribute('fill', '#C88500');
    if (cd.length > 0) h.classList.add('hn-hub-glow');
    g.appendChild(h);

    parent.appendChild(g);
    return g;
  }

  // ── Board rendering ───────────────────────────────────────────────────────────

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

  // connectedArms: array of arrays — connectedArms[i] lists the display-edge
  // directions of cell i that have a live mutual connection.
  function renderBoard(level, rots, connectedArms) {
    var sz  = level.demo ? 52 : SIZE;
    var svg = document.getElementById('hn-svg');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', computeViewBox(level.cells, sz));

    level.cells.forEach(function (cell, i) {
      var displayEdges = cell.edges.map(function (e) { return (e + rots[i]) % 6; });
      var px = hexToPixel(cell.q, cell.r, sz);
      drawTile(svg, px.x, px.y, displayEdges, sz, cell.q, cell.r,
               connectedArms ? connectedArms[i] : []);
    });
  }

  // ── Connectivity (union-find + live arm tracking) ─────────────────────────────

  function computeConnectivity(cells, rots) {
    var N = cells.length;

    var cellMap = {};
    cells.forEach(function (c, i) { cellMap[c.q + ',' + c.r] = i; });

    // Union-Find
    var parent = cells.map(function (_, i) { return i; });
    var ufRank = cells.map(function () { return 0; });

    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function unite(a, b) {
      var ra = find(a), rb = find(b);
      if (ra === rb) return;
      if (ufRank[ra] < ufRank[rb]) { var t = ra; ra = rb; rb = t; }
      parent[rb] = ra;
      if (ufRank[ra] === ufRank[rb]) ufRank[ra]++;
    }

    // Track which display-edge directions are live per cell (for flow rendering)
    var connectedArms = cells.map(function () { return []; });

    var edgeCount = 0;
    cells.forEach(function (c, i) {
      var displayEdges = c.edges.map(function (e) { return (e + rots[i]) % 6; });
      displayEdges.forEach(function (d) {
        var nq = c.q + HEX_DIRS[d][0];
        var nr = c.r + HEX_DIRS[d][1];
        var j  = cellMap[nq + ',' + nr];
        if (j === undefined) return;            // exits grid
        var nEdges = cells[j].edges.map(function (e) { return (e + rots[j]) % 6; });
        if (nEdges.indexOf((d + 3) % 6) === -1) return;  // no reciprocal
        // Live mutual connection
        connectedArms[i].push(d);
        connectedArms[j].push((d + 3) % 6);
        if (j > i) { unite(i, j); edgeCount++; }  // union-find: count each pair once
      });
    });

    var root = find(0);
    var allConnected = cells.every(function (_, i) { return find(i) === root; });

    return {
      solved:        allConnected && edgeCount === N - 1,
      edgeCount:     edgeCount,
      allConnected:  allConnected,
      connectedArms: connectedArms,
    };
  }

  // ── Flow animation (RAF — global clock so re-renders don't reset dashes) ──────

  var flowSvg   = null;
  var flowPhase = 0;        // 0 → FLOW_PERIOD, wraps
  var FLOW_PERIOD = 11;     // dasharray period: 6 dash + 5 gap
  var FLOW_SPEED  = 20;     // pixels per second (outward from hub)
  var lastTs      = 0;

  function flowTick(ts) {
    if (lastTs) {
      var dt = Math.min(ts - lastTs, 100);   // cap: ignore huge gaps (tab hidden)
      flowPhase = (flowPhase + FLOW_SPEED * dt / 1000) % FLOW_PERIOD;
    }
    lastTs = ts;
    // Decreasing dashoffset → dashes move forward (hub → edge)
    if (flowSvg) {
      flowSvg.style.setProperty('--hn-offset',
        (FLOW_PERIOD - flowPhase).toFixed(2));
    }
    requestAnimationFrame(flowTick);
  }

  // ── Game state ────────────────────────────────────────────────────────────────

  var game = {
    levels:  [],
    idx:     0,
    cells:   [],
    rots:    [],
    cellMap: {},
    solved:  false,
  };

  function ck(q, r) { return q + ',' + r; }

  function show(id) {
    ['hn-start', 'hn-game', 'hn-win'].forEach(function (s) {
      document.getElementById(s).classList.toggle('hn-hide', s !== id);
    });
  }

  function startLevel(idx) {
    var level    = game.levels[idx];
    game.idx     = idx;
    game.cells   = level.cells;
    game.rots    = level.cells.map(function (c) { return c.startRot; });
    game.cellMap = {};
    game.cells.forEach(function (c, i) { game.cellMap[ck(c.q, c.r)] = i; });
    game.solved  = false;

    document.getElementById('hn-level-label').textContent =
      idx === 0 ? 'Tutorial' : 'Level ' + idx;
    document.getElementById('hn-furthest-label').textContent = '';
    document.getElementById('hn-board-wrap').classList.remove('hn-solved');
    show('hn-game');

    var result = computeConnectivity(game.cells, game.rots);
    renderBoard(level, game.rots, result.connectedArms);
  }

  function handleTileClick(q, r) {
    if (game.solved) return;
    var i = game.cellMap[ck(q, r)];
    if (i === undefined) return;

    game.rots[i] = (game.rots[i] + 1) % 6;

    var result = computeConnectivity(game.cells, game.rots);
    renderBoard(game.levels[game.idx], game.rots, result.connectedArms);

    if (result.solved) onLevelSolved();
  }

  function onLevelSolved() {
    game.solved = true;
    document.getElementById('hn-board-wrap').classList.add('hn-solved');

    if (game.idx === 0) {
      document.getElementById('hn-level-label').textContent = 'Tutorial — Complete!';
      setTimeout(function () { startLevel(1); }, 1300);
    } else if (game.idx < 25) {
      document.getElementById('hn-level-label').textContent =
        'Level ' + game.idx + ' — Complete!';
      setTimeout(function () { startLevel(game.idx + 1); }, 1400);
    } else {
      document.getElementById('hn-level-label').textContent = 'Level 25 — Complete!';
      setTimeout(function () { show('hn-win'); }, 1400);
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    flowSvg = document.getElementById('hn-svg');
    requestAnimationFrame(flowTick);

    document.getElementById('help-btn').addEventListener('click', function () {
      document.getElementById('directions-overlay').classList.remove('hidden');
    });
    document.getElementById('dir-close-btn').addEventListener('click', function () {
      document.getElementById('directions-overlay').classList.add('hidden');
    });

    document.getElementById('hn-svg').addEventListener('click', function (e) {
      var tile = e.target.closest && e.target.closest('.hn-tile');
      if (!tile || tile.dataset.q === undefined) return;
      handleTileClick(parseInt(tile.dataset.q, 10), parseInt(tile.dataset.r, 10));
    });

    var playBtn = document.createElement('button');
    playBtn.className = 'hn-btn-primary';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', function () { startLevel(0); });
    document.getElementById('hn-start-btns').appendChild(playBtn);

    document.getElementById('hn-share').addEventListener('click', function () {
      var text = 'I connected all 25 hives in Honey! 🍯 thebunnygame.com/honey';
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    });
    document.getElementById('hn-play-again').addEventListener('click', function () {
      show('hn-start');
    });

    fetch('/assets/data/honey-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (levels) {
        game.levels = levels;
        show('hn-start');
      });
  });

})();
