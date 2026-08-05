/* ============================================================
   Top Cut — one straight cut, two pieces, as close to equal as you can.

   The whole game is an area comparison, so the geometry half is kept
   DOM-free and exact: Sutherland–Hodgman clipping against the infinite
   line through the drag, shoelace area on both outputs. Everything the
   player sees is a rendering of those numbers, never the other way round.
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
  // the result stay correct — no component splitting needed.
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

    return {
      a: half(1), b: half(-1),
      n: { x: nx, y: ny }, d: d,
      p0: p0, p1: p1,
    };
  }

  function pctOff(areaA, areaB) {
    var total = areaA + areaB;
    if (total <= 0) return 100;
    return Math.abs(areaA - areaB) / total * 100;
  }

  // ── Object library ─────────────────────────────────────────────────────────
  // Twenty-five hand-authored silhouettes, all drawn in the same 0–100 square
  // and fitted to the board at load. Ordered roughly easy to hard: the early
  // shapes are near-symmetrical, the late ones lopsided or holed, where the
  // eye has nothing straight to line the cut up against.
  //
  //   outer / holes  — point arrays, flat x,y pairs
  //   fill / stroke  — the silhouette's own colours
  //   art            — decoration drawn inside each piece's clip, so a cut
  //                    piece keeps the illustration it was cut out of
  //     p  polygon    { t:'p', f, d }
  //     c  circle     { t:'c', f, x, y, r }
  //     r  rect       { t:'r', f, x, y, w, h }
  //     l  polyline   { t:'l', s, w, d }
  //     i  inset copy { t:'i', f, k }  — the outer ring scaled about its centre

  var LEVELS = [
    { name: 'hot dog', fill: '#F0B36B', stroke: '#A9702F',
      outer: [2,46, 8,42, 12,41, 14,34, 22,30, 36,28, 50,27, 64,28, 78,30, 86,34,
              88,41, 92,42, 98,46, 98,54, 92,58, 88,59, 86,66, 78,70, 64,72, 50,73,
              36,72, 22,70, 14,66, 12,59, 8,58, 2,54],
      art: [
        { t:'p', f:'#C0472B', d:[1,45, 12,43, 28,41, 50,40, 72,41, 88,43, 99,45,
                                 99,55, 88,57, 72,59, 50,60, 28,59, 12,57, 1,55] },
        { t:'l', s:'#F5C518', w:3.4, d:[16,50, 26,45, 36,53, 46,45, 56,53, 66,45, 76,53, 86,47] },
      ] },

    { name: 'banana', fill: '#F2D24B', stroke: '#B9971F',
      outer: [14,74, 14,60, 19,46, 28,35, 40,27, 54,23, 68,24, 80,28, 89,35, 95,44,
              97,52, 93,56, 88,50, 82,42, 72,35, 60,32, 48,33, 38,38, 30,47, 26,58,
              26,70, 24,78, 18,80],
      art: [
        { t:'l', s:'#DDB92B', w:2.6, d:[22,72, 25,55, 33,42, 45,33, 60,29, 75,31, 88,39] },
        { t:'c', f:'#6B4A22', x:17, y:78, r:4 },
        { t:'c', f:'#6B4A22', x:95, y:52, r:3.4 },
      ] },

    { name: 'slice of pizza', fill: '#EFC169', stroke: '#B9852F',
      outer: [50,6, 60,22, 70,40, 80,58, 86,72, 88,79, 78,87, 64,91, 50,92, 36,91,
              22,87, 12,79, 14,72, 20,58, 30,40, 40,22],
      art: [
        { t:'p', f:'#D9A05B', d:[12,74, 88,74, 88,79, 78,87, 64,91, 50,92, 36,91, 22,87, 12,79] },
        { t:'c', f:'#B93A2B', x:50, y:36, r:6 },
        { t:'c', f:'#B93A2B', x:37, y:56, r:6 },
        { t:'c', f:'#B93A2B', x:63, y:57, r:6 },
        { t:'c', f:'#B93A2B', x:50, y:69, r:5.5 },
      ] },

    { name: 'croissant', fill: '#DFA860', stroke: '#9E6A2B',
      outer: [6,72, 5,62, 10,52, 18,44, 28,39, 40,36, 52,35, 64,36, 76,39, 86,45,
              93,54, 95,64, 94,72, 88,74, 84,66, 78,60, 70,56, 62,58, 54,54, 46,57,
              38,53, 30,56, 24,62, 18,68, 12,74],
      art: [
        { t:'l', s:'#AF7233', w:2.4, d:[26,58, 31,42] },
        { t:'l', s:'#AF7233', w:2.4, d:[40,55, 42,38] },
        { t:'l', s:'#AF7233', w:2.4, d:[54,54, 54,37] },
        { t:'l', s:'#AF7233', w:2.4, d:[68,57, 66,39] },
        { t:'l', s:'#AF7233', w:2.4, d:[82,64, 78,47] },
      ] },

    { name: 'popsicle', fill: '#5FC0E4', stroke: '#2A7E9F',
      outer: [34,10, 38,6, 50,5, 62,6, 66,10, 68,20, 68,44, 68,62, 66,68, 60,70,
              56,70, 56,95, 54,97, 46,97, 44,95, 44,70, 40,70, 34,68, 32,62, 32,44, 32,20],
      art: [
        { t:'r', f:'#D2A96A', x:44, y:66, w:12, h:33 },
        { t:'p', f:'rgba(255,255,255,0.34)', d:[37,16, 44,11, 44,62, 37,60] },
        { t:'p', f:'#E9578A', d:[32,12, 68,12, 68,26, 32,26] },
      ] },

    { name: 'cupcake', fill: '#F2A6C1', stroke: '#C06A8C',
      outer: [32,93, 24,58, 20,50, 22,40, 28,34, 26,26, 34,22, 36,14, 44,11, 50,5,
              57,11, 64,14, 67,22, 74,26, 73,34, 79,41, 80,50, 76,58, 68,93],
      art: [
        { t:'p', f:'#E07A5F', d:[24,58, 76,58, 68,94, 32,94] },
        { t:'l', s:'#B45B44', w:2, d:[38,58, 40,94] },
        { t:'l', s:'#B45B44', w:2, d:[50,58, 50,94] },
        { t:'l', s:'#B45B44', w:2, d:[62,58, 60,94] },
        { t:'c', f:'#FFF3B0', x:38, y:34, r:2.6 },
        { t:'c', f:'#8ED1C4', x:58, y:26, r:2.6 },
        { t:'c', f:'#8ED1C4', x:46, y:20, r:2.6 },
        { t:'c', f:'#FFF3B0', x:64, y:40, r:2.6 },
      ] },

    { name: 'ice cream cone', fill: '#F4A7B9', stroke: '#C0728A',
      outer: [50,96, 57,72, 63,52, 68,38, 77,36, 81,27, 76,17, 66,10, 53,7, 40,9,
              30,15, 25,25, 28,35, 32,38, 37,52, 43,72],
      art: [
        { t:'p', f:'#D9A05B', d:[29,38, 71,38, 50,98] },
        { t:'l', s:'#B5763A', w:1.8, d:[33,44, 62,60] },
        { t:'l', s:'#B5763A', w:1.8, d:[36,56, 57,72] },
        { t:'l', s:'#B5763A', w:1.8, d:[41,38, 62,86] },
        { t:'l', s:'#B5763A', w:1.8, d:[59,38, 43,86] },
        { t:'c', f:'#B93A2B', x:52, y:12, r:4.5 },
      ] },

    { name: 'cookie', fill: '#CE9455', stroke: '#8E5F27',
      outer: [50,10, 63,12, 74,18, 83,27, 88,39, 89,51, 86,63, 79,73, 69,81, 57,86,
              45,87, 33,84, 23,77, 15,67, 11,55, 11,43, 15,31, 23,21, 33,14, 42,11],
      art: [
        { t:'c', f:'#4A2C17', x:36, y:32, r:5 },
        { t:'c', f:'#4A2C17', x:62, y:28, r:4.4 },
        { t:'c', f:'#4A2C17', x:50, y:50, r:5.2 },
        { t:'c', f:'#4A2C17', x:28, y:56, r:4.6 },
        { t:'c', f:'#4A2C17', x:70, y:52, r:4.8 },
        { t:'c', f:'#4A2C17', x:42, y:73, r:4.4 },
        { t:'c', f:'#4A2C17', x:64, y:73, r:4 },
      ] },

    // The one shape with a hole. The clip runs on the inner ring as well, and
    // the hole's share of each piece is subtracted from that piece's area.
    { name: 'donut', fill: '#E8A0BE', stroke: '#B5718D',
      outer: [95.4,56.9, 92.2,67.4, 86.4,76.7, 78.5,84.2, 69.4,89.7, 59.3,93.2,
              48.7,94.6, 37.9,93.7, 27.5,89.9, 18.6,83.4, 11.8,74.8, 7.6,64.7,
              5.8,54.1, 6.4,43.4, 9,33.1, 13.8,23.4, 20.8,15.1, 29.9,8.8,
              40.3,5.2, 51.3,4.7, 62,6.9, 71.7,11.5, 80.2,17.8, 87.3,25.8,
              92.6,35.2, 95.5,45.8],
      holes: [[65.5,56.6, 62,61.2, 57.3,64.3, 52,66, 46.3,66.2, 40.8,64.2,
               36.5,60.2, 34.3,54.8, 34,49.2, 35.1,43.7, 37.8,38.7, 42.3,34.9,
               47.9,33.3, 53.7,34, 58.7,36.5, 62.9,40.3, 65.9,45.1, 66.9,50.9]],
      art: [
        { t:'r', f:'#F2EAD6', x:24, y:20, w:5, h:2.4 },
        { t:'r', f:'#8ED1C4', x:56, y:16, w:5, h:2.4 },
        { t:'r', f:'#FFF3B0', x:72, y:36, w:5, h:2.4 },
        { t:'r', f:'#8ED1C4', x:70, y:66, w:5, h:2.4 },
        { t:'r', f:'#F2EAD6', x:44, y:80, w:5, h:2.4 },
        { t:'r', f:'#FFF3B0', x:20, y:56, w:5, h:2.4 },
        { t:'r', f:'#8ED1C4', x:32, y:74, w:5, h:2.4 },
        { t:'r', f:'#F2EAD6', x:62, y:78, w:5, h:2.4 },
      ] },

    { name: 'slice of watermelon', fill: '#3E8948', stroke: '#255A2C',
      outer: [6,26, 28,26, 50,26, 72,26, 94,26, 93,36, 89,47, 83,57, 75,66, 65,74,
              54,80, 50,81, 46,80, 35,74, 25,66, 17,57, 11,47, 7,36],
      art: [
        { t:'p', f:'#EAF3E0', d:[11,26, 89,26, 88,34, 85,43, 79,52, 72,60, 63,67,
                                 53,73, 50,74, 47,73, 37,67, 28,60, 21,52, 15,43, 12,34] },
        { t:'p', f:'#E8455F', d:[15,26, 85,26, 84,34, 81,43, 76,51, 69,59, 61,65,
                                 52,70, 50,71, 48,70, 39,65, 31,59, 24,51, 19,43, 16,34] },
        { t:'c', f:'#2B1B12', x:34, y:40, r:2.6 },
        { t:'c', f:'#2B1B12', x:50, y:46, r:2.6 },
        { t:'c', f:'#2B1B12', x:66, y:40, r:2.6 },
        { t:'c', f:'#2B1B12', x:42, y:56, r:2.6 },
        { t:'c', f:'#2B1B12', x:58, y:56, r:2.6 },
      ] },

    { name: 'sandwich', fill: '#F0D9A8', stroke: '#B9954F',
      outer: [8,80, 12,72, 22,58, 32,44, 42,30, 50,18, 58,30, 68,44, 78,58, 88,72,
              92,80, 86,84, 70,85, 50,86, 30,85, 14,84],
      art: [
        { t:'p', f:'#F5C842', d:[15,68, 85,68, 86,74, 14,74] },
        { t:'p', f:'#D9483B', d:[20,59, 80,59, 81,65, 19,65] },
        { t:'p', f:'#6FA84B', d:[23,52, 29,47, 35,53, 41,47, 47,53, 53,47, 59,53,
                                 65,47, 71,53, 77,50, 79,57, 21,57] },
        { t:'l', s:'#B9954F', w:1.8, d:[10,79, 90,79] },
      ] },

    { name: 'avocado half', fill: '#3E5C22', stroke: '#284013',
      outer: [50,6, 56,8, 62,13, 66,20, 69,29, 72,39, 75,50, 76,61, 72,72, 65,81,
              55,87, 50,88, 45,87, 35,81, 28,72, 24,61, 25,50, 28,39, 31,29, 34,20,
              38,13, 44,8],
      art: [
        { t:'i', f:'#C9D96B', k:0.87 },
        { t:'c', f:'#8A5A2B', x:50, y:60, r:15 },
        { t:'c', f:'#A8763C', x:45, y:55, r:5 },
      ] },

    { name: 'wine bottle', fill: '#2E6B4F', stroke: '#173F2C',
      outer: [44,6, 56,6, 56,26, 58,32, 64,40, 68,50, 70,62, 70,88, 68,93, 62,95,
              38,95, 32,93, 30,88, 30,62, 32,50, 36,40, 42,32, 44,26],
      art: [
        { t:'r', f:'#B98A54', x:43, y:4, w:14, h:9 },
        { t:'r', f:'#F2EAD3', x:30, y:60, w:40, h:22 },
        { t:'l', s:'#8A2C3C', w:2.4, d:[33,66, 67,66] },
        { t:'l', s:'#8A2C3C', w:2.4, d:[33,72, 67,72] },
        { t:'p', f:'rgba(255,255,255,0.20)', d:[36,44, 40,37, 40,90, 36,90] },
      ] },

    { name: 'umbrella', fill: '#D9483B', stroke: '#8E2C24',
      outer: [8,54, 12,40, 20,28, 32,18, 44,12, 50,10, 56,12, 68,18, 80,28, 88,40,
              92,54, 82,46, 72,56, 62,46, 53,54, 53,78, 52,85, 47,89, 41,88, 37,83,
              38,78, 42,78, 42,83, 45,85, 48,83, 48,54, 39,46, 29,56, 19,46],
      art: [
        { t:'p', f:'#B23127', d:[50,10, 19,46, 29,56, 39,46] },
        { t:'p', f:'#B23127', d:[50,10, 62,46, 72,56, 82,46] },
        { t:'p', f:'#7B4A22', d:[48,50, 53,50, 53,78, 52,85, 47,89, 41,88, 37,83,
                                 38,78, 42,78, 42,83, 45,85, 48,83] },
      ] },

    { name: 'guitar', fill: '#B5651D', stroke: '#6E3B10',
      outer: [43,3, 57,3, 57,12, 55,14, 55,36, 63,39, 71,44, 76,51, 77,58, 72,64,
              79,70, 84,79, 83,89, 75,96, 63,99, 50,100, 37,99, 25,96, 17,89, 16,79,
              21,70, 28,64, 23,58, 24,51, 29,44, 37,39, 45,36, 45,14, 43,12],
      art: [
        { t:'r', f:'#3B2412', x:45, y:2, w:10, h:38 },
        { t:'r', f:'#D8C9A8', x:45, y:8, w:10, h:1.6 },
        { t:'r', f:'#D8C9A8', x:45, y:18, w:10, h:1.6 },
        { t:'r', f:'#D8C9A8', x:45, y:28, w:10, h:1.6 },
        { t:'c', f:'#2B1B12', x:50, y:64, r:10 },
        { t:'r', f:'#3B2412', x:41, y:83, w:18, h:5 },
      ] },

    { name: 'cactus', fill: '#5A9A4E', stroke: '#33612C',
      outer: [34,97, 30,80, 24,80, 24,73, 42,73, 42,58, 34,57, 27,53, 23,46, 23,34,
              27,31, 31,34, 31,45, 34,50, 42,51, 42,26, 44,21, 50,19, 56,21, 58,26,
              58,42, 65,41, 72,44, 77,50, 79,58, 79,68, 75,71, 71,68, 71,57, 68,52,
              58,51, 58,73, 76,73, 76,80, 70,80, 66,97],
      art: [
        { t:'p', f:'#C1664A', d:[24,73, 76,73, 76,80.5, 70,80.5, 66,98, 34,98, 30,80.5, 24,80.5] },
        { t:'l', s:'#417A38', w:1.8, d:[47,24, 47,72] },
        { t:'l', s:'#417A38', w:1.8, d:[53,24, 53,72] },
        { t:'l', s:'#417A38', w:1.8, d:[27,37, 27,48] },
        { t:'l', s:'#417A38', w:1.8, d:[75,54, 75,65] },
        { t:'c', f:'#E86A92', x:50, y:20, r:5 },
      ] },

    { name: 'sneaker', fill: '#2E6B8F', stroke: '#1B4159',
      outer: [6,74, 8,64, 14,56, 24,50, 34,46, 42,42, 50,36, 56,30, 60,26, 66,26,
              70,30, 72,40, 74,50, 78,54, 84,56, 88,60, 90,66, 90,74, 86,80, 74,82,
              50,82, 26,82, 12,80],
      art: [
        { t:'p', f:'#F2EFE9', d:[5,72, 91,72, 91,75, 86,81, 74,83, 50,83, 26,83, 12,81, 5,75] },
        { t:'p', f:'#F2EFE9', d:[20,74, 40,60, 58,49, 67,45, 65,53, 45,66, 27,78] },
        { t:'l', s:'#F2EFE9', w:2.2, d:[34,49, 44,56] },
        { t:'l', s:'#F2EFE9', w:2.2, d:[42,44, 52,51] },
        { t:'l', s:'#F2EFE9', w:2.2, d:[50,38, 59,45] },
      ] },

    { name: 'boot', fill: '#8B4A2B', stroke: '#4F2712',
      outer: [30,8, 58,8, 61,22, 61,40, 62,54, 64,62, 70,66, 78,69, 86,73, 91,79,
              92,86, 88,91, 34,92, 28,90, 26,80, 26,60, 26,40, 27,24],
      art: [
        { t:'p', f:'#2B1B12', d:[26,84, 92,84, 92,87, 88,92, 34,93, 28,91, 26,88] },
        { t:'r', f:'#A6602F', x:26, y:7, w:36, h:11 },
        { t:'l', s:'#E0C9A6', w:1.8, d:[29,24, 60,24] },
        { t:'l', s:'#E0C9A6', w:1.8, d:[62,60, 78,68] },
      ] },

    // Open jaw one end, box end the other — the ring is a genuine hole, so the
    // clipper has to account for it on whichever side of the cut it lands.
    { name: 'wrench', fill: '#A8B0BC', stroke: '#5B6472',
      outer: [4,28, 14,29, 20,34, 26,40, 30,44, 46,43, 62,44, 70,42, 78,38, 86,37,
              93,42, 97,50, 93,60, 86,64, 78,63, 70,58, 62,56, 46,57, 30,56, 26,60,
              20,66, 14,71, 4,72, 4,64, 13,62, 17,56, 15,50, 17,44, 13,38, 4,36],
      holes: [[90.5,50, 89.5,53.8, 86.8,56.5, 83,57.5, 79.3,56.5, 76.5,53.8,
               75.5,50, 76.5,46.3, 79.3,43.5, 83,42.5, 86.8,43.5, 89.5,46.3]],
      art: [
        { t:'p', f:'#D6DCE4', d:[30,45.5, 62,45.5, 62,48.5, 30,48.5] },
        { t:'p', f:'#8C95A3', d:[4,64, 13,62, 17,56, 15,50, 17,44, 13,38, 4,36,
                                 4,40, 10,42, 12,50, 10,58, 4,60] },
        { t:'l', s:'#8C95A3', w:2, d:[76,40, 72,50, 76,61] },
      ] },

    { name: 'fish', fill: '#4E97D1', stroke: '#2A6394',
      outer: [6,30, 18,44, 25,48, 34,37, 46,31, 50,30, 55,19, 61,24, 66,29, 76,33,
              85,41, 90,50, 85,60, 76,67, 66,71, 58,72, 52,68, 48,71, 38,66, 28,56,
              25,52, 18,56, 6,70, 12,50],
      art: [
        { t:'p', f:'#BFE0F5', d:[28,58, 44,66, 62,68, 78,64, 88,56, 90,62, 78,70, 58,74, 38,68, 26,56] },
        { t:'p', f:'#2A6394', d:[45,52, 62,55, 51,65] },
        { t:'l', s:'#2A6394', w:2.4, d:[72,34, 68,45, 72,59] },
        { t:'c', f:'#1B2B3A', x:81, y:44, r:3.4 },
      ] },

    { name: 'snail', fill: '#A9C48A', stroke: '#63804A',
      outer: [8,86, 10,76, 16,70, 24,66, 28,60, 24,52, 20,44, 17,36, 15,30, 19,31,
              21,38, 24,46, 28,54, 30,48, 30,40, 31,32, 35,32, 34,42, 34,52, 36,58,
              44,54, 36,44, 34,34, 40,24, 50,16, 62,14, 74,17, 84,25, 88,37, 86,50,
              78,62, 66,70, 54,74, 40,80, 24,84],
      art: [
        { t:'c', f:'#C88B4A', x:60, y:42, r:27 },
        { t:'l', s:'#8A5A28', w:3, d:[60,42, 66,41, 69,46, 66,53, 58,57, 48,53, 44,42,
                                      50,30, 62,26, 74,30, 82,42, 79,54] },
        { t:'c', f:'#2B1B12', x:17, y:33, r:2.4 },
        { t:'c', f:'#2B1B12', x:32, y:34, r:2.4 },
      ] },

    { name: 'toy train', fill: '#C0392B', stroke: '#7B2318',
      outer: [8,74, 8,44, 15,44, 15,25, 27,25, 27,44, 47,44, 47,18, 87,18, 87,76,
              78,76, 76,84, 68,87, 61,84, 59,76, 48,76, 46,84, 38,87, 31,84, 29,76,
              21,76, 19,84, 13,87, 9,82],
      art: [
        { t:'p', f:'#2E5E8F', d:[47,18, 87,18, 87,76, 47,76] },
        { t:'r', f:'#BFE0F5', x:56, y:26, w:22, h:16 },
        { t:'r', f:'#2B2B2B', x:14, y:24, w:14, h:9 },
        { t:'c', f:'#2B2B2B', x:14, y:79, r:8 },
        { t:'c', f:'#2B2B2B', x:38, y:79, r:9 },
        { t:'c', f:'#2B2B2B', x:69, y:79, r:9 },
        { t:'c', f:'#8A8A8A', x:14, y:79, r:3 },
        { t:'c', f:'#8A8A8A', x:38, y:79, r:3.4 },
        { t:'c', f:'#8A8A8A', x:69, y:79, r:3.4 },
      ] },

    { name: 'T-bone steak', fill: '#EBDBB2', stroke: '#8E7A4C',
      outer: [22,22, 34,14, 48,11, 62,12, 74,18, 83,27, 88,38, 89,50, 85,62, 78,73,
              68,82, 56,87, 44,88, 32,84, 23,77, 16,67, 12,55, 11,43, 13,32],
      art: [
        { t:'i', f:'#A6362E', k:0.9 },
        { t:'p', f:'#EFE6CF', d:[33,18, 40,18, 40,86, 33,86] },
        { t:'p', f:'#EFE6CF', d:[16,45, 40,45, 40,53, 16,53] },
        { t:'l', s:'#C9705F', w:2, d:[52,24, 60,34, 56,46] },
        { t:'l', s:'#C9705F', w:2, d:[66,52, 74,60, 70,72] },
      ] },

    { name: 'dinosaur', fill: '#6A994E', stroke: '#3B5A28',
      outer: [4,30, 4,38, 14,42, 22,42, 26,48, 30,56, 34,56, 40,62, 38,66, 32,62,
              30,58, 34,70, 40,78, 44,86, 40,94, 52,94, 54,86, 58,78, 66,74, 78,72,
              88,72, 96,74, 88,66, 76,62, 66,54, 56,46, 46,40, 38,34, 34,26, 30,20,
              22,18, 12,20, 6,24],
      art: [
        { t:'p', f:'#BFCE8E', d:[24,46, 30,58, 34,70, 42,80, 46,88, 40,94, 52,94,
                                 54,86, 50,76, 42,66, 34,54, 30,44] },
        { t:'c', f:'#1B2B12', x:17, y:27, r:2.6 },
        { t:'l', s:'#F2EAD6', w:1.8, d:[6,36, 10,39, 14,36, 18,40, 22,37] },
        { t:'c', f:'#4F7A38', x:56, y:50, r:4 },
        { t:'c', f:'#4F7A38', x:72, y:64, r:3.4 },
      ] },

    // Three holes and a boundary that turns back on itself twice — the eye has
    // nothing straight to line a cut up against, which is the whole point.
    { name: 'pretzel', fill: '#B5762F', stroke: '#71460F',
      outer: [50,26, 44,16, 34,10, 22,10, 12,16, 6,26, 6,38, 12,50, 22,62, 32,72,
              40,80, 50,84, 60,80, 68,72, 78,62, 88,50, 94,38, 94,26, 88,16, 78,10,
              66,10, 56,16],
      holes: [
        [38.8,32.2, 36.8,36.6, 33,39.8, 28.3,41, 23.5,40, 19.6,37.1,
         17.3,32.7, 17.2,27.8, 19.2,23.4, 23,20.2, 27.7,19, 32.5,20,
         36.4,22.9, 38.7,27.3],
        [82.8,32.2, 80.8,36.6, 77,39.8, 72.3,41, 67.5,40, 63.6,37.1,
         61.3,32.7, 61.2,27.8, 63.2,23.4, 67,20.2, 71.7,19, 76.5,20,
         80.4,22.9, 82.7,27.3],
        [61.4,60.2, 57.6,64.6, 52.2,66.8, 46.5,66.5, 41.4,63.7, 38,59,
         37,53.3, 38.6,47.8, 42.4,43.4, 47.8,41.2, 53.5,41.5, 58.6,44.3,
         62,49, 63,54.7],
      ],
      art: [
        { t:'c', f:'#F5F0E8', x:26, y:14, r:1.8 },
        { t:'c', f:'#F5F0E8', x:48, y:22, r:1.8 },
        { t:'c', f:'#F5F0E8', x:74, y:14, r:1.8 },
        { t:'c', f:'#F5F0E8', x:12, y:34, r:1.8 },
        { t:'c', f:'#F5F0E8', x:88, y:34, r:1.8 },
        { t:'c', f:'#F5F0E8', x:34, y:70, r:1.8 },
        { t:'c', f:'#F5F0E8', x:66, y:70, r:1.8 },
        { t:'c', f:'#F5F0E8', x:50, y:78, r:1.8 },
      ] },
  ];

  LEVELS.forEach(function (lv) {
    lv.shape = makeShape(P(lv.outer), (lv.holes || []).map(P));
    lv.box = bbox(lv.shape.outer);
    lv.area = shapeArea(lv.shape);
  });

  var LEVEL_COUNT = LEVELS.length;
  var PASS_PCT = 5;

  // ── Board layout — one mobile size, one desktop size, chosen once ──────────
  // innerWidth can still be 0 in a frame that has not been laid out when the
  // script runs, which would silently hand a desktop the phone board.
  var VIEW_W = (typeof window !== 'undefined' &&
                (window.innerWidth || document.documentElement.clientWidth ||
                 (window.screen && window.screen.width))) || 1024;
  var MOBILE = VIEW_W < 640;

  var LW = MOBILE ? 380 : 460;
  var LH = MOBILE ? 640 : 720;

  // Vertical bands, as fractions of the board. The object gets the top half,
  // the readout the strip under it, the scale the bottom third — so the beam
  // is never covered by the number it is illustrating.
  var OBJ_BOX   = { x: LW * 0.08, y: LH * 0.04, w: LW * 0.84, h: LH * 0.41 };
  var READ_Y    = LH * 0.485;
  var PIVOT     = { x: LW / 2, y: LH * 0.655 };
  var BEAM_HALF = LW * 0.32;
  var STRING    = LH * 0.07;
  var PAN_W     = LW * 0.34;
  var PAN_D     = LH * 0.046;
  var BASE_Y    = LH * 0.87;
  var MAX_TILT  = 13 * Math.PI / 180;

  var INK    = '#231f20';
  var PAPER  = '#F5F0E8';
  var CUT    = '#E4572E';
  var MUTED  = '#8A8073';
  var GOOD   = '#2E7D4F';

  var MIN_DRAG = 26;          // board units — a tap is not a cut
  var MIN_PIECE = 0.004;      // a piece under 0.4% of the object is a miss

  // The pan-side of a cut is decided by comparing the two centroids to each
  // other, not to the board: a near-horizontal cut has both centroids at the
  // same x, and only their order says which piece is the left one.
  function fitTransform(lv) {
    var b = lv.box;
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

  // ── Progress ──────────────────────────────────────────────────────────────
  // Storage can throw (private mode, quota) and anything could be sitting under
  // the key, so a bad reading is treated as a fresh start rather than poisoning
  // the level gate.
  var STORE_KEY = 'topcut_progress';

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

  // ── Game state ────────────────────────────────────────────────────────────
  var progress = loadProgress();
  var level = 1;              // 1-based
  var phase = 'splash';       // splash | ready | drag | fall | weigh | result
  var lv = null;
  var fit = null;
  var wholeCanvas = null;     // the level's shape in board coordinates

  var drag = null;            // { x0, y0, x1, y1 }
  var pieces = null;          // [{ shape, area, side, … }]
  var result = null;          // { pct, pass, areaL, areaR }
  var tilt = 0, tiltTarget = 0;
  var fallT = 0;              // 0..1
  var shakeT = 0;

  var canvas, ctx, stage, wrap;
  var elLevel, elObject, elBest, elActions, elNext, elAgain, elShare, elToast, elStart;
  var elPrev, elNextLvl;
  var DPR = 1;

  var SHARE_URL = 'https://www.thebunnygame.com/topcut';

  var DIRECTIONS_TEXT =
    'An object sits at the top of the board. Drag one straight line across it — ' +
    'start outside the object, finish outside the other side — and on release it ' +
    'splits along that line. The two pieces drop into the pans of a balance, and ' +
    'the beam tilts toward whichever piece has more area. Your score is how far ' +
    'off equal you were: cut within 5% and the next object unlocks. There is no ' +
    'attempt limit — every level stays open to replay, and your best cut on each ' +
    'one is kept.';

  // ── Level setup ───────────────────────────────────────────────────────────
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

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtPct(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  // ── The cut ───────────────────────────────────────────────────────────────
  function tryCut(x0, y0, x1, y1) {
    if (Math.hypot(x1 - x0, y1 - y0) < MIN_DRAG) return toast('Drag a longer line.');
    if (pointInShape(wholeCanvas, x0, y0) || pointInShape(wholeCanvas, x1, y1)) {
      return toast('Start and finish outside the object.');
    }

    var cut = cutShape(wholeCanvas, { x: x0, y: y0 }, { x: x1, y: y1 });
    if (!cut) return toast('Drag a longer line.');

    var aA = shapeArea(cut.a), aB = shapeArea(cut.b);
    var total = aA + aB;
    if (total <= 0 || Math.min(aA, aB) / total < MIN_PIECE) {
      return toast('That line missed the object.');
    }

    var cA = shapeCentroid(cut.a), cB = shapeCentroid(cut.b);
    var leftIsA = cA.x <= cB.x;

    var pL = makePiece(leftIsA ? cut.a : cut.b, leftIsA ? aA : aB, -1);
    var pR = makePiece(leftIsA ? cut.b : cut.a, leftIsA ? aB : aA, 1);
    pieces = [pL, pR];

    result = {
      pct: pctOff(pL.area, pR.area),
      areaL: pL.area, areaR: pR.area,
    };
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
    // half an object each and a pan is barely a third of the board wide.
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

  // ── Toast ─────────────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg) {
    shakeT = 1;
    if (!elToast) return false;
    elToast.textContent = msg;
    elToast.classList.add('tc-toast-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { elToast.classList.remove('tc-toast-on'); }, 1800);
    return false;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
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

  function drawArt(c) {
    // Runs in object coordinates, inside the piece's clip.
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
        // The silhouette again, scaled about its own centre — a rind, a rim of
        // fat, a skin: the things that follow the outline rather than cross it.
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

    // Column and base
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(PIVOT.x, PIVOT.y);
    c.lineTo(PIVOT.x - LW * 0.055, BASE_Y);
    c.lineTo(PIVOT.x + LW * 0.055, BASE_Y);
    c.closePath();
    c.fill();
    c.fillRect(PIVOT.x - LW * 0.13, BASE_Y, LW * 0.26, LH * 0.016);

    // Beam
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(rx, ry); c.stroke();

    // Pivot pin
    c.beginPath(); c.arc(PIVOT.x, PIVOT.y, 5.5, 0, Math.PI * 2);
    c.fillStyle = PAPER; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();

    // Pans hang plumb from the beam ends, whatever the beam is doing
    [[-1, lx, ly], [1, rx, ry]].forEach(function (e) {
      var ex = e[1], ey = e[2];
      var py = ey + STRING;
      c.strokeStyle = INK; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - PAN_W * 0.42, py); c.stroke();
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + PAN_W * 0.42, py); c.stroke();

      c.beginPath();
      c.moveTo(ex - PAN_W / 2, py);
      c.quadraticCurveTo(ex, py + PAN_D * 2.1, ex + PAN_W / 2, py);
      c.closePath();
      c.fillStyle = 'rgba(35,31,32,0.10)';
      c.fill();
      c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    });
  }

  function drawReadout(c) {
    // Nothing is said until the pieces are in the pans — the number is the
    // scale's verdict, so it arrives when the scale has them, not before.
    if (!result || phase === 'fall') {
      if (phase === 'ready' || phase === 'drag') {
        c.fillStyle = MUTED;
        c.font = '600 ' + Math.round(LW * 0.038) + 'px DM Sans, system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText('Drag a straight cut across the ' + lv.name, LW / 2, READ_Y - LH * 0.012);
      }
      return;
    }
    c.textAlign = 'center';
    c.fillStyle = result.pass ? GOOD : INK;
    c.font = '800 ' + Math.round(LW * 0.125) + 'px DM Sans, system-ui, sans-serif';
    c.fillText(fmtPct(result.pct) + '% off', LW / 2, READ_Y);

    c.font = '600 ' + Math.round(LW * 0.037) + 'px DM Sans, system-ui, sans-serif';
    c.fillStyle = result.pass ? GOOD : MUTED;
    c.fillText(result.pass ? 'Nailed it — on to the next one'
                           : 'Within 5% clears the level',
               LW / 2, READ_Y + LH * 0.033);

    var b = progress.best[level];
    if (b !== undefined) {
      c.font = '600 ' + Math.round(LW * 0.032) + 'px DM Sans, system-ui, sans-serif';
      c.fillStyle = MUTED;
      c.fillText((result.newBest ? 'New best on this object: ' : 'Your best on this object: ') +
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
    c.strokeStyle = CUT;
    c.beginPath(); c.moveTo(drag.x0, drag.y0); c.lineTo(drag.x1, drag.y1); c.stroke();
    c.restore();

    c.fillStyle = CUT;
    c.beginPath(); c.arc(drag.x0, drag.y0, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(drag.x1, drag.y1, 4, 0, Math.PI * 2); c.fill();
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, LW, LH);
    if (!lv) return;

    if (shakeT > 0) {
      ctx.translate(Math.sin(shakeT * 34) * shakeT * 7, 0);
    }

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

  // ── Loop ──────────────────────────────────────────────────────────────────
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

  // ── Actions row ───────────────────────────────────────────────────────────
  function showActions() {
    if (!elActions) return;
    elActions.classList.remove('tc-hide');
    // Next Level only exists once the threshold is actually cleared — before
    // that there is nothing to advance to, and a greyed button implying one
    // would be worse than no button at all.
    var canAdvance = result && result.pass && level < LEVEL_COUNT;
    elNext.classList.toggle('tc-hide', !canAdvance);
  }

  function hideActions() {
    if (elActions) elActions.classList.add('tc-hide');
  }

  function getShareText() {
    if (!result) return '';
    return 'I cut the ' + lv.name + ' ' + fmtPct(result.pct) +
           '% off on Top Cut 🔪 — think you can beat it? ' + SHARE_URL;
  }

  // ── Pointer ───────────────────────────────────────────────────────────────
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

  // ── Sizing ────────────────────────────────────────────────────────────────
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

  // ── Init ──────────────────────────────────────────────────────────────────
  function q(id) { return document.getElementById(id); }

  function init() {
    wrap   = q('canvas-wrap');
    stage  = q('tc-stage');
    canvas = q('game-canvas');
    if (!canvas || !stage) return;              // not the game page
    ctx = canvas.getContext('2d');

    elLevel   = q('val-level');
    elObject  = q('val-object');
    elBest    = q('val-best');
    elActions = q('tc-actions');
    elNext    = q('tc-next-btn');
    elAgain   = q('tc-again-btn');
    elShare   = q('tc-share-btn');
    elToast   = q('tc-toast');
    elStart   = q('tc-start');
    elPrev    = q('tc-prev');
    elNextLvl = q('tc-nextlvl');

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(LW * DPR);
    canvas.height = Math.round(LH * DPR);

    fitStage();
    window.addEventListener('resize', fitStage);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', function () { drag = null; if (phase === 'drag') phase = 'ready'; });

    elAgain.addEventListener('click', function () { loadLevel(level); });
    elNext.addEventListener('click', function () { loadLevel(level + 1); });
    elShare.addEventListener('click', function () {
      if (typeof shareText === 'function') shareText(getShareText(), 'Top Cut');
    });
    elPrev.addEventListener('click', function () { if (level > 1) loadLevel(level - 1); });
    elNextLvl.addEventListener('click', function () {
      if (level < progress.reached) loadLevel(level + 1);
    });

    var play = q('tc-play-btn');
    if (play) play.addEventListener('click', function () { elStart.classList.add('tc-hide'); });

    var help = q('help-btn');
    if (help && typeof openDirections === 'function') {
      help.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    loadLevel(progress.reached);
    requestAnimationFrame(frame);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  // ── Dev sanity check ──────────────────────────────────────────────────────
  // Area is the entire game, so the clipper is checked against the thing it
  // must never break: the two pieces have to add back up to the object.
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

  global.TopCut = {
    // geometry
    P: P, makeShape: makeShape, shapeArea: shapeArea, shapeCentroid: shapeCentroid,
    clipHalfPlane: clipHalfPlane, cutShape: cutShape, pctOff: pctOff,
    pointInShape: pointInShape, fitTransform: fitTransform, mapShape: mapShape,
    LEVELS: LEVELS, LEVEL_COUNT: LEVEL_COUNT, PASS_PCT: PASS_PCT,
    LW: LW, LH: LH, MOBILE: MOBILE,
    // controller, exposed for verification
    loadLevel: loadLevel, tryCut: tryCut, getShareText: getShareText,
    selfTest: selfTest,
    getState: function () {
      return { level: level, phase: phase, result: result, tilt: tilt, progress: progress };
    },
    resetProgress: function () {
      progress = { reached: 1, best: {} };
      saveProgress(progress);
      loadLevel(1);
    },
  };

}(typeof window !== 'undefined' ? window : globalThis));
