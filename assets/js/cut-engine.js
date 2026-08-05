/* ============================================================
   cut-engine.js — the shared engine behind Top Cut and Nation Divided.

   One straight line splits a shape into two pieces; the pieces fall into the
   pans of a balance; the beam reports which piece got more area. The whole
   game is an area comparison, so the geometry half is kept DOM-free and exact:
   Sutherland–Hodgman clipping against the infinite line through the drag,
   shoelace area on both outputs. Everything the player sees is a rendering of
   those numbers, never the other way round.

   A game supplies its levels and its words; the engine owns the board, the
   maths, the animation and the progress. See mount() for the contract.
   ============================================================ */
(function (global) {
  'use strict';

  // ── Geometry ───────────────────────────────────────────────────────────────
  // A shape is { outer: [pt…], holes: [[pt…]…] }. Rings are normalised so the
  // outer winds one way and every hole the other — that makes the canvas
  // nonzero fill rule punch the holes for free, and makes the area of a shape
  // a plain sum of signed ring areas rather than a special case per ring.

  function P(flat) {
    var pts = [];
    for (var i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
    return pts;
  }

  function signedArea(pts) {
    var a = 0, n = pts.length;
    if (n < 3) return 0;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    }
    return a / 2;
  }

  function orient(pts, positive) {
    var a = signedArea(pts);
    if ((a < 0) === !!positive) { pts = pts.slice().reverse(); }
    return pts;
  }

  function makeShape(outerPts, holePtsList) {
    return {
      outer: orient(outerPts, true),
      holes: (holePtsList || []).map(function (h) { return orient(h, false); }),
    };
  }

  // Outer is wound positive and holes negative, so this is already the net area.
  function shapeArea(shape) {
    var a = signedArea(shape.outer);
    for (var i = 0; i < shape.holes.length; i++) a += signedArea(shape.holes[i]);
    return Math.abs(a);
  }

  function polyCentroid(pts) {
    var cx = 0, cy = 0, a = 0, n = pts.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
      a += f;
      cx += (pts[j].x + pts[i].x) * f;
      cy += (pts[j].y + pts[i].y) * f;
    }
    a *= 0.5;
    // A degenerate sliver has no meaningful centroid — fall back to the mean of
    // its points rather than dividing by an area of zero.
    if (Math.abs(a) < 1e-9) {
      if (!n) return { x: 0, y: 0 };
      var sx = 0, sy = 0;
      for (var k = 0; k < n; k++) { sx += pts[k].x; sy += pts[k].y; }
      return { x: sx / n, y: sy / n };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function shapeCentroid(shape) {
    // Area-weighted across rings: the holes carry negative weight, which is
    // what pulls a donut piece's centroid away from its own missing middle.
    var sx = 0, sy = 0, sa = 0;
    var rings = [shape.outer].concat(shape.holes);
    for (var i = 0; i < rings.length; i++) {
      var a = signedArea(rings[i]);
      if (!a) continue;
      var c = polyCentroid(rings[i]);
      sx += c.x * a; sy += c.y * a; sa += a;
    }
    if (Math.abs(sa) < 1e-9) return polyCentroid(shape.outer);
    return { x: sx / sa, y: sy / sa };
  }

  function pointInRing(pts, x, y) {
    var inside = false, n = pts.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var yi = pts[i].y, yj = pts[j].y;
      if ((yi > y) !== (yj > y)) {
        var t = (y - yi) / (yj - yi);
        if (x < pts[i].x + t * (pts[j].x - pts[i].x)) inside = !inside;
      }
    }
    return inside;
  }

  function pointInShape(shape, x, y) {
    if (!pointInRing(shape.outer, x, y)) return false;
    for (var i = 0; i < shape.holes.length; i++) {
      if (pointInRing(shape.holes[i], x, y)) return false;
    }
    return true;
  }

  function bbox(pts) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < b.x0) b.x0 = pts[i].x;
      if (pts[i].y < b.y0) b.y0 = pts[i].y;
      if (pts[i].x > b.x1) b.x1 = pts[i].x;
      if (pts[i].y > b.y1) b.y1 = pts[i].y;
    }
    return b;
  }

  // Sutherland–Hodgman against a single half-plane: keep nx*x + ny*y + d >= 0.
  // On a concave ring this returns a self-touching polygon whose extra edges lie
  // exactly on the clip line, so both the shoelace area and the nonzero fill of
  // the result stay correct — no component splitting needed. That matters more
  // for a country than it ever did for a croissant: Chile and Norway are almost
  // all concavity.
  function clipHalfPlane(pts, nx, ny, d) {
    var out = [], n = pts.length;
    if (n < 3) return out;
    var prev = pts[n - 1];
    var pd = nx * prev.x + ny * prev.y + d;
    for (var i = 0; i < n; i++) {
      var cur = pts[i];
      var cd = nx * cur.x + ny * cur.y + d;
      if (cd >= 0) {
        if (pd < 0) {
          var t = pd / (pd - cd);
          out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
        }
        out.push({ x: cur.x, y: cur.y });
      } else if (pd >= 0) {
        var t2 = pd / (pd - cd);
        out.push({ x: prev.x + (cur.x - prev.x) * t2, y: prev.y + (cur.y - prev.y) * t2 });
      }
      prev = cur; pd = cd;
    }
    return out;
  }

  // Splits a shape by the infinite line through p0 and p1. Returns the two
  // halves, or null when the line is degenerate.
  function cutShape(shape, p0, p1) {
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    var nx = -dy / len, ny = dx / len;
    var d = -(nx * p0.x + ny * p0.y);

    function half(sign) {
      var s = { outer: clipHalfPlane(shape.outer, sign * nx, sign * ny, sign * d), holes: [] };
      for (var i = 0; i < shape.holes.length; i++) {
        var h = clipHalfPlane(shape.holes[i], sign * nx, sign * ny, sign * d);
        if (h.length >= 3) s.holes.push(h);
      }
      return s;
    }

    return { a: half(1), b: half(-1), n: { x: nx, y: ny }, d: d, p0: p0, p1: p1 };
  }

  function pctOff(areaA, areaB) {
    var total = areaA + areaB;
    if (total <= 0) return 100;
    return Math.abs(areaA - areaB) / total * 100;
  }

  // ── Board layout — one mobile size, one desktop size, chosen once ──────────
  // innerWidth can still be 0 in a frame that has not been laid out when the
  // script runs, which would silently hand a desktop the phone board.
  var VIEW_W = (typeof window !== 'undefined' &&
                (window.innerWidth || document.documentElement.clientWidth ||
                 (window.screen && window.screen.width))) || 1024;
  var MOBILE = VIEW_W < 640;

  var LW = MOBILE ? 380 : 460;
  var LH = MOBILE ? 640 : 720;

  // Vertical bands, as fractions of the board. The shape gets the top half,
  // the readout the strip under it, the scale the bottom third — so the beam
  // is never covered by the number it is illustrating.
  var READ_Y    = LH * 0.485;
  var PIVOT     = { x: LW / 2, y: LH * 0.655 };
  var BEAM_HALF = LW * 0.32;
  var STRING    = LH * 0.07;
  var PAN_W     = LW * 0.34;
  var PAN_D     = LH * 0.046;
  var BASE_Y    = LH * 0.87;
  var MAX_TILT  = 13 * Math.PI / 180;

  var MIN_DRAG = 26;          // board units — a tap is not a cut
  var MIN_PIECE = 0.004;      // a piece under 0.4% of the shape is a miss

  var DEFAULT_PALETTE = {
    ink: '#231f20', paper: '#F5F0E8', cut: '#E4572E', muted: '#8A8073', good: '#2E7D4F',
  };

  function q(id) { return document.getElementById(id); }
  function fmtPct(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── mount ─────────────────────────────────────────────────────────────────
  // opts:
  //   levels      [{ name, outer:[flat], holes?:[[flat]], fill, stroke, art? }]
  //   passPct     threshold to unlock the next level
  //   storeKey    localStorage key for { reached, best }
  //   shareTitle  Web Share title
  //   shareText   fn(level, pctString) -> string
  //   prompt      fn(level) -> the line shown while the board waits for a drag
  //   nounPlural  what a rejected cut calls the thing ("object", "country")
  //   directions  how-to-play copy
  //   headerFrac  board fraction reserved above the shape for a game's own
  //               header (Nation Divided puts the flag and country name there)
  //   palette     optional colour overrides
  //   onLevel     fn(level, index1) called whenever a level loads
  function mount(opts) {
    var LEVELS = opts.levels;
    var LEVEL_COUNT = LEVELS.length;
    var PASS_PCT = opts.passPct === undefined ? 5 : opts.passPct;
    var STORE_KEY = opts.storeKey;
    var NOUN = opts.noun || 'object';
    var pal = {};
    Object.keys(DEFAULT_PALETTE).forEach(function (k) { pal[k] = DEFAULT_PALETTE[k]; });
    Object.keys(opts.palette || {}).forEach(function (k) { pal[k] = opts.palette[k]; });

    var headerFrac = opts.headerFrac || 0;
    var OBJ_BOX = {
      x: LW * 0.08,
      y: LH * (0.04 + headerFrac),
      w: LW * 0.84,
      h: LH * (0.41 - headerFrac),
    };

    LEVELS.forEach(function (lvl) {
      lvl.shape = makeShape(P(lvl.outer), (lvl.holes || []).map(P));
      lvl.box = bbox(lvl.shape.outer);
      lvl.area = shapeArea(lvl.shape);
    });

    function fitTransform(lvl) {
      var b = lvl.box;
      var k = Math.min(OBJ_BOX.w / (b.x1 - b.x0), OBJ_BOX.h / (b.y1 - b.y0));
      return {
        k: k,
        tx: OBJ_BOX.x + (OBJ_BOX.w - (b.x1 - b.x0) * k) / 2 - b.x0 * k,
        ty: OBJ_BOX.y + (OBJ_BOX.h - (b.y1 - b.y0) * k) / 2 - b.y0 * k,
      };
    }

    function mapRing(ring, f) {
      return ring.map(function (p) { return { x: f.tx + p.x * f.k, y: f.ty + p.y * f.k }; });
    }

    function mapShape(shape, f) {
      return { outer: mapRing(shape.outer, f), holes: shape.holes.map(function (h) { return mapRing(h, f); }) };
    }

    // ── Progress ────────────────────────────────────────────────────────────
    // Storage can throw (private mode, quota) and anything could be sitting
    // under the key, so a bad reading is treated as a fresh start rather than
    // poisoning the level gate.
    function loadProgress() {
      var blank = { reached: 1, best: {} };
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) return blank;
        var o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return blank;
        var reached = parseInt(o.reached, 10);
        if (!isFinite(reached) || reached < 1) reached = 1;
        if (reached > LEVEL_COUNT) reached = LEVEL_COUNT;
        var best = {};
        if (o.best && typeof o.best === 'object') {
          Object.keys(o.best).forEach(function (k) {
            var n = parseFloat(o.best[k]);
            var i = parseInt(k, 10);
            if (isFinite(n) && n >= 0 && n <= 100 && i >= 1 && i <= LEVEL_COUNT) best[i] = n;
          });
        }
        return { reached: reached, best: best };
      } catch (e) { return blank; }
    }

    function saveProgress(p) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* not fatal */ }
    }

    // ── State ───────────────────────────────────────────────────────────────
    var progress = loadProgress();
    var level = 1;
    var phase = 'splash';       // splash | ready | drag | fall | weigh | result
    var lv = null, fit = null, wholeCanvas = null;
    var drag = null, pieces = null, result = null;
    var tilt = 0, tiltTarget = 0, fallT = 0, shakeT = 0;

    var canvas, ctx, stage, wrap;
    var elLevel, elObject, elBest, elActions, elNext, elAgain, elShare, elToast, elStart;
    var elPrev, elNextLvl;
    var DPR = 1;

    // ── Level setup ─────────────────────────────────────────────────────────
    function loadLevel(n) {
      level = Math.max(1, Math.min(LEVEL_COUNT, n));
      lv = LEVELS[level - 1];
      fit = fitTransform(lv);
      wholeCanvas = mapShape(lv.shape, fit);
      drag = null; pieces = null; result = null;
      tilt = 0; tiltTarget = 0; fallT = 0;
      phase = 'ready';
      syncStats();
      hideActions();
      if (opts.onLevel) opts.onLevel(lv, level);
    }

    function syncStats() {
      if (elLevel) elLevel.textContent = level + ' / ' + LEVEL_COUNT;
      if (elObject) elObject.textContent = lv ? titleCase(lv.name) : '—';
      if (elBest) {
        var b = progress.best[level];
        elBest.textContent = (b === undefined) ? '—' : fmtPct(b) + '%';
      }
      if (elPrev) elPrev.disabled = level <= 1;
      if (elNextLvl) elNextLvl.disabled = level >= progress.reached;
    }

    // ── The cut ─────────────────────────────────────────────────────────────
    function tryCut(x0, y0, x1, y1) {
      if (Math.hypot(x1 - x0, y1 - y0) < MIN_DRAG) return toast('Drag a longer line.');
      if (pointInShape(wholeCanvas, x0, y0) || pointInShape(wholeCanvas, x1, y1)) {
        return toast('Start and finish outside the ' + NOUN + '.');
      }

      var cut = cutShape(wholeCanvas, { x: x0, y: y0 }, { x: x1, y: y1 });
      if (!cut) return toast('Drag a longer line.');

      var aA = shapeArea(cut.a), aB = shapeArea(cut.b);
      var total = aA + aB;
      if (total <= 0 || Math.min(aA, aB) / total < MIN_PIECE) {
        return toast('That line missed the ' + NOUN + '.');
      }

      // The pan a piece falls into is decided by comparing the two centroids to
      // each other, not to the board: a near-horizontal cut has both centroids
      // at the same x, and only their order says which piece is the left one.
      var cA = shapeCentroid(cut.a), cB = shapeCentroid(cut.b);
      var leftIsA = cA.x <= cB.x;

      var pL = makePiece(leftIsA ? cut.a : cut.b, leftIsA ? aA : aB, -1);
      var pR = makePiece(leftIsA ? cut.b : cut.a, leftIsA ? aB : aA, 1);
      pieces = [pL, pR];

      result = { pct: pctOff(pL.area, pR.area), areaL: pL.area, areaR: pR.area };
      result.pass = result.pct <= PASS_PCT;

      // Right heavier tips the beam clockwise on a y-down board. The curve is
      // deliberately steep near zero so a good cut still visibly settles, and
      // clamped so a wild one stays readable rather than standing on end.
      var d = (pR.area - pL.area) / total;
      var mag = Math.min(1, Math.pow(Math.abs(d) * 4, 0.75));
      tiltTarget = MAX_TILT * mag * (d < 0 ? -1 : 1);

      phase = 'fall';
      fallT = 0;
      return true;
    }

    function makePiece(shape, area, side) {
      var c = shapeCentroid(shape);
      var b = bbox(shape.outer);
      var w = b.x1 - b.x0, h = b.y1 - b.y0;
      // Shrink to sit inside a pan rather than on top of one — the pieces are
      // half a shape each and a pan is barely a third of the board wide.
      var s = Math.min(1, (PAN_W * 0.74) / Math.max(w, 1), (LH * 0.095) / Math.max(h, 1));
      return {
        shape: shape, area: area, side: side,
        c0: c, scale: s,
        bottom: b.y1 - c.y,
        rot: (side > 0 ? 1 : -1) * (0.10 + Math.random() * 0.10),
      };
    }

    function panAnchor(side, t) {
      var ex = PIVOT.x + side * BEAM_HALF * Math.cos(t);
      var ey = PIVOT.y + side * BEAM_HALF * Math.sin(t);
      return { x: ex, y: ey + STRING };
    }

    function pieceTarget(p, t) {
      // Seated at the deepest point of the bowl, not balanced on its rim
      var a = panAnchor(p.side, t);
      return { x: a.x, y: a.y + PAN_D - p.bottom * p.scale };
    }

    function piecePose(p) {
      if (phase === 'ready' || phase === 'drag') return { x: p.c0.x, y: p.c0.y, s: 1, r: 0 };
      if (phase === 'fall') {
        var t = fallT;
        var e = t * t;                       // gravity: slow off the mark, quick at the end
        var tgt = pieceTarget(p, 0);
        // The first fraction of the fall is the two halves parting company.
        var part = Math.min(1, t / 0.18) * 5 * p.side;
        return {
          x: p.c0.x + part + (tgt.x - p.c0.x) * e,
          y: p.c0.y + (tgt.y - p.c0.y) * e,
          s: 1 + (p.scale - 1) * t,
          r: p.rot * t,
        };
      }
      var tg = pieceTarget(p, tilt);
      return { x: tg.x, y: tg.y, s: p.scale, r: p.rot };
    }

    // ── Toast ───────────────────────────────────────────────────────────────
    var toastTimer = null;
    function toast(msg) {
      shakeT = 1;
      if (!elToast) return false;
      elToast.textContent = msg;
      elToast.classList.add('cut-toast-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { elToast.classList.remove('cut-toast-on'); }, 1800);
      return false;
    }

    // ── Drawing ─────────────────────────────────────────────────────────────
    function ringPath(c, ring) {
      if (ring.length < 3) return;
      c.moveTo(ring[0].x, ring[0].y);
      for (var i = 1; i < ring.length; i++) c.lineTo(ring[i].x, ring[i].y);
      c.closePath();
    }

    function shapePath(c, shape) {
      c.beginPath();
      ringPath(c, shape.outer);
      for (var i = 0; i < shape.holes.length; i++) ringPath(c, shape.holes[i]);
    }

    // Runs in the level's own coordinates, inside the piece's clip, so a cut
    // piece keeps the illustration it was cut out of.
    //   p  polygon    { t:'p', f, d }        c  circle   { t:'c', f, x, y, r }
    //   r  rect       { t:'r', f, x,y,w,h }  l  polyline { t:'l', s, w, d }
    //   i  inset copy { t:'i', f, k }  — the outer ring scaled about its centre
    function drawArt(c) {
      shapePath(c, lv.shape);
      c.fillStyle = lv.fill;
      c.fill();

      var art = lv.art || [];
      for (var i = 0; i < art.length; i++) {
        var a = art[i];
        if (a.t === 'p') {
          c.beginPath();
          for (var j = 0; j < a.d.length; j += 2) {
            if (j === 0) c.moveTo(a.d[0], a.d[1]); else c.lineTo(a.d[j], a.d[j + 1]);
          }
          c.closePath(); c.fillStyle = a.f; c.fill();
        } else if (a.t === 'c') {
          c.beginPath(); c.arc(a.x, a.y, a.r, 0, Math.PI * 2); c.fillStyle = a.f; c.fill();
        } else if (a.t === 'r') {
          c.fillStyle = a.f; c.fillRect(a.x, a.y, a.w, a.h);
        } else if (a.t === 'l') {
          c.beginPath();
          for (var k = 0; k < a.d.length; k += 2) {
            if (k === 0) c.moveTo(a.d[0], a.d[1]); else c.lineTo(a.d[k], a.d[k + 1]);
          }
          c.strokeStyle = a.s; c.lineWidth = a.w; c.lineCap = 'round'; c.lineJoin = 'round';
          c.stroke();
        } else if (a.t === 'i') {
          var b = lv.box;
          var mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
          c.save();
          c.translate(mx, my); c.scale(a.k, a.k); c.translate(-mx, -my);
          shapePath(c, lv.shape);
          c.fillStyle = a.f; c.fill();
          c.restore();
        }
      }
    }

    function drawShapeIllustrated(c, boardShape, pose) {
      c.save();
      if (pose) {
        c.translate(pose.x, pose.y);
        c.rotate(pose.r);
        c.scale(pose.s, pose.s);
        c.translate(-pose.cx, -pose.cy);
      }

      c.save();
      shapePath(c, boardShape);
      c.clip();
      c.translate(fit.tx, fit.ty);
      c.scale(fit.k, fit.k);
      drawArt(c);
      c.restore();

      shapePath(c, boardShape);
      c.strokeStyle = lv.stroke;
      c.lineWidth = 2 / (pose ? pose.s : 1);
      c.lineJoin = 'round';
      c.stroke();
      c.restore();
    }

    function drawScale(c) {
      var t = tilt;
      var lx = PIVOT.x - BEAM_HALF * Math.cos(t), ly = PIVOT.y - BEAM_HALF * Math.sin(t);
      var rx = PIVOT.x + BEAM_HALF * Math.cos(t), ry = PIVOT.y + BEAM_HALF * Math.sin(t);

      c.fillStyle = pal.ink;
      c.beginPath();
      c.moveTo(PIVOT.x, PIVOT.y);
      c.lineTo(PIVOT.x - LW * 0.055, BASE_Y);
      c.lineTo(PIVOT.x + LW * 0.055, BASE_Y);
      c.closePath();
      c.fill();
      c.fillRect(PIVOT.x - LW * 0.13, BASE_Y, LW * 0.26, LH * 0.016);

      c.strokeStyle = pal.ink;
      c.lineCap = 'round';
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(rx, ry); c.stroke();

      c.beginPath(); c.arc(PIVOT.x, PIVOT.y, 5.5, 0, Math.PI * 2);
      c.fillStyle = pal.paper; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = pal.ink; c.stroke();

      // Pans hang plumb from the beam ends, whatever the beam is doing
      [[-1, lx, ly], [1, rx, ry]].forEach(function (e) {
        var ex = e[1], ey = e[2];
        var py = ey + STRING;
        c.strokeStyle = pal.ink; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - PAN_W * 0.42, py); c.stroke();
        c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + PAN_W * 0.42, py); c.stroke();

        c.beginPath();
        c.moveTo(ex - PAN_W / 2, py);
        c.quadraticCurveTo(ex, py + PAN_D * 2.1, ex + PAN_W / 2, py);
        c.closePath();
        c.fillStyle = 'rgba(35,31,32,0.10)';
        c.fill();
        c.strokeStyle = pal.ink; c.lineWidth = 3; c.stroke();
      });
    }

    function drawReadout(c) {
      // Nothing is said until the pieces are in the pans — the number is the
      // scale's verdict, so it arrives when the scale has them, not before.
      if (!result || phase === 'fall') {
        if (phase === 'ready' || phase === 'drag') {
          c.fillStyle = pal.muted;
          c.font = '600 ' + Math.round(LW * 0.038) + 'px DM Sans, system-ui, sans-serif';
          c.textAlign = 'center';
          c.fillText(opts.prompt(lv), LW / 2, READ_Y - LH * 0.012);
        }
        return;
      }
      c.textAlign = 'center';
      c.fillStyle = result.pass ? pal.good : pal.ink;
      c.font = '800 ' + Math.round(LW * 0.125) + 'px DM Sans, system-ui, sans-serif';
      c.fillText(fmtPct(result.pct) + '% off', LW / 2, READ_Y);

      c.font = '600 ' + Math.round(LW * 0.037) + 'px DM Sans, system-ui, sans-serif';
      c.fillStyle = result.pass ? pal.good : pal.muted;
      c.fillText(result.pass ? 'Nailed it — on to the next one'
                             : 'Within ' + PASS_PCT + '% clears the level',
                 LW / 2, READ_Y + LH * 0.033);

      var b = progress.best[level];
      if (b !== undefined) {
        c.font = '600 ' + Math.round(LW * 0.032) + 'px DM Sans, system-ui, sans-serif';
        c.fillStyle = pal.muted;
        c.fillText((result.newBest ? 'New best here: ' : 'Your best here: ') +
                   fmtPct(b) + '%', LW / 2, READ_Y + LH * 0.061);
      }
    }

    function drawCutLine(c) {
      if (!drag) return;
      var dx = drag.x1 - drag.x0, dy = drag.y1 - drag.y0;
      var len = Math.hypot(dx, dy);
      if (len < 1) return;
      var ux = dx / len, uy = dy / len;
      var far = LW + LH;

      c.save();
      c.setLineDash([9, 8]);
      c.lineWidth = 1.6;
      c.strokeStyle = 'rgba(228,87,46,0.38)';
      c.beginPath();
      c.moveTo(drag.x0 - ux * far, drag.y0 - uy * far);
      c.lineTo(drag.x0 + ux * far, drag.y0 + uy * far);
      c.stroke();

      c.lineWidth = 2.6;
      c.strokeStyle = pal.cut;
      c.beginPath(); c.moveTo(drag.x0, drag.y0); c.lineTo(drag.x1, drag.y1); c.stroke();
      c.restore();

      c.fillStyle = pal.cut;
      c.beginPath(); c.arc(drag.x0, drag.y0, 4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(drag.x1, drag.y1, 4, 0, Math.PI * 2); c.fill();
    }

    function render() {
      if (!ctx) return;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      ctx.fillStyle = pal.paper;
      ctx.fillRect(0, 0, LW, LH);
      if (!lv) return;

      if (shakeT > 0) ctx.translate(Math.sin(shakeT * 34) * shakeT * 7, 0);

      drawScale(ctx);

      if (!pieces) {
        drawShapeIllustrated(ctx, wholeCanvas, null);
        drawCutLine(ctx);
      } else {
        for (var i = 0; i < pieces.length; i++) {
          var p = pieces[i];
          var pose = piecePose(p);
          pose.cx = p.c0.x; pose.cy = p.c0.y;
          drawShapeIllustrated(ctx, p.shape, pose);
        }
      }

      drawReadout(ctx);
    }

    // ── Loop ────────────────────────────────────────────────────────────────
    var lastTs = 0;
    function frame(ts) {
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;

      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt * 4);

      if (phase === 'fall') {
        fallT += dt / 0.75;
        if (fallT >= 1) { fallT = 1; phase = 'weigh'; }
      } else if (phase === 'weigh') {
        tilt += (tiltTarget - tilt) * Math.min(1, dt * 5.5);
        if (Math.abs(tiltTarget - tilt) < 0.0015) { tilt = tiltTarget; settle(); }
      }

      render();
      requestAnimationFrame(frame);
    }

    function settle() {
      phase = 'result';
      // Read the old best before overwriting it, or every cut looks like a record
      var b = progress.best[level];
      result.newBest = (b !== undefined && result.pct < b);
      if (b === undefined || result.pct < b) progress.best[level] = result.pct;
      if (result.pass && level === progress.reached && level < LEVEL_COUNT) {
        progress.reached = level + 1;
      }
      saveProgress(progress);
      syncStats();
      showActions();
    }

    // ── Actions row ─────────────────────────────────────────────────────────
    function showActions() {
      if (!elActions) return;
      elActions.classList.remove('cut-hide');
      // Next Level only exists once the threshold is actually cleared — before
      // that there is nothing to advance to, and a greyed button implying one
      // would be worse than no button at all.
      var canAdvance = result && result.pass && level < LEVEL_COUNT;
      elNext.classList.toggle('cut-hide', !canAdvance);
    }

    function hideActions() {
      if (elActions) elActions.classList.add('cut-hide');
    }

    function getShareText() {
      if (!result) return '';
      return opts.shareText(lv, fmtPct(result.pct));
    }

    // ── Pointer ─────────────────────────────────────────────────────────────
    function boardPos(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * LW,
        y: (e.clientY - r.top) / r.height * LH,
      };
    }

    function onDown(e) {
      if (phase !== 'ready') return;
      e.preventDefault();
      var p = boardPos(e);
      drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      phase = 'drag';
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }

    function onMove(e) {
      if (phase !== 'drag') return;
      e.preventDefault();
      var p = boardPos(e);
      drag.x1 = p.x; drag.y1 = p.y;
    }

    function onUp(e) {
      if (phase !== 'drag') return;
      e.preventDefault();
      var p = boardPos(e);
      drag.x1 = p.x; drag.y1 = p.y;
      var d = drag;
      drag = null;
      phase = 'ready';
      tryCut(d.x0, d.y0, d.x1, d.y1);
    }

    // ── Sizing ──────────────────────────────────────────────────────────────
    function fitStage() {
      if (!wrap || !stage) return;
      var cs = window.getComputedStyle(wrap);
      var availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (availW <= 0 || availH <= 0) return;
      var s = Math.min(availW / LW, availH / LH);
      stage.style.width = Math.round(LW * s) + 'px';
      stage.style.height = Math.round(LH * s) + 'px';
    }

    // ── Dev sanity check ────────────────────────────────────────────────────
    // Area is the entire game, so the clipper is checked against the thing it
    // must never break: the two pieces have to add back up to the shape.
    function selfTest(samples) {
      samples = samples || 40;
      var worst = 0, failures = [];
      for (var i = 0; i < LEVELS.length; i++) {
        var L = LEVELS[i];
        var f = fitTransform(L);
        var s = mapShape(L.shape, f);
        var total = shapeArea(s);
        var b = bbox(s.outer);
        for (var j = 0; j < samples; j++) {
          var ang = (j / samples) * Math.PI;
          var cx = b.x0 + (b.x1 - b.x0) * (0.15 + 0.7 * ((j * 0.37) % 1));
          var cy = b.y0 + (b.y1 - b.y0) * (0.15 + 0.7 * ((j * 0.61) % 1));
          var R = LW + LH;
          var cut = cutShape(s, { x: cx - Math.cos(ang) * R, y: cy - Math.sin(ang) * R },
                                { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R });
          var sum = shapeArea(cut.a) + shapeArea(cut.b);
          var err = Math.abs(sum - total) / total * 100;
          if (err > worst) worst = err;
          if (err > 0.5) failures.push({ level: i + 1, name: L.name, err: err });
        }
      }
      return { worstErrorPct: worst, failures: failures, ok: failures.length === 0 };
    }

    // ── Init ────────────────────────────────────────────────────────────────
    wrap   = q('canvas-wrap');
    stage  = q('cut-stage');
    canvas = q('game-canvas');
    if (!canvas || !stage) return null;              // not a game page
    ctx = canvas.getContext('2d');

    elLevel   = q('val-level');
    elObject  = q('val-object');
    elBest    = q('val-best');
    elActions = q('cut-actions');
    elNext    = q('cut-next-btn');
    elAgain   = q('cut-again-btn');
    elShare   = q('cut-share-btn');
    elToast   = q('cut-toast');
    elStart   = q('cut-start');
    elPrev    = q('cut-prev');
    elNextLvl = q('cut-nextlvl');

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(LW * DPR);
    canvas.height = Math.round(LH * DPR);

    fitStage();
    window.addEventListener('resize', fitStage);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', function () {
      drag = null; if (phase === 'drag') phase = 'ready';
    });

    elAgain.addEventListener('click', function () { loadLevel(level); });
    elNext.addEventListener('click', function () { loadLevel(level + 1); });
    elShare.addEventListener('click', function () {
      if (typeof shareText === 'function') shareText(getShareText(), opts.shareTitle);
    });
    elPrev.addEventListener('click', function () { if (level > 1) loadLevel(level - 1); });
    elNextLvl.addEventListener('click', function () {
      if (level < progress.reached) loadLevel(level + 1);
    });

    var play = q('cut-play-btn');
    if (play) play.addEventListener('click', function () { elStart.classList.add('cut-hide'); });

    var help = q('help-btn');
    if (help && typeof openDirections === 'function') {
      help.addEventListener('click', function () { openDirections(opts.directions); });
    }

    loadLevel(progress.reached);
    requestAnimationFrame(frame);

    return {
      LEVELS: LEVELS, LEVEL_COUNT: LEVEL_COUNT, PASS_PCT: PASS_PCT,
      LW: LW, LH: LH, MOBILE: MOBILE,
      fitTransform: fitTransform, mapShape: mapShape,
      loadLevel: loadLevel, tryCut: tryCut, getShareText: getShareText, selfTest: selfTest,
      getState: function () {
        return { level: level, phase: phase, result: result, tilt: tilt, progress: progress };
      },
      resetProgress: function () {
        progress = { reached: 1, best: {} };
        saveProgress(progress);
        loadLevel(1);
      },
    };
  }

  global.CutEngine = {
    P: P, makeShape: makeShape, shapeArea: shapeArea, shapeCentroid: shapeCentroid,
    polyCentroid: polyCentroid, signedArea: signedArea, bbox: bbox,
    clipHalfPlane: clipHalfPlane, cutShape: cutShape, pctOff: pctOff,
    pointInShape: pointInShape, pointInRing: pointInRing,
    LW: LW, LH: LH, MOBILE: MOBILE,
    mount: mount,
  };

}(typeof window !== 'undefined' ? window : globalThis));
