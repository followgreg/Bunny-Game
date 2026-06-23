(function () {
  'use strict';

  var DIRECTIONS_TEXT = "Somewhere in this grid is a hidden shape — sliced into pieces, each one rotated out of place. Click any piece to spin it a quarter turn clockwise. Realign every piece and the shape reconnects, glowing as it comes together. Twenty-five shapes to restore, each one stranger than the last.";

  var LS_KEY   = 'mobi_highestLevel';
  var SHARE_URL = 'https://www.thebunnygame.com/mobi';
  var SVG_NS   = 'http://www.w3.org/2000/svg';

  var levels     = [];
  var currentLvl = 1;
  var highestLvl = 1;
  var tileStates = [];   // [{row,col,entryEdge,exitEdge,pathPoints,rotation}]
  var animating  = false;

  // DOM refs
  var startEl, gameEl, winEl;
  var startBtnsEl, hudLevelEl, hudFurthestEl, boardEl;

  document.addEventListener('DOMContentLoaded', function () {
    startEl       = document.getElementById('mb-start');
    gameEl        = document.getElementById('mb-game');
    winEl         = document.getElementById('mb-win');
    startBtnsEl   = document.getElementById('mb-start-btns');
    hudLevelEl    = document.getElementById('mb-level-label');
    hudFurthestEl = document.getElementById('mb-furthest-label');
    boardEl       = document.getElementById('mb-board');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    document.getElementById('mb-share').addEventListener('click', function () {
      shareText('MOBI — restored all 25 shapes. Every piece back in place. ' + SHARE_URL, 'MOBI');
    });

    document.getElementById('mb-play-again').addEventListener('click', function () {
      currentLvl = 1;
      showStart();
    });

    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/mobi-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels = data;
        showStart();
      })
      .catch(function () {
        startBtnsEl.innerHTML = '';
        var errP = document.createElement('p');
        errP.className = 'mb-sub';
        errP.style.color = '#f87171';
        errP.textContent = 'Levels failed to load. Try reloading the page.';
        startBtnsEl.appendChild(errP);
        startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Reload', function () { location.reload(); }));
        show(startEl);
      });
  });

  // ── Screens ───────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl); hide(winEl);
    startBtnsEl.innerHTML = '';

    if (highestLvl >= 25) {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Play Again', function () {
        currentLvl = 1; startGame();
      }));
    } else if (highestLvl > 1) {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Continue from Level ' + (highestLvl + 1), function () {
        currentLvl = highestLvl + 1; startGame();
      }));
      startBtnsEl.appendChild(mkBtn('mb-btn-ghost', 'Start from Level 1', function () {
        currentLvl = 1; startGame();
      }));
    } else {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Start', function () {
        currentLvl = 1; startGame();
      }));
    }

    show(startEl);
  }

  function startGame() {
    hide(startEl); hide(winEl);
    loadLevel(currentLvl);
    show(gameEl);
  }

  function showWin() {
    hide(gameEl);
    show(winEl);
  }

  // ── Level management ──────────────────────────────────────────────────────────

  function loadLevel(n) {
    var data = levels[n - 1];
    if (!data) { hide(gameEl); show(startEl); return; }

    tileStates = data.tiles.map(function (t) {
      return {
        row:        t.row,
        col:        t.col,
        entryEdge:  t.entryEdge,
        exitEdge:   t.exitEdge,
        pathPoints: t.pathPoints,
        rotation:   t.initialRotation
      };
    });

    hudLevelEl.textContent    = 'Level ' + n;
    hudFurthestEl.textContent = 'Best: ' + highestLvl;

    animating = false;
    renderBoard();
  }

  // ── Board rendering ───────────────────────────────────────────────────────────

  function renderBoard() {
    // Build O(1) tile lookup
    var tileMap = {};
    tileStates.forEach(function (t) { tileMap[t.row + ',' + t.col] = t; });

    boardEl.innerHTML = '';

    // Compute cell size from available space
    var avail    = Math.min(window.innerWidth - 24, window.innerHeight - 130, 480);
    var cellSize = Math.max(30, Math.floor(avail / 8));
    var boardSize = cellSize * 8;

    var svg = el(SVG_NS, 'svg');
    svg.setAttribute('id', 'mb-svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', boardSize);
    svg.setAttribute('height', boardSize);
    svg.style.display     = 'block';
    svg.style.touchAction = 'none';

    // ── Defs: neon glow filter ──
    var defs = el(SVG_NS, 'defs');
    var filt = el(SVG_NS, 'filter');
    filt.setAttribute('id', 'mg');
    filt.setAttribute('x', '-60%'); filt.setAttribute('y', '-60%');
    filt.setAttribute('width', '220%'); filt.setAttribute('height', '220%');
    var blur = el(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '0.06');
    blur.setAttribute('result', 'b');
    filt.appendChild(blur);
    var merge = el(SVG_NS, 'feMerge');
    ['b', 'b', 'SourceGraphic'].forEach(function (n) {
      var node = el(SVG_NS, 'feMergeNode');
      node.setAttribute('in', n);
      merge.appendChild(node);
    });
    filt.appendChild(merge);
    defs.appendChild(filt);
    svg.appendChild(defs);

    // ── Black background ──
    var bg = el(SVG_NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', '8'); bg.setAttribute('height', '8');
    bg.setAttribute('fill', '#000');
    svg.appendChild(bg);

    // ── Grid lines ──
    for (var i = 0; i <= 8; i++) {
      svg.appendChild(gridLine(i, 0, i, 8));   // vertical
      svg.appendChild(gridLine(0, i, 8, i));   // horizontal
    }

    // ── Arc paths for active tiles ──
    tileStates.forEach(function (tile) {
      var g = el(SVG_NS, 'g');
      g.setAttribute('transform', 'translate(' + tile.col + ',' + tile.row + ')');

      var rg = el(SVG_NS, 'g');
      rg.setAttribute('transform', 'rotate(' + (tile.rotation * 90) + ',0.5,0.5)');

      var arc = el(SVG_NS, 'path');
      arc.setAttribute('d', pts2path(tile.pathPoints));
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke-width', '0.115');
      arc.setAttribute('stroke-linecap', 'round');
      arc.setAttribute('stroke-linejoin', 'round');

      if (tile.rotation === 0) {
        arc.setAttribute('stroke', '#39FF14');
        arc.setAttribute('filter', 'url(#mg)');
      } else {
        arc.setAttribute('stroke', '#1c6b08');
      }

      rg.appendChild(arc);
      g.appendChild(rg);
      svg.appendChild(g);
    });

    // ── Transparent click-target rects ──
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var tile = tileMap[r + ',' + c];
        var rect = el(SVG_NS, 'rect');
        rect.setAttribute('x', c);
        rect.setAttribute('y', r);
        rect.setAttribute('width', '1');
        rect.setAttribute('height', '1');
        rect.setAttribute('fill', 'transparent');

        if (tile) {
          rect.style.cursor = 'pointer';
          (function (row, col) {
            rect.addEventListener('click', function () { handleClick(row, col); });
          }(r, c));
        } else {
          rect.style.pointerEvents = 'none';
        }
        svg.appendChild(rect);
      }
    }

    boardEl.appendChild(svg);
  }

  // ── Interaction ───────────────────────────────────────────────────────────────

  function handleClick(row, col) {
    if (animating) return;

    var tile = null;
    for (var i = 0; i < tileStates.length; i++) {
      if (tileStates[i].row === row && tileStates[i].col === col) { tile = tileStates[i]; break; }
    }
    if (!tile) return;

    tile.rotation = (tile.rotation + 1) % 4;
    renderBoard();

    // Win check — all tiles at rotation 0?
    var solved = true;
    for (var j = 0; j < tileStates.length; j++) {
      if (tileStates[j].rotation !== 0) { solved = false; break; }
    }
    if (solved) onLevelComplete();
  }

  // ── Level completion ──────────────────────────────────────────────────────────

  function onLevelComplete() {
    animating = true;

    if (currentLvl > highestLvl) {
      highestLvl = currentLvl;
      try { localStorage.setItem(LS_KEY, String(highestLvl)); } catch (e) {}
    }

    hudFurthestEl.textContent = 'Best: ' + highestLvl;

    var svg = document.getElementById('mb-svg');
    if (svg) {
      svg.classList.add('mb-complete');
      svg.addEventListener('animationend', function handler() {
        svg.removeEventListener('animationend', handler);
        svg.classList.remove('mb-complete');
        advance();
      }, { once: true });
      // Fallback in case animationend never fires (old browser)
      setTimeout(function () { svg.classList.remove('mb-complete'); advance(); }, 1600);
    } else {
      advance();
    }
  }

  function advance() {
    if (!animating) return;   // already fired (fallback race guard)
    animating = false;
    if (currentLvl >= 25) {
      showWin();
    } else {
      currentLvl++;
      loadLevel(currentLvl);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function pts2path(pts) {
    if (!pts || pts.length < 2) return '';
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2;
      var my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ' Q' + pts[i][0] + ',' + pts[i][1] + ' ' + mx + ',' + my;
    }
    var last = pts[pts.length - 1];
    d += ' L' + last[0] + ',' + last[1];
    return d;
  }

  function gridLine(x1, y1, x2, y2) {
    var ln = el(SVG_NS, 'line');
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
    ln.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    ln.setAttribute('stroke-width', '0.022');
    return ln;
  }

  function el(ns, tag) { return document.createElementNS(ns, tag); }

  function mkBtn(cls, text, onClick) {
    var b = document.createElement('button');
    b.className = cls; b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  function show(el) { if (el) el.classList.remove('mb-hide'); }
  function hide(el) { if (el) el.classList.add('mb-hide'); }

}());
