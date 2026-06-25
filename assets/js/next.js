(function () {
  'use strict';

  var LS_KEY       = 'next_highestLevel';
  var SHARE_URL    = 'https://www.thebunnygame.com/next';
  var TOTAL_BOARDS = 100;

  // Layout constants
  var CIRCLE_SIZE = 52;   // px diameter
  var CIRCLE_GAP  = 10;   // px gap between circles
  var PER_ROW     = 5;    // circles per row
  var CELL_STEP   = CIRCLE_SIZE + CIRCLE_GAP;  // 62
  var LEFT_PAD    = 24;   // px left padding inside seq-grid
  var TOP_PAD     = 16;   // px top padding inside seq-grid

  // COLOR_MAP: name → hex (must match generator)
  var COLOR_MAP = {
    red:        '#FF2233',
    blue:       '#1155DD',
    lime:       '#77DD00',
    purple:     '#9922CC',
    cyan:       '#00BBCC',
    green:      '#22BB44',
    orange:     '#FF6600',
    pink:       '#EE2299',
    yellow:     '#FFEE00',
    sky:        '#3399FF',
    teal:       '#11BBAA',
    violet:     '#8833EE',
    amber:      '#CC8800',
    indigo:     '#4444DD',
    sage:       '#668833',
    magenta:    '#DD22AA',
    coral:      '#FF7755',
    periwinkle: '#7788FF',
    chartreuse: '#CCEE00',
    rose:       '#FF3366',
  };

  var boards      = [];
  var currentBoard = 1;
  var highestBoard = 1;

  // DOM refs
  var startEl, gameEl, winEl;
  var startBtnsEl, boardLabelEl, furthestLabelEl;
  var seqWrapEl, seqGridEl, threadSvgEl;
  var paletteEl, feedbackEl;
  var completeEl, completeLabelEl;

  document.addEventListener('DOMContentLoaded', function () {
    startEl         = document.getElementById('nx-start');
    gameEl          = document.getElementById('nx-game');
    winEl           = document.getElementById('nx-win');
    startBtnsEl     = document.getElementById('nx-start-btns');
    boardLabelEl    = document.getElementById('nx-board-label');
    furthestLabelEl = document.getElementById('nx-furthest-label');
    seqWrapEl       = document.getElementById('nx-seq-wrap');
    seqGridEl       = document.getElementById('nx-seq-grid');
    threadSvgEl     = document.getElementById('nx-thread');
    paletteEl       = document.getElementById('nx-palette');
    feedbackEl      = document.getElementById('nx-feedback');
    completeEl      = document.getElementById('nx-complete');
    completeLabelEl = document.getElementById('nx-complete-label');

    if (completeEl) {
      document.getElementById('nx-next-board').addEventListener('click', function () {
        hide(completeEl);
        currentBoard++;
        loadBoard(currentBoard);
      });
    }

    document.getElementById('help-btn').addEventListener('click', showDirections);

    document.getElementById('nx-share').addEventListener('click', function () {
      shareText('Next — solved all 100 sequences. ' + SHARE_URL, 'Next');
    });

    document.getElementById('nx-play-again').addEventListener('click', function () {
      currentBoard = 1;
      showStart();
    });

    document.getElementById('dir-close-btn').addEventListener('click', function () {
      document.getElementById('directions-overlay').classList.add('hidden');
    });

    highestBoard = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/next-boards.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        boards = data;
        showStart();
      });
  });

  // ── Screens ────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl);
    hide(winEl);
    startBtnsEl.innerHTML = '';

    if (highestBoard >= TOTAL_BOARDS) {
      startBtnsEl.appendChild(mkBtn('nx-btn-primary', 'Play Again', function () {
        currentBoard = 1;
        startGame();
      }));
    } else if (highestBoard > 1) {
      startBtnsEl.appendChild(mkBtn('nx-btn-primary', 'Continue from Board ' + (highestBoard + 1), function () {
        currentBoard = highestBoard + 1;
        startGame();
      }));
      startBtnsEl.appendChild(mkBtn('nx-btn-ghost', 'Start from Board 1', function () {
        currentBoard = 1;
        startGame();
      }));
    } else {
      startBtnsEl.appendChild(mkBtn('nx-btn-primary', 'Start', function () {
        currentBoard = 1;
        startGame();
      }));
    }

    show(startEl);
  }

  function startGame() {
    hide(startEl);
    hide(winEl);
    loadBoard(currentBoard);
    show(gameEl);
  }

  function showWin() {
    hide(gameEl);
    show(winEl);
  }

  // ── Board loading ──────────────────────────────────────────────────────────

  function loadBoard(n) {
    hide(completeEl);
    feedbackEl.textContent = '';

    var data = boards[n - 1];
    if (!data) { showWin(); return; }

    boardLabelEl.textContent    = 'Board ' + n;
    furthestLabelEl.textContent = highestBoard >= TOTAL_BOARDS ? 'Completed!' :
      (highestBoard > 1 ? 'Best: ' + highestBoard : '');

    renderSequence(data);
    renderPalette(data);
  }

  // ── Sequence rendering ─────────────────────────────────────────────────────

  function renderSequence(data) {
    var seq = data.sequence; // without answer
    var n   = seq.length + 1; // total circles (including blank)

    seqGridEl.innerHTML = '';
    seqGridEl.style.gridTemplateColumns = 'repeat(' + PER_ROW + ', ' + CIRCLE_SIZE + 'px)';
    seqGridEl.style.gap         = CIRCLE_GAP + 'px';
    seqGridEl.style.paddingLeft = LEFT_PAD + 'px';
    seqGridEl.style.paddingTop  = TOP_PAD + 'px';
    seqGridEl.style.paddingBottom = '8px';

    for (var i = 0; i < n; i++) {
      var div = document.createElement('div');
      div.className = 'nx-circle';

      var pos = document.createElement('span');
      pos.className = 'nx-pos-num';
      pos.textContent = i + 1;

      if (i < seq.length) {
        div.classList.add('nx-circle-filled');
        div.style.background = COLOR_MAP[seq[i]] || '#888';
      } else {
        div.classList.add('nx-circle-blank');
        div.id = 'nx-blank';
      }

      div.appendChild(pos);
      seqGridEl.appendChild(div);
    }

    // Draw thread after a frame so layout is settled
    requestAnimationFrame(function () { drawThread(n); });
  }

  function drawThread(n) {
    var wrapRect = seqWrapEl.getBoundingClientRect();
    var gridRect = seqGridEl.getBoundingClientRect();
    var offsetX  = gridRect.left - wrapRect.left;
    var offsetY  = gridRect.top  - wrapRect.top;

    function cx(i) {
      return offsetX + LEFT_PAD + (i % PER_ROW) * CELL_STEP + CIRCLE_SIZE / 2;
    }
    function cy(i) {
      return offsetY + TOP_PAD + Math.floor(i / PER_ROW) * CELL_STEP + CIRCLE_SIZE / 2;
    }

    if (n < 2) { threadSvgEl.innerHTML = ''; return; }

    var d = 'M ' + cx(0) + ' ' + cy(0);
    var rightEdge = offsetX + LEFT_PAD + PER_ROW * CELL_STEP - CIRCLE_GAP + 24;

    for (var i = 1; i < n; i++) {
      var prevRow = Math.floor((i - 1) / PER_ROW);
      var currRow = Math.floor(i / PER_ROW);

      if (prevRow === currRow) {
        // Same row: straight line
        d += ' L ' + cx(i) + ' ' + cy(i);
      } else {
        // Row transition: cubic bezier sweeping right margin
        d += ' C ' + rightEdge + ' ' + cy(i - 1) +
             ' '   + rightEdge + ' ' + cy(i) +
             ' '   + cx(i)     + ' ' + cy(i);
      }
    }

    threadSvgEl.innerHTML = '<path class="nx-thread-line" d="' + d + '"/>';

    threadSvgEl.setAttribute('viewBox', '0 0 ' + wrapRect.width + ' ' + wrapRect.height);
    threadSvgEl.style.width  = wrapRect.width  + 'px';
    threadSvgEl.style.height = wrapRect.height + 'px';
  }

  // ── Palette rendering ──────────────────────────────────────────────────────

  function renderPalette(data) {
    paletteEl.innerHTML = '';
    data.paletteAtThisBoard.forEach(function (colorName) {
      var sw = document.createElement('button');
      sw.className = 'nx-swatch';
      sw.style.background = COLOR_MAP[colorName] || '#888';
      sw.setAttribute('aria-label', colorName);
      sw.addEventListener('click', function () { handlePick(colorName, data.answer); });
      paletteEl.appendChild(sw);
    });
  }

  // ── Answer handling ────────────────────────────────────────────────────────

  function handlePick(colorName, answer) {
    var blank = document.getElementById('nx-blank');
    if (!blank) return;

    if (colorName === answer) {
      // Correct
      blank.classList.remove('nx-circle-blank');
      blank.classList.add('nx-circle-filled', 'nx-filled');
      blank.style.background = COLOR_MAP[colorName];
      feedbackEl.textContent = '';

      if (currentBoard > highestBoard) {
        highestBoard = currentBoard;
        try { localStorage.setItem(LS_KEY, String(highestBoard)); } catch (e) {}
      }

      setTimeout(function () {
        if (currentBoard >= TOTAL_BOARDS) {
          if (highestBoard < TOTAL_BOARDS) {
            highestBoard = TOTAL_BOARDS;
            try { localStorage.setItem(LS_KEY, String(TOTAL_BOARDS)); } catch (e) {}
          }
          showWin();
        } else {
          completeLabelEl.textContent = 'Board ' + currentBoard + ' Complete';
          show(completeEl);
        }
      }, 600);

    } else {
      // Wrong
      feedbackEl.textContent = 'Try again';
      blank.classList.remove('nx-shake');
      void blank.offsetWidth; // force reflow
      blank.classList.add('nx-shake');
      setTimeout(function () {
        blank.classList.remove('nx-shake');
        feedbackEl.textContent = '';
      }, 400);
    }
  }

  // ── Directions ─────────────────────────────────────────────────────────────

  function showDirections() {
    var overlay = document.getElementById('directions-overlay');
    var textEl  = document.getElementById('directions-text');
    textEl.innerHTML = buildDirectionsHTML();
    overlay.classList.remove('hidden');
  }

  function buildDirectionsHTML() {
    var svg = buildDirectionsSVG();
    return '<div style="margin-bottom:14px">' + svg + '</div>' +
      '<p style="font-family:\'DM Sans\',sans-serif;font-size:0.9rem;color:#94a3b8;line-height:1.7;margin:0">' +
      'Next shows you a sequence of colored circles, ending in one waiting to be filled. ' +
      'Figure out the pattern, then pick the matching color from the palette below. ' +
      'Get it right and the next sequence appears — get it wrong and you simply try again, no penalty. ' +
      'As sequences grow, they wrap into new rows, but it\'s still one single sequence start to finish — ' +
      'follow the connecting thread and the numbers to read it in order. ' +
      'One hundred sequences, each trickier than the last.' +
      '</p>';
  }

  function buildDirectionsSVG() {
    // Show 7 circles in 2 rows (5 + 2), with connecting thread and position numbers
    // Row 0: circles 1-5 (positions 0-4): red, orange, red, orange, red
    // Row 1: circles 6-7 (positions 5-6): orange, blank
    var demoSeq = ['#FF4455', '#FF8833', '#FF4455', '#FF8833', '#FF4455', '#FF8833'];
    var PER     = 5;
    var CS      = 36; // smaller circles for the demo
    var GAP     = 8;
    var STEP    = CS + GAP;
    var LP      = 16; // left pad
    var TP      = 14; // top pad
    var n       = 7;  // 6 filled + 1 blank
    var rows    = Math.ceil(n / PER);
    var w       = LP + PER * STEP - GAP + 24;
    var h       = TP + rows * STEP - GAP + 14;
    var RE      = LP + PER * STEP - GAP + 20;

    function cirX(i) { return LP + (i % PER) * STEP + CS / 2; }
    function cirY(i) { return TP + Math.floor(i / PER) * STEP + CS / 2; }

    // Thread path
    var d = 'M ' + cirX(0) + ' ' + cirY(0);
    for (var i = 1; i < n; i++) {
      var pr = Math.floor((i - 1) / PER);
      var cr = Math.floor(i / PER);
      if (pr === cr) {
        d += ' L ' + cirX(i) + ' ' + cirY(i);
      } else {
        d += ' C ' + RE + ' ' + cirY(i - 1) + ' ' + RE + ' ' + cirY(i) + ' ' + cirX(i) + ' ' + cirY(i);
      }
    }

    var circles = '';
    for (var j = 0; j < n; j++) {
      var x = cirX(j);
      var y = cirY(j);
      var r = CS / 2;
      if (j < demoSeq.length) {
        circles += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + demoSeq[j] + '" opacity="0.95"/>';
      } else {
        circles += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="#9A9A9E" stroke-width="2.5"/>';
        circles += '<text x="' + x + '" y="' + (y + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#9A9A9E" font-family="DM Sans,sans-serif">?</text>';
      }
      circles += '<text x="' + x + '" y="' + (y + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="DM Sans,sans-serif">' + (j + 1) + '</text>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" style="display:block;margin:0 auto;border-radius:8px;background:#2B2B2E;padding:4px">' +
      '<path d="' + d + '" stroke="#9A9A9E" stroke-width="1.5" fill="none" opacity="0.5"/>' +
      circles +
      '</svg>';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function show(el) { if (el) el.classList.remove('nx-hide'); }
  function hide(el) { if (el) el.classList.add('nx-hide'); }

  function mkBtn(cls, text, onClick) {
    var el = document.createElement('button');
    el.className = cls;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }

})();
