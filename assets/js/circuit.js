(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var DIRECTIONS_TEXT =
    'Circuit gives you a hex grid where almost every piece is already in ' +
    'place. The missing pieces sit on the shelf below. Drag them onto the ' +
    'empty spaces and rotate them until the whole network connects without ' +
    'any loops. Every piece can be rotated by clicking it — on the shelf or ' +
    'on the board. Drag a piece back to the shelf if you change your mind. ' +
    'Complete the circuit and watch the electricity flow.';

  var LS_KEY       = 'circuit_highestLevel';
  var TOTAL_LEVELS = 25;

  var SIZE  = 34;   // board hex radius
  var SQRT3 = Math.sqrt(3);
  var NS    = 'http://www.w3.org/2000/svg';

  var HEX_DIRS = [
    [+1,  0],  // 0: E
    [ 0, +1],  // 1: SE
    [-1, +1],  // 2: SW
    [-1,  0],  // 3: W
    [ 0, -1],  // 4: NW
    [+1, -1],  // 5: NE
  ];

  // ── Hex geometry (identical to Honey) ────────────────────────────────────────

  function hexToPixel(q, r) {
    return { x: SIZE * (SQRT3 * q + SQRT3 / 2 * r), y: SIZE * (1.5 * r) };
  }

  function hexPoints(size) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI * (30 + 60 * i) / 180;
      pts.push((size * Math.cos(a)).toFixed(2) + ',' + (size * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }

  function edgeMidpoint(e, size) {
    var apo = size * SQRT3 / 2;
    var a   = Math.PI * 60 * e / 180;
    return { x: apo * Math.cos(a), y: apo * Math.sin(a) };
  }

  // ── Rotation helpers ─────────────────────────────────────────────────────────

  function rotEdges(edges, r) {
    return edges.map(function (e) { return (e + r) % 6; }).sort(function (a, b) { return a - b; });
  }
  function edgeKey(edges) { return edges.join(','); }

  // A random orientation that is NOT visually the solved one. Symmetric pieces
  // (a straight-through pipe, say) look identical at several rotations, so this
  // compares the resulting edge sets rather than the rotation numbers.
  function randomUnsolvedRotation(edges, solvedRotation) {
    var solvedKey = edgeKey(rotEdges(edges, solvedRotation));
    var opts = [];
    for (var r = 0; r < 6; r++) {
      if (edgeKey(rotEdges(edges, r)) !== solvedKey) opts.push(r);
    }
    if (!opts.length) return 0;  // fully symmetric — no unsolved orientation exists
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ── Tile drawing ─────────────────────────────────────────────────────────────
  // The pipes live in their own <g> so rotation animates about the tile centre
  // without disturbing the hex outline.

  function drawTile(parent, cx, cy, edges, size, opts) {
    opts = opts || {};

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(' + cx.toFixed(2) + ',' + cy.toFixed(2) + ')');
    g.classList.add('ct-tile');
    if (opts.blank) g.classList.add('ct-blank');
    if (opts.q !== undefined) { g.dataset.q = opts.q; g.dataset.r = opts.r; }

    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', hexPoints(size));
    poly.classList.add('ct-hex');
    g.appendChild(poly);

    if (!edges || !edges.length) { parent.appendChild(g); return g; }

    var pipes = document.createElementNS(NS, 'g');
    pipes.classList.add('ct-pipes');

    var pw = Math.max(3, Math.round(size * 0.20));
    var hr = Math.max(2.5, Math.round(size * 0.15));

    // Outer glow pass, then bright core, so pipes read as energised.
    [{ cls: 'ct-pipe-glow', w: pw + 5 }, { cls: 'ct-pipe-core', w: pw }].forEach(function (pass) {
      edges.forEach(function (e) {
        var m = edgeMidpoint(e, size);
        var l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', '0'); l.setAttribute('y1', '0');
        l.setAttribute('x2', m.x.toFixed(2)); l.setAttribute('y2', m.y.toFixed(2));
        l.setAttribute('stroke-width', pass.w);
        l.classList.add(pass.cls);
        pipes.appendChild(l);
      });
    });

    var hubGlow = document.createElementNS(NS, 'circle');
    hubGlow.setAttribute('r', hr + 2.5);
    hubGlow.classList.add('ct-hub-glow');
    pipes.appendChild(hubGlow);

    var hub = document.createElementNS(NS, 'circle');
    hub.setAttribute('r', hr);
    hub.classList.add('ct-hub');
    pipes.appendChild(hub);

    // Cumulative degrees so rotation always travels clockwise, never snapping back
    pipes.style.transform = 'rotate(' + (opts.displayDeg || 0) + 'deg)';

    g.appendChild(pipes);
    parent.appendChild(g);
    return g;
  }

  // ── Connectivity (same graph property as Honey) ──────────────────────────────
  // Solved = every cell in one component AND edge count === N-1 (no loops).
  // Only counts cells that actually hold a piece.

  function computeConnectivity(placed) {
    var N = placed.length;
    if (!N) return { solved: false };

    var map = {};
    placed.forEach(function (c, i) { map[c.q + ',' + c.r] = i; });

    var parent = placed.map(function (_, i) { return i; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }

    var edgeCount = 0;
    placed.forEach(function (c, i) {
      c.activeEdges.forEach(function (d) {
        var j = map[(c.q + HEX_DIRS[d][0]) + ',' + (c.r + HEX_DIRS[d][1])];
        if (j === undefined || j <= i) return;
        if (placed[j].activeEdges.indexOf((d + 3) % 6) === -1) return;
        var a = find(i), b = find(j);
        if (a !== b) parent[b] = a;
        edgeCount++;
      });
    });

    var root = find(0);
    var connected = placed.every(function (_, i) { return find(i) === root; });
    return { solved: connected && edgeCount === N - 1, connected: connected, edgeCount: edgeCount, N: N };
  }

  // ── Game state ───────────────────────────────────────────────────────────────

  var highestLvl = 0;

  var game = {
    levels: [],
    idx:    0,
    cells:  [],   // { q, r, edges, solvedRotation, piece }  piece = null when blank
    shelf:  [],   // { id, edges, solvedRotation, rotation, displayDeg }
    solved: false,
  };

  var nextPieceId = 1;

  function ck(q, r) { return q + ',' + r; }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function computeViewBox(cells) {
    var apo = SIZE * SQRT3 / 2;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    cells.forEach(function (c) {
      var px = hexToPixel(c.q, c.r);
      if (px.x - apo < minX) minX = px.x - apo;
      if (px.x + apo > maxX) maxX = px.x + apo;
      if (px.y - SIZE < minY) minY = px.y - SIZE;
      if (px.y + SIZE > maxY) maxY = px.y + SIZE;
    });
    var pad = 10;
    return (minX - pad).toFixed(1) + ' ' + (minY - pad).toFixed(1) + ' ' +
           (maxX - minX + 2 * pad).toFixed(1) + ' ' + (maxY - minY + 2 * pad).toFixed(1);
  }

  function renderBoard() {
    var svg = document.getElementById('ct-svg');
    svg.innerHTML = '';
    svg.setAttribute('viewBox', computeViewBox(game.cells));

    game.cells.forEach(function (cell) {
      var px = hexToPixel(cell.q, cell.r);
      if (cell.piece) {
        // Pipes are drawn in canonical orientation and the group is rotated, so
        // the rotation can animate. Pre-placed scaffold is locked; only pieces
        // the player placed from the shelf can be moved or rotated.
        var t = drawTile(svg, px.x, px.y, cell.edges, SIZE, {
          q: cell.q, r: cell.r, displayDeg: cell.piece.displayDeg,
        });
        t.classList.add(cell.piece.locked ? 'ct-locked' : 'ct-movable');
      } else {
        drawTile(svg, px.x, px.y, null, SIZE, { q: cell.q, r: cell.r, blank: true });
      }
    });
  }

  function renderShelf() {
    var shelf = document.getElementById('ct-shelf');
    shelf.innerHTML = '';

    var s    = 26;                 // shelf hex radius
    var span = (s * SQRT3 / 2 + 6);

    game.shelf.forEach(function (p) {
      var svg = document.createElementNS(NS, 'svg');
      svg.classList.add('ct-shelf-piece');
      svg.setAttribute('viewBox', (-span) + ' ' + (-s - 4) + ' ' + (span * 2) + ' ' + ((s + 4) * 2));
      svg.dataset.pieceId = p.id;
      drawTile(svg, 0, 0, p.edges, s, { displayDeg: p.displayDeg });
      shelf.appendChild(svg);
    });

    var label = document.getElementById('ct-shelf-label');
    label.textContent = game.shelf.length
      ? (game.shelf.length === 1 ? '1 piece left' : game.shelf.length + ' pieces left')
      : 'All pieces placed';
  }

  // Rotate a piece in place, animating only that tile (no full re-render, so
  // the CSS transition is preserved). Works for shelf and board alike.
  function rotatePiece(piece, el) {
    piece.rotation   = (piece.rotation + 1) % 6;
    piece.displayDeg = piece.displayDeg + 60;   // cumulative: always clockwise
    var pipes = el && el.querySelector('.ct-pipes');
    if (pipes) pipes.style.transform = 'rotate(' + piece.displayDeg + 'deg)';
  }

  function rotateShelfPiece(id) {
    var p = findShelfPiece(id);
    if (!p) return;
    rotatePiece(p, document.querySelector('.ct-shelf-piece[data-piece-id="' + id + '"]'));
  }

  function findShelfPiece(id) {
    for (var i = 0; i < game.shelf.length; i++) if (game.shelf[i].id === id) return game.shelf[i];
    return null;
  }

  function findCell(q, r) {
    for (var i = 0; i < game.cells.length; i++)
      if (game.cells[i].q === q && game.cells[i].r === r) return game.cells[i];
    return null;
  }

  // ── Screen-space helpers for hit testing ─────────────────────────────────────

  function boardCTM() {
    var svg = document.getElementById('ct-svg');
    return { svg: svg, ctm: svg.getScreenCTM() };
  }

  // Where a cell's centre sits on screen, in client pixels.
  function cellScreenPos(q, r) {
    var b = boardCTM();
    if (!b.ctm) return null;
    var px = hexToPixel(q, r);
    var pt = b.svg.createSVGPoint();
    pt.x = px.x; pt.y = px.y;
    var s = pt.matrixTransform(b.ctm);
    return { x: s.x, y: s.y };
  }

  // Hex radius as rendered on screen. The board scales with the viewport, so a
  // fixed 30px threshold would be too tight when small and too loose when large.
  function screenHexRadius() {
    var b = boardCTM();
    if (!b.ctm) return 30;
    return SIZE * Math.sqrt(b.ctm.a * b.ctm.a + b.ctm.b * b.ctm.b);
  }

  // Nearest EMPTY board cell within the snap radius, or null.
  function nearestEmptyCell(x, y) {
    var best = null, bestD = Infinity;
    var threshold = Math.max(30, screenHexRadius());
    game.cells.forEach(function (c) {
      if (c.piece) return;
      var p = cellScreenPos(c.q, c.r);
      if (!p) return;
      var d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) { bestD = d; best = c; }
    });
    return (best && bestD <= threshold) ? best : null;
  }

  function isOverShelf(x, y) {
    var el = document.getElementById('ct-shelf');
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  // Rotation is click-only and happens at rest, never mid-drag: a drag already
  // needs a movement threshold to be told apart from a click, and tap-to-rotate
  // during a drag would fight that on touch.

  var DRAG_THRESHOLD = 6;   // px of movement before a click becomes a drag

  var dragState = {
    isDragging: false,
    piece:      null,
    sourceType: null,   // 'shelf' | 'board'
    sourceQ:    null,
    sourceR:    null,
    ghost:      null,
    startX:     0,
    startY:     0,
    pending:    false,  // pointer is down but movement hasn't passed threshold
    el:         null,   // element pressed, for click-to-rotate
  };

  function createGhost(piece) {
    var s = 26;
    var span = s * SQRT3 / 2 + 6;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'ct-drag-ghost');
    svg.setAttribute('viewBox', (-span) + ' ' + (-s - 4) + ' ' + (span * 2) + ' ' + ((s + 4) * 2));
    drawTile(svg, 0, 0, piece.edges, s, { displayDeg: piece.displayDeg });
    document.body.appendChild(svg);
    return svg;
  }

  function moveGhost(x, y) {
    if (!dragState.ghost) return;
    dragState.ghost.style.left = x + 'px';
    dragState.ghost.style.top  = y + 'px';
  }

  function clearHighlights() {
    var t = document.querySelector('.ct-tile.ct-drop-target');
    if (t) t.classList.remove('ct-drop-target');
    document.getElementById('ct-shelf').classList.remove('ct-drop-active');
  }

  function highlightDropTarget(x, y) {
    clearHighlights();
    var cell = nearestEmptyCell(x, y);
    if (cell) {
      var el = document.querySelector('.ct-tile[data-q="' + cell.q + '"][data-r="' + cell.r + '"]');
      if (el) el.classList.add('ct-drop-target');
      if (dragState.ghost) dragState.ghost.classList.add('ct-snapped');
      // Snap the ghost onto the cell centre so the drop reads unambiguously
      var p = cellScreenPos(cell.q, cell.r);
      if (p) moveGhost(p.x, p.y);
      return;
    }
    if (dragState.ghost) dragState.ghost.classList.remove('ct-snapped');
    if (isOverShelf(x, y)) document.getElementById('ct-shelf').classList.add('ct-drop-active');
  }

  function beginDrag(piece, sourceType, q, r, x, y) {
    // Detach from source immediately so its old slot reads as empty
    if (sourceType === 'board') {
      var cell = findCell(q, r);
      if (cell) cell.piece = null;
      renderBoard();
    } else {
      var i = game.shelf.indexOf(piece);
      if (i !== -1) game.shelf.splice(i, 1);
      renderShelf();
    }

    dragState.isDragging = true;
    dragState.piece      = piece;
    dragState.sourceType = sourceType;
    dragState.sourceQ    = q;
    dragState.sourceR    = r;
    dragState.ghost      = createGhost(piece);
    moveGhost(x, y);
    highlightDropTarget(x, y);
  }

  function endDrag(x, y) {
    var piece = dragState.piece;
    if (!piece) return;

    var cell = nearestEmptyCell(x, y);

    if (cell) {
      piece.locked = false;
      cell.piece = piece;
    } else {
      // Anywhere else — over the shelf or off-target — returns it to the shelf
      game.shelf.push(piece);
    }

    if (dragState.ghost) dragState.ghost.remove();
    clearHighlights();
    dragState.isDragging = false;
    dragState.piece = null;
    dragState.ghost = null;

    renderBoard();
    renderShelf();
    checkCircuitComplete();
  }

  function cancelPending() {
    dragState.pending = false;
    dragState.piece   = null;
    dragState.el      = null;
  }

  // ── Win check ────────────────────────────────────────────────────────────────
  // Every piece placed AND the whole 37-cell network connected with no loops.

  function checkCircuitComplete() {
    if (game.solved) return false;
    if (game.shelf.length) return false;

    var placed = game.cells
      .filter(function (c) { return c.piece; })
      .map(function (c) {
        return { q: c.q, r: c.r, activeEdges: rotEdges(c.edges, c.piece.rotation) };
      });

    if (placed.length !== game.cells.length) return false;

    var res = computeConnectivity(placed);
    if (res.solved) { onLevelSolved(); return true; }
    return false;
  }

  // Places every remaining shelf piece at its solved cell and rotation, then
  // runs the normal win check. Used to exercise the win path.
  function solveCurrentLevel() {
    var level = game.levels[game.idx - 1];
    if (!level) return false;

    game.shelf.slice().forEach(function (p) {
      var target = null;
      level.shelfPieces.forEach(function (sp) {
        if (edgeKey(sp.edges) === edgeKey(p.edges) && !target) {
          var cell = findCell(sp.solvedQ, sp.solvedR);
          if (cell && !cell.piece) target = { cell: cell, rot: sp.solvedRotation };
        }
      });
      if (!target) return;
      p.rotation   = target.rot;
      p.displayDeg = target.rot * 60;
      p.locked     = false;
      target.cell.piece = p;
      game.shelf.splice(game.shelf.indexOf(p), 1);
    });

    renderBoard();
    renderShelf();
    return checkCircuitComplete();
  }

  function onLevelSolved() {
    game.solved = true;
    if (game.idx > highestLvl) {
      highestLvl = game.idx;
      try { localStorage.setItem(LS_KEY, highestLvl); } catch (e) {}
    }
    triggerCircuitComplete();
  }

  // ── Electricity animation ────────────────────────────────────────────────────

  function setInteractionEnabled(on) {
    document.getElementById('ct-svg').classList.toggle('ct-no-interact', !on);
    document.getElementById('ct-shelf').classList.toggle('ct-no-interact', !on);
  }

  // Adjacency over cells that are actually joined pipe-to-pipe.
  function buildAdjacency() {
    var map = {};
    game.cells.forEach(function (c, i) { map[c.q + ',' + c.r] = i; });

    var adj = game.cells.map(function () { return []; });
    game.cells.forEach(function (c, i) {
      if (!c.piece) return;
      rotEdges(c.edges, c.piece.rotation).forEach(function (d) {
        var j = map[(c.q + HEX_DIRS[d][0]) + ',' + (c.r + HEX_DIRS[d][1])];
        if (j === undefined || !game.cells[j].piece) return;
        var nEdges = rotEdges(game.cells[j].edges, game.cells[j].piece.rotation);
        if (nEdges.indexOf((d + 3) % 6) === -1) return;
        adj[i].push(j);
      });
    });
    return adj;
  }

  function tileEl(q, r) {
    return document.querySelector('.ct-tile[data-q="' + q + '"][data-r="' + r + '"]');
  }

  function whiteFlash(ms) {
    var svg = document.getElementById('ct-svg');
    svg.classList.add('ct-white-flash');
    setTimeout(function () { svg.classList.remove('ct-white-flash'); }, ms);
  }

  function spawnSpark(cell) {
    var svg = document.getElementById('ct-svg');
    var px  = hexToPixel(cell.q, cell.r);
    var c   = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', px.x.toFixed(2));
    c.setAttribute('cy', px.y.toFixed(2));
    c.setAttribute('r', Math.max(3, SIZE * 0.11));
    c.classList.add('ct-spark');
    svg.appendChild(c);
    setTimeout(function () { c.remove(); }, 320);
  }

  // One pulse: BFS outward from a random powered cell, the current lighting each
  // cell as it arrives. Junctions (3+ connections) throw a spark.
  //
  // Driven by a single requestAnimationFrame loop rather than two setTimeouts per
  // cell. Scheduling ~74 timers per pulse overshot the 600ms budget by roughly a
  // third through timer coalescing; one rAF loop lands on the intended duration
  // and repaints in step with the compositor.
  function runElectricPulse(pulseNumber, onComplete) {
    var DURATION  = 600;                       // whole pulse, start to fully dark
    var TAIL      = 180;                       // how long one cell stays lit
    var intensity = pulseNumber / 3;           // 0.33, 0.67, 1.0
    var alpha     = 0.5 + intensity * 0.5;
    var peak      = 0.6 + intensity * 1.1;     // extra brightness above 1.0
    var glowPx    = 8 + intensity * 10;

    var adj = buildAdjacency();

    // Start from a cell that actually has connections, so the pulse can travel
    var candidates = [];
    adj.forEach(function (a, i) { if (a.length) candidates.push(i); });
    if (!candidates.length) { onComplete(); return; }
    var start = candidates[Math.floor(Math.random() * candidates.length)];

    var depth = game.cells.map(function () { return -1; });
    depth[start] = 0;
    var queue = [start], maxDepth = 0;
    while (queue.length) {
      var cur = queue.shift();
      adj[cur].forEach(function (n) {
        if (depth[n] !== -1) return;
        depth[n] = depth[cur] + 1;
        if (depth[n] > maxDepth) maxDepth = depth[n];
        queue.push(n);
      });
    }

    // Spread the wavefront so the last cell finishes decaying exactly at DURATION
    var step = maxDepth > 0 ? (DURATION - TAIL) / maxDepth : 0;

    // Resolve elements once — querying per frame would be the next bottleneck
    var pipeEls = game.cells.map(function (c) {
      var el = tileEl(c.q, c.r);
      return el ? el.querySelector('.ct-pipes') : null;
    });
    var isJunction = game.cells.map(function (c) {
      return !!c.piece && rotEdges(c.edges, c.piece.rotation).length >= 3;
    });
    var sparked = game.cells.map(function () { return false; });

    // requestAnimationFrame is suspended entirely while the page is hidden. If
    // the player solves a level and switches away, the chain would stall and the
    // win overlay would never arrive. The watchdog guarantees completion:
    // whichever finishes first wins, and `done` keeps it to exactly one call.
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      pipeEls.forEach(function (p) { if (p) p.style.filter = ''; });
      onComplete();
    }
    var watchdog = setTimeout(finish, DURATION + 400);

    var t0 = null;
    function frame(now) {
      if (done) return;
      if (t0 === null) t0 = now;
      var t = now - t0;

      for (var i = 0; i < game.cells.length; i++) {
        if (depth[i] < 0 || !pipeEls[i]) continue;
        var local = t - depth[i] * step;

        if (local >= 0 && !sparked[i]) {
          sparked[i] = true;
          if (isJunction[i]) spawnSpark(game.cells[i]);
        }

        var k = (local < 0 || local > TAIL) ? 0 : (1 - local / TAIL);
        pipeEls[i].style.filter = k <= 0 ? '' :
          'brightness(' + (1 + peak * k).toFixed(2) + ') ' +
          'drop-shadow(0 0 ' + (glowPx * k).toFixed(1) + 'px rgba(0,191,255,' + (alpha * k).toFixed(2) + '))';
      }

      if (t < DURATION) { requestAnimationFrame(frame); return; }
      finish();
    }
    requestAnimationFrame(frame);
  }

  function setSteadyGlow(on) {
    document.getElementById('ct-svg').classList.toggle('ct-powered', on);
  }

  function showLevelComplete() {
    var isLast = game.idx >= TOTAL_LEVELS;
    document.getElementById('ct-congrats-sub').textContent =
      isLast ? 'All circuits powered.' : 'Level ' + game.idx + ' of ' + TOTAL_LEVELS;
    document.getElementById('ct-next-level').textContent =
      isLast ? 'Finish' : 'Next Level';
    document.getElementById('ct-congrats').classList.remove('ct-hide');
  }

  function triggerCircuitComplete() {
    setInteractionEnabled(false);

    // Step 1 — brief white flash across every connection
    whiteFlash(100);

    setTimeout(function () {
      // Step 2 — three pulses, each brighter than the last
      runElectricPulse(1, function () {
        setTimeout(function () {
          runElectricPulse(2, function () {
            setTimeout(function () {
              runElectricPulse(3, function () {
                // Step 3 — settle into a steady powered glow
                setSteadyGlow(true);
                setTimeout(showLevelComplete, 400);
              });
            }, 200);
          });
        }, 200);
      });
    }, 100);
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  function show(id) {
    ['ct-start', 'ct-game', 'ct-win'].forEach(function (s) {
      document.getElementById(s).classList.toggle('ct-hide', s !== id);
    });
    document.getElementById('ct-congrats').classList.add('ct-hide');
  }

  // Play Again wipes stored progress and restarts from level 1.
  function playAgain() {
    highestLvl = 0;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    startLevel(1);
  }

  function buildStartBtns() {
    var btns = document.getElementById('ct-start-btns');
    btns.innerHTML = '';

    function mkBtn(cls, label, fn) {
      var b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    }

    if (highestLvl >= TOTAL_LEVELS) {
      mkBtn('ct-btn-primary', 'Play Again', playAgain);
    } else if (highestLvl > 0) {
      mkBtn('ct-btn-primary', 'Continue from Level ' + (highestLvl + 1),
        function () { startLevel(highestLvl + 1); });
      mkBtn('ct-btn-ghost', 'Start from Level 1', function () { startLevel(1); });
    } else {
      mkBtn('ct-btn-primary', 'Play', function () { startLevel(1); });
    }
  }

  // ── Level setup ──────────────────────────────────────────────────────────────

  function startLevel(n) {
    var level = game.levels[n - 1];
    if (!level) return;

    game.idx    = n;
    game.solved = false;

    game.cells = level.cells.map(function (c) {
      return {
        q: c.q, r: c.r,
        edges: c.edges.slice(),
        solvedRotation: c.solvedRotation,
        // Pre-placed scaffold starts correct and is locked; blanks hold nothing.
        piece: c.isMissing ? null : {
          rotation: c.currentRotation,
          displayDeg: c.currentRotation * 60,
          locked: true,
        },
      };
    });

    game.shelf = level.shelfPieces.map(function (p) {
      var rot = randomUnsolvedRotation(p.edges, p.solvedRotation);
      return {
        id: nextPieceId++,
        edges: p.edges.slice(),
        solvedRotation: p.solvedRotation,
        rotation: rot,
        displayDeg: rot * 60,
      };
    });

    document.getElementById('ct-level-label').textContent = 'Level ' + n;
    document.getElementById('ct-furthest-label').textContent =
      highestLvl > 0 ? 'Best: ' + highestLvl : '';

    // Clear anything the win sequence left behind
    setSteadyGlow(false);
    setInteractionEnabled(true);
    document.getElementById('ct-svg').classList.remove('ct-white-flash');
    document.getElementById('ct-board-wrap').classList.remove('ct-flash');

    show('ct-game');
    renderBoard();
    renderShelf();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    // Stored progress is untrusted — it can be corrupt, hand-edited, or written
    // by a future build with more levels. Anything invalid falls back to 0.
    highestLvl = parseInt(localStorage.getItem(LS_KEY), 10);
    if (!isFinite(highestLvl) || highestLvl < 0) highestLvl = 0;
    if (highestLvl > TOTAL_LEVELS) highestLvl = TOTAL_LEVELS;

    // Splash and the ? popup share one source of truth so they can't drift
    document.getElementById('ct-splash-dir').textContent = DIRECTIONS_TEXT;

    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    // ── Pointer handling: press, then either drag or (on release) rotate ──────

    function onPointerDown(e) {
      if (game.solved) return;

      var shelfEl = e.target.closest && e.target.closest('.ct-shelf-piece');
      var tileEl  = e.target.closest && e.target.closest('.ct-tile');

      var piece = null, type = null, q = null, r = null;

      if (shelfEl) {
        piece = findShelfPiece(parseInt(shelfEl.dataset.pieceId, 10));
        type  = 'shelf';
        dragState.el = shelfEl;
      } else if (tileEl && tileEl.dataset.q !== undefined) {
        q = parseInt(tileEl.dataset.q, 10);
        r = parseInt(tileEl.dataset.r, 10);
        var cell = findCell(q, r);
        // Locked scaffold and empty cells are not grabbable
        if (!cell || !cell.piece || cell.piece.locked) return;
        piece = cell.piece;
        type  = 'board';
        dragState.el = tileEl;
      } else {
        return;
      }
      if (!piece) return;

      dragState.pending    = true;
      dragState.piece      = piece;
      dragState.sourceType = type;
      dragState.sourceQ    = q;
      dragState.sourceR    = r;
      dragState.startX     = e.clientX;
      dragState.startY     = e.clientY;
    }

    function onPointerMove(e) {
      if (dragState.isDragging) {
        highlightDropTarget(e.clientX, e.clientY);
        if (!document.querySelector('.ct-tile.ct-drop-target')) moveGhost(e.clientX, e.clientY);
        e.preventDefault();
        return;
      }
      if (!dragState.pending) return;
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > DRAG_THRESHOLD) {
        dragState.pending = false;
        beginDrag(dragState.piece, dragState.sourceType,
                  dragState.sourceQ, dragState.sourceR, e.clientX, e.clientY);
      }
    }

    function onPointerUp(e) {
      if (dragState.isDragging) { endDrag(e.clientX, e.clientY); return; }
      if (!dragState.pending) return;

      // Never moved past the threshold — treat as a click and rotate in place
      var piece = dragState.piece, el = dragState.el;
      cancelPending();
      if (!piece) return;
      rotatePiece(piece, el);
      checkCircuitComplete();
    }

    document.getElementById('ct-shelf').addEventListener('pointerdown', onPointerDown);
    document.getElementById('ct-svg').addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', function () {
      if (dragState.isDragging) endDrag(-1, -1);   // off-target → back to shelf
      else cancelPending();
    });

    document.getElementById('ct-next-level').addEventListener('click', function () {
      if (game.idx < TOTAL_LEVELS) startLevel(game.idx + 1);
      else show('ct-win');
    });

    document.getElementById('ct-share').addEventListener('click', function () {
      shareText(
        'Circuit — powered all 25 circuits. Can you complete the connection? ' +
        'https://www.thebunnygame.com/circuit',
        'Circuit'
      );
    });

    document.getElementById('ct-play-again').addEventListener('click', playAgain);

    fetch('circuit-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (levels) {
        game.levels = levels;
        buildStartBtns();
        show('ct-start');
      })
      .catch(function (err) { console.error('circuit-levels.json failed:', err); });
  });

  // Exposed for verification during development
  window.Circuit = {
    getState:            function () { return game; },
    computeConnectivity: computeConnectivity,
    rotEdges:            rotEdges,
    startLevel:          startLevel,
    rotateShelfPiece:    rotateShelfPiece,
    rotatePiece:         rotatePiece,
    renderBoard:         renderBoard,
    renderShelf:         renderShelf,
    checkCircuitComplete: checkCircuitComplete,
    nearestEmptyCell:    nearestEmptyCell,
    cellScreenPos:       cellScreenPos,
    findCell:            findCell,
    buildAdjacency:      buildAdjacency,
    runElectricPulse:    runElectricPulse,
    triggerCircuitComplete: triggerCircuitComplete,
    solveCurrentLevel:   solveCurrentLevel,
    playAgain:           playAgain,
    buildStartBtns:      buildStartBtns,
    show:                show,
    getHighest:          function () { return highestLvl; },
  };

})();
