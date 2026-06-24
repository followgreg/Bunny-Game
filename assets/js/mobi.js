(function () {
  'use strict';

  var DIRECTIONS_TEXT = "Each puzzle is a finished piece of artwork cut into 64 pieces — every tile rotated out of place. Click any tile to spin it 90° clockwise. When all 64 tiles are back in their original orientation, the full artwork snaps back together. Ten pieces to restore.";

  var LS_KEY    = 'mobi_highestLevel';
  var SHARE_URL = 'https://www.thebunnygame.com/mobi';

  var levels     = [];
  var numLevels  = 0;
  var currentLvl = 1;
  var highestLvl = 1;
  var tileStates = [];  // [{row, col, rotation}]
  var levelData  = null;
  var animating  = false;

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
      shareText('MOBI — restored all the art. Every tile back in place. ' + SHARE_URL, 'MOBI');
    });
    document.getElementById('mb-play-again').addEventListener('click', function () {
      currentLvl = 1; showStart();
    });

    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/mobi-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels    = data;
        numLevels = data.length;
        showStart();
      })
      .catch(function () {
        startBtnsEl.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'mb-sub';
        p.style.color = '#f87171';
        p.textContent = 'Levels failed to load. Try reloading the page.';
        startBtnsEl.appendChild(p);
        startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Reload', function () { location.reload(); }));
        show(startEl);
      });
  });

  // ── Screens ───────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl); hide(winEl);
    startBtnsEl.innerHTML = '';
    if (highestLvl >= numLevels) {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Play Again', function () { currentLvl = 1; startGame(); }));
    } else if (highestLvl > 1) {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Continue — Level ' + (highestLvl + 1), function () { currentLvl = highestLvl + 1; startGame(); }));
      startBtnsEl.appendChild(mkBtn('mb-btn-ghost',   'Start from Level 1',                    function () { currentLvl = 1; startGame(); }));
    } else {
      startBtnsEl.appendChild(mkBtn('mb-btn-primary', 'Start', function () { currentLvl = 1; startGame(); }));
    }
    show(startEl);
  }

  function startGame() { hide(startEl); hide(winEl); loadLevel(currentLvl); show(gameEl); }
  function showWin()   { hide(gameEl); show(winEl); }

  // ── Level loading ─────────────────────────────────────────────────────────────

  function loadLevel(n) {
    var data = levels[n - 1];
    if (!data) { showStart(); return; }
    levelData = data;
    animating = false;

    tileStates = data.tiles.map(function (t) {
      return { row: t.row, col: t.col, rotation: t.initialRotation, isEmpty: !!t.isEmpty };
    });

    hudLevelEl.textContent    = 'Level ' + n;
    hudFurthestEl.textContent = 'Best: ' + highestLvl;
    renderBoard();
  }

  // ── Board rendering ───────────────────────────────────────────────────────────

  function renderBoard() {
    boardEl.innerHTML = '';

    var avail  = Math.min(window.innerWidth - 24, window.innerHeight - 130, 480);
    var BOARD  = Math.floor(avail / 8) * 8;
    var TILE   = BOARD / 8;

    boardEl.style.display             = 'grid';
    boardEl.style.gridTemplateColumns = 'repeat(8, ' + TILE + 'px)';
    boardEl.style.gridTemplateRows    = 'repeat(8, ' + TILE + 'px)';
    boardEl.style.width               = BOARD + 'px';
    boardEl.style.height              = BOARD + 'px';
    boardEl.style.gap                 = '0';

    var srcPath = '/mobi-source/' + levelData.sourceFile;

    // Build lookup for glow checks: tracks rotation and isEmpty per tile
    var tileMap = {};
    tileStates.forEach(function (t) { tileMap[t.row + ',' + t.col] = t; });

    // Render 64 tiles in row-major order (CSS grid handles placement)
    tileStates.forEach(function (tile) {
      boardEl.appendChild(makeTileEl(tile, BOARD, TILE, srcPath, tileMap));
    });
  }

  function makeTileEl(tile, BOARD, TILE, srcPath, tileMap) {
    var div = document.createElement('div');
    div.className       = 'mobi-tile';
    div.style.width     = TILE + 'px';
    div.style.height    = TILE + 'px';
    div.style.overflow  = 'hidden';
    div.style.position  = 'relative';
    div.style.cursor    = 'pointer';
    div.style.boxSizing = 'border-box';
    div.style.transform = 'rotate(' + (tile.rotation * 90) + 'deg)';

    // Glow: tile has artwork, is solved, AND at least one artwork neighbor is also solved.
    // Empty tiles never glow regardless of rotation state.
    if (!tile.isEmpty && tile.rotation === 0) {
      var adjSolved = [
        tileMap[(tile.row - 1) + ',' + tile.col],
        tileMap[(tile.row + 1) + ',' + tile.col],
        tileMap[tile.row + ',' + (tile.col - 1)],
        tileMap[tile.row + ',' + (tile.col + 1)],
      ].some(function (n) { return n && !n.isEmpty && n.rotation === 0; });

      if (adjSolved) {
        div.style.boxShadow = 'inset 0 0 0 1px rgba(57,255,20,0.45)';
      }
    }

    var img = document.createElement('img');
    img.src               = srcPath;
    img.style.position    = 'absolute';
    img.style.width       = BOARD + 'px';
    img.style.height      = BOARD + 'px';
    img.style.left        = (-tile.col * TILE) + 'px';
    img.style.top         = (-tile.row * TILE) + 'px';
    img.style.pointerEvents = 'none';
    img.draggable         = false;

    div.appendChild(img);

    (function (ts) {
      div.addEventListener('click', function () { handleClick(ts); });
    }(tile));

    return div;
  }

  // ── Interaction ───────────────────────────────────────────────────────────────

  function handleClick(tile) {
    if (animating) return;
    tile.rotation = (tile.rotation + 1) % 4;
    renderBoard();

    var solved = tileStates.every(function (t) { return t.rotation === 0; });
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

    boardEl.classList.add('mb-complete');
    setTimeout(function () {
      boardEl.classList.remove('mb-complete');
      animating = false;
      if (currentLvl >= numLevels) showWin();
      else { currentLvl++; loadLevel(currentLvl); }
    }, 1500);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function show(e) { if (e) e.classList.remove('mb-hide'); }
  function hide(e) { if (e) e.classList.add('mb-hide'); }

  function mkBtn(cls, txt, fn) {
    var b = document.createElement('button');
    b.className = cls; b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  }

}());
