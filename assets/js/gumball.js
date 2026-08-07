// gumball.js — Gumball
//
// A bubble shooter with one thing in it that is not a bubble.
//
// The mass hangs off the ceiling: a staggered hex grid packed against the top
// of the board, about half its height. Gumballs are sticky — they attach where
// they land, three or more of a colour pop, and anything left with no chain of
// gumballs back to the ceiling falls off the board.
//
// The marble is none of that. It never matches, it never pops, and it is not
// sticky: nothing hangs off it, and it carries no support back to the ceiling.
// It is sitting in a hole, held up only by the gumballs packed around it.
// Empty all six of those cells and it has nothing left to rest on, so it falls
// out of the bottom of the board. That is the level.
//
// Because the marble conducts no support, the ring of six cells around it is
// held on only by its own connections up to the ceiling — cut the last one and
// the whole ring drops at once and the marble goes with it. The level is a
// digging problem, not a clearing problem.

(function () {
  'use strict';

  var DIRECTIONS_TEXT =
    'One marble is buried in the gumballs — the grey one. It is the whole level. ' +
    'Move the mouse, or drag a finger, to aim, then click or let go to fire. ' +
    'Gumballs stick where they land. Three or more of one colour together pop, and ' +
    'any gumball left with no chain back to the ceiling has nothing holding it up, so ' +
    'it falls too — and it pays double. ' +
    'The marble plays by none of those rules. It never matches and it never pops. ' +
    'It is not sticky either: nothing sticks to it, and it passes no support along, ' +
    'so a gumball whose only neighbour is the marble is holding on to nothing and drops ' +
    'straight back out. ' +
    'All that keeps the marble up there is the six gumballs around it. Empty every one ' +
    'of those cells and it falls off the board, which clears the level. ' +
    'Shots bank off the side walls to reach the back of a pocket. Every few shots the ' +
    'machine feeds itself — more gumballs fly in and stick to the underside of the mass, ' +
    'never next to the marble, but everywhere else. Run out of shots, or let the mass ' +
    'grow down past the red line, and the run is over.';

  // ── Tunables ──────────────────────────────────────────────────────────────

  var MIN_MATCH     = 3;

  var GRAVITY       = 900;    // px/sec² on anything that falls
  var POP_MS        = 320;
  var FALL_MS       = 1000;
  var FLOAT_MS      = 900;
  var LEVEL_HOLD    = 1700;   // ms the level-clear card sits before the next board

  var PTS_MATCH     = 10;     // per gumball in a direct match
  var PTS_GROUP     = 5;      // per gumball beyond the third
  var PTS_DROP      = 25;     // per gumball that falls off the mass
  var PTS_LEVEL     = 250;    // for freeing the marble
  var PTS_SPARE     = 25;     // per unused shot

  // Primary colours, and only three of them. Matching is meant to be the easy
  // half of this game — the hard half is choosing which three to take out.
  var COLORS = ['#ef4444', '#facc15', '#3b82f6'];

  var TAU = Math.PI * 2;
  var SQ3_2 = Math.sqrt(3) / 2;
  var AIM_MARGIN = 0.14;      // radians of dead zone either side of horizontal

  // ── Layout — one mobile size, one desktop size, chosen once ───────────────

  // innerWidth can still be 0 in an embedded frame that has not been laid out
  // when the script runs, which would silently hand a desktop the phone board.
  var VIEW_W = window.innerWidth || document.documentElement.clientWidth ||
               (window.screen && window.screen.width) || 1024;
  var MOBILE = VIEW_W < 640;
  var LW = MOBILE ? 430 : 560;
  var LH = MOBILE ? 650 : 720;
  var R  = MOBILE ? 15  : 17;     // gumball radius
  var SP = R * 2;                 // hex spacing — touching gumballs

  // Staggered rows, the classic packing: even rows are full width, odd rows are
  // one shorter and sit half a gumball to the right.
  var COLS  = Math.floor(LW / SP);
  var X0    = (LW - COLS * SP) / 2;
  var Y0    = 4;
  var ROW_H = SP * SQ3_2;

  // Twelve rows is the board: it comes down to almost exactly half the height
  // on both sizes, which is the shape the game is meant to open on.
  var ROWS = 12;

  var SPEED = R * 34;             // projectile speed, px/sec
  var FEED_SPEED = R * 19;        // fed gumballs drift in slower than a shot

  var SHOOTER_X = LW / 2;
  var SHOOTER_Y = LH - 54;

  // The mass must not grow past here. Measured against the bottom of the lowest
  // gumball, so the warning arrives when the mass is genuinely low rather than
  // when some cell's centre crosses an invisible line.
  var DEATH_Y = SHOOTER_Y - R * 4.2;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ── Grid helpers ──────────────────────────────────────────────────────────

  // Odd-r offset layout. Neighbour tables differ by row parity, which is the
  // one thing about a staggered grid that has to be got right — everything
  // else in the game is built on "who touches whom".
  var NB_EVEN = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  var NB_ODD  = [[0, -1], [0, 1], [-1,  0], [-1, 1], [1,  0], [1, 1]];

  function nbTable(row) { return (row & 1) ? NB_ODD : NB_EVEN; }

  function key(row, col) { return row + ',' + col; }
  function rowCols(row)  { return (row & 1) ? COLS - 1 : COLS; }
  function inGrid(row, col) { return row >= 0 && col >= 0 && col < rowCols(row); }

  function cellX(row, col) { return X0 + R + col * SP + ((row & 1) ? R : 0); }
  function cellY(row)      { return Y0 + R + row * ROW_H; }

  function rowAt(y)      { return Math.round((y - Y0 - R) / ROW_H); }
  function colAt(row, x) { return Math.round((x - X0 - R - ((row & 1) ? R : 0)) / SP); }

  // ── State ─────────────────────────────────────────────────────────────────

  var bubbles = new Map();    // "row,col" → { row, col, x, y, color } — gumballs only
  var marble = null;          // { row, col, x, y } — never in `bubbles`
  var marbleFall = null;      // the marble on its way off the board

  var shot = null;            // in-flight projectile
  var queue = [];             // [current, next] colours
  var feedAnnounced = false;

  var level = 1, spec = null;
  var score = 0, shotsUsed = 0, totalShots = 0, matched = 0, dropped = 0;
  var best = 0;
  var running = false, ended = false, resolved = false;
  var levelClearing = false, levelHold = 0;

  var aim = -Math.PI / 2;     // straight up
  var pointerDown = false;

  var feeders = [];           // gumballs flying in from off-screen
  var pops = [], falls = [], floats = [];
  var lowestY = 0;            // bottom edge of the lowest thing in the mass
  var lastTime = null, raf = null;

  // ── DOM ───────────────────────────────────────────────────────────────────

  var canvas, ctx, wrap;
  var elLevel, elScore, elShots, elBest;
  var startEl, toastEl, clearEl, clearTitleEl, clearSubEl;
  var overlayEl, titleEl, modalScoreEl, modalSubEl, breakdownEl, bannerEl;

  // ── Small helpers ─────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    } else {
      r *= (1 + amt); g *= (1 + amt); b *= (1 + amt);
    }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  // The marble is not in `bubbles`, so every "is this cell taken" test has to
  // ask about it separately. Everything that fills a cell goes through here;
  // everything about support and matching deliberately does not.
  function isMarbleCell(row, col) { return !!marble && marble.row === row && marble.col === col; }
  function occupied(row, col) { return bubbles.has(key(row, col)) || isMarbleCell(row, col); }

  // ── Sprites — a couple of hundred radial gradients a frame is not worth
  //    paying for ──────────────────────────────────────────────────────────

  var sprites = {};
  var marbleSprite = null;
  var SPRITE_BOX = 0;

  function buildSprites() {
    SPRITE_BOX = R * 2 + 4;
    var px = Math.ceil(SPRITE_BOX * DPR);

    COLORS.forEach(function (color) {
      var c = document.createElement('canvas');
      c.width = px; c.height = px;
      var g = c.getContext('2d');
      g.scale(DPR, DPR);
      var m = SPRITE_BOX / 2;

      var grad = g.createRadialGradient(m - R * 0.34, m - R * 0.40, R * 0.12, m, m, R);
      grad.addColorStop(0,    shade(color, 0.58));
      grad.addColorStop(0.55, color);
      grad.addColorStop(1,    shade(color, -0.36));

      g.beginPath();
      g.arc(m, m, R, 0, TAU);
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 1.1;
      g.strokeStyle = 'rgba(0,0,0,0.30)';
      g.stroke();

      g.beginPath();
      g.ellipse(m - R * 0.30, m - R * 0.38, R * 0.30, R * 0.19, -0.6, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fill();

      sprites[color] = c;
    });

    buildMarbleSprite();
  }

  // Slope's marble, in grey and black: a dark glass sphere with a swirl banded
  // through it. The swirl is the point — without something asymmetric baked in,
  // a rolling sphere and a still one look identical, and the fall has to read.
  // The specular highlight is *not* in the sprite: it is drawn on afterwards so
  // it stays put while the body turns, the way a real highlight does.
  function buildMarbleSprite() {
    var px = Math.ceil(SPRITE_BOX * DPR);
    var c = document.createElement('canvas');
    c.width = px; c.height = px;
    var g = c.getContext('2d');
    g.scale(DPR, DPR);
    var m = SPRITE_BOX / 2;

    var grad = g.createRadialGradient(m - R * 0.30, m - R * 0.36, R * 0.10, m, m, R);
    grad.addColorStop(0,    '#c3ccd8');
    grad.addColorStop(0.34, '#6b7a90');
    grad.addColorStop(0.72, '#2c3e50');
    grad.addColorStop(1,    '#0b1017');

    g.beginPath();
    g.arc(m, m, R, 0, TAU);
    g.fillStyle = grad;
    g.fill();

    g.save();
    g.beginPath();
    g.arc(m, m, R, 0, TAU);
    g.clip();
    g.strokeStyle = 'rgba(226,232,240,0.20)';
    g.lineWidth = R * 0.26;
    g.beginPath();
    g.ellipse(m, m, R * 0.74, R * 0.24, -0.55, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(8,13,24,0.45)';
    g.lineWidth = R * 0.16;
    g.beginPath();
    g.ellipse(m, m, R * 0.86, R * 0.44, 0.7, 0, TAU);
    g.stroke();
    g.restore();

    g.beginPath();
    g.arc(m, m, R, 0, TAU);
    g.lineWidth = 1.3;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.stroke();

    marbleSprite = c;
  }

  function drawBubble(x, y, color, scale, alpha) {
    var s = SPRITE_BOX * (scale === undefined ? 1 : scale);
    if (alpha !== undefined && alpha < 1) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[color], x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(sprites[color], x - s / 2, y - s / 2, s, s);
    }
  }

  function drawMarble(x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(marbleSprite, -SPRITE_BOX / 2, -SPRITE_BOX / 2, SPRITE_BOX, SPRITE_BOX);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(x - R * 0.30, y - R * 0.38, R * 0.28, R * 0.17, -0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fill();
  }

  // ── Levels ────────────────────────────────────────────────────────────────
  //
  // Every level opens on the same full board — twelve rows off the ceiling,
  // about half the height. What changes is where in it the marble is sitting.
  //
  // Row 0 is the ceiling and row 11 is the exposed underside, which is the only
  // face a shot can reach. Levels walk the marble up toward the ceiling, which
  // changes the shape of the dig — a high marble means a bigger slab comes down
  // when its ring is finally cut — but measured against a bot that plays every
  // level the same way it barely changes how many shots the job takes, because
  // the cascade does the work either way.
  //
  // So the budget is the difficulty, and it is tight. That same bot clears a
  // board in nine or ten shots on a good read and twenty on a bad one; these
  // numbers leave room for the good read and not much for the bad one.

  function levelSpec(n) {
    if (n === 1) return { marbleRow: 9, shots: 20, feedEvery: 6, feedCount: 1 };
    if (n === 2) return { marbleRow: 8, shots: 18, feedEvery: 5, feedCount: 1 };
    if (n === 3) return { marbleRow: 7, shots: 17, feedEvery: 5, feedCount: 1 };
    if (n === 4) return { marbleRow: 6, shots: 16, feedEvery: 4, feedCount: 1 };
    if (n === 5) return { marbleRow: 5, shots: 15, feedEvery: 4, feedCount: 2 };
    // Past the table the marble climbs to within three rows of the ceiling and
    // stops, so the screw that keeps turning is the budget.
    return {
      marbleRow: Math.max(3, 5 - (n - 5)),
      shots: Math.max(12, 15 - (n - 5)),
      feedEvery: 3, feedCount: 2
    };
  }

  // ── Board construction ────────────────────────────────────────────────────

  function buildBoard() {
    bubbles.clear();
    marble = null;
    marbleFall = null;

    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < rowCols(row); col++) {
        bubbles.set(key(row, col), {
          row: row, col: col,
          x: cellX(row, col), y: cellY(row),
          color: pick(COLORS)
        });
      }
    }

    // Two light smoothing passes. Pure noise gives a board with no readable
    // shapes in it; copying a neighbour some of the time grows blobs worth
    // aiming at without making the opening trivially diggable.
    for (var pass = 0; pass < 2; pass++) {
      var snapshot = [];
      bubbles.forEach(function (b) { snapshot.push(b); });
      snapshot.forEach(function (b) {
        if (Math.random() > 0.35) return;
        var t = nbTable(b.row);
        var d = t[(Math.random() * 6) | 0];
        var n = bubbles.get(key(b.row + d[0], b.col + d[1]));
        if (n) b.color = n.color;
      });
    }

    placeMarble();
    measureDepth();
  }

  // The marble goes in a cell on its level's row, kept a couple of columns off
  // either edge. An edge cell has fewer than six neighbours, so a marble parked
  // there would need less dug out than one in the middle of the same row —
  // the level's depth is supposed to be the difficulty, not its luck.
  function placeMarble() {
    var row = clamp(spec.marbleRow, 1, ROWS - 2);
    var n = rowCols(row);
    var lo = 2, hi = n - 3;
    if (hi < lo) { lo = 0; hi = n - 1; }
    var col = lo + ((Math.random() * (hi - lo + 1)) | 0);

    bubbles.delete(key(row, col));
    marble = { row: row, col: col, x: cellX(row, col), y: cellY(row) };
  }

  // ── Shot queue ────────────────────────────────────────────────────────────

  function boardColors() {
    var seen = {}, out = [];
    bubbles.forEach(function (b) {
      if (!seen[b.color]) { seen[b.color] = 1; out.push(b.color); }
    });
    return out.length ? out : COLORS;
  }

  // Always a colour that is actually on the board. With three colours a dead
  // draw is rare, but this is a dig against a shot budget — a shot you cannot
  // spend is a shot taken off you.
  function nextColor() { return pick(boardColors()); }

  function fillQueue() {
    while (queue.length < 2) queue.push(nextColor());
  }

  function shotsLeft() { return Math.max(0, spec.shots - shotsUsed); }

  // ── Firing ────────────────────────────────────────────────────────────────

  function fire() {
    if (!running || ended || shot || levelClearing) return;
    if (shotsLeft() <= 0) return;

    var color = queue.shift();
    fillQueue();
    shotsUsed++;
    totalShots++;

    shot = {
      x: SHOOTER_X, y: SHOOTER_Y,
      vx: Math.cos(aim) * SPEED,
      vy: Math.sin(aim) * SPEED,
      color: color
    };
    updateHud();
  }

  // Walk the projectile forward in short steps so a fast shot cannot tunnel
  // through a one-gumball-thick wall.
  function stepShot(dt) {
    var remaining = dt;
    var stepLen = R * 0.30;
    var speed = Math.hypot(shot.vx, shot.vy);
    var maxStep = stepLen / speed;

    while (remaining > 0 && shot) {
      var d = Math.min(remaining, maxStep);
      remaining -= d;

      shot.x += shot.vx * d;
      shot.y += shot.vy * d;

      if (shot.x < R)      { shot.x = R;      shot.vx = -shot.vx; }
      if (shot.x > LW - R) { shot.x = LW - R; shot.vx = -shot.vx; }

      var hit = contactCell(shot.x, shot.y);
      if (hit) { attach(hit); return; }
    }
  }

  // The occupied cell the projectile is overlapping, or the ceiling. The marble
  // is solid to a shot even though nothing can stick to it: it is a physical
  // object in the pile.
  function contactCell(x, y) {
    if (y <= Y0 + R) return { ceiling: true };

    var r0 = rowAt(y);
    var best = null, bestD = SP * SP;

    for (var row = r0 - 2; row <= r0 + 2; row++) {
      if (row < 0) continue;
      var c0 = colAt(row, x);
      for (var col = c0 - 2; col <= c0 + 2; col++) {
        if (!inGrid(row, col) || !occupied(row, col)) continue;
        var dx = x - cellX(row, col), dy = y - cellY(row);
        var d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { row: row, col: col, marble: isMarbleCell(row, col) };
        }
      }
    }
    return best;
  }

  function attach(hitCell) {
    var color = shot.color;
    var x = shot.x, y = shot.y;
    shot = null;

    var cell = snapCell(x, y);
    var b = {
      row: cell[0], col: cell[1],
      x: cellX(cell[0], cell[1]), y: cellY(cell[0]),
      color: color
    };
    bubbles.set(key(b.row, b.col), b);

    resolve(b);
    afterShot();
  }

  // The nearest free cell to where the gumball actually stopped, out of every
  // cell around it that something could hang off: the ceiling row, or any empty
  // cell with an occupied neighbour. Taking the nearest to the stopping point
  // rather than to the cell it struck is what makes a shot squeezed into a
  // pocket land in the pocket.
  //
  // Cells touching only the marble are offered like any other. A gumball that
  // lands there is unsupported and drops straight back out — that is the rule
  // doing its job, not a bug.
  function snapCell(x, y) {
    var r0 = rowAt(y);
    var bestCell = null, bestD = Infinity;

    for (var row = Math.max(0, r0 - 3); row <= r0 + 3; row++) {
      var c0 = colAt(row, x);
      for (var col = c0 - 3; col <= c0 + 3; col++) {
        if (!inGrid(row, col) || occupied(row, col)) continue;
        if (row !== 0 && !hasAnyNeighbour(row, col)) continue;
        var dx = x - cellX(row, col), dy = y - cellY(row);
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestCell = [row, col]; }
      }
    }

    if (bestCell) return bestCell;

    // Cannot happen with a live board, but a shot that finds no slot at all
    // must not wedge the game: park it on the ceiling row.
    var c = clamp(colAt(0, x), 0, rowCols(0) - 1);
    for (var i = 0; i < rowCols(0); i++) {
      if (!occupied(0, c)) return [0, c];
      c = (c + 1) % rowCols(0);
    }
    return [ROWS, 0];
  }

  // Any occupant, marble included — this is about whether a gumball can
  // physically come to rest here, not about whether it will stay.
  function hasAnyNeighbour(row, col) {
    var t = nbTable(row);
    for (var i = 0; i < 6; i++) {
      if (occupied(row + t[i][0], col + t[i][1])) return true;
    }
    return false;
  }

  // Gumball neighbours only — the marble holds nothing up.
  function hasGumballNeighbour(row, col) {
    var t = nbTable(row);
    for (var i = 0; i < 6; i++) {
      if (bubbles.has(key(row + t[i][0], col + t[i][1]))) return true;
    }
    return false;
  }

  // ── The feed ──────────────────────────────────────────────────────────────
  //
  // Every few shots the machine tops itself up: gumballs fly in from the side
  // and stick to the underside of the mass, spread across its width rather than
  // dropped in one place, so the whole thing creeps down toward the line.
  //
  // The one thing the feed will not do is refill a cell touching the marble.
  // The pocket you are digging is the level; a board that can pack it back in
  // faster than you can empty it is not a puzzle, it is a pump.

  function nextToMarble(row, col) {
    if (!marble) return false;
    var t = nbTable(marble.row);
    for (var i = 0; i < 6; i++) {
      if (marble.row + t[i][0] === row && marble.col + t[i][1] === col) return true;
    }
    return false;
  }

  // Empty cells touching at least one gumball — everywhere the mass can grow.
  // `nb` counts gumball neighbours only: the marble props nothing up, so a cell
  // whose only neighbour is the marble is not a place the mass can grow into.
  function frontierCells() {
    var seen = {}, out = [];
    bubbles.forEach(function (b) {
      var t = nbTable(b.row);
      for (var i = 0; i < 6; i++) {
        var row = b.row + t[i][0], col = b.col + t[i][1], k = key(row, col);
        if (seen[k] || !inGrid(row, col) || occupied(row, col)) continue;
        if (nextToMarble(row, col)) continue;              // the pocket is yours
        seen[k] = 1;
        var nb = 0, tt = nbTable(row);
        for (var j = 0; j < 6; j++) {
          if (bubbles.has(key(row + tt[j][0], col + tt[j][1]))) nb++;
        }
        out.push({ row: row, col: col, x: cellX(row, col), y: cellY(row), nb: nb });
      }
    });
    return out;
  }

  // n cells spread across the board, one per evenly-spaced column band. Within
  // a band the feed takes the lowest well-supported cell it can find: it fills
  // the pockets bitten out of the underside first, then hangs new gumballs off
  // the bottom, which is the direction that costs you.
  function pickFeedCells(n) {
    var frontier = frontierCells();
    if (!frontier.length) return [];

    var taken = {}, out = [];
    var jitter = Math.random();

    for (var i = 0; i < n; i++) {
      var want = LW * ((i + jitter) / n);
      var bestCell = null, bestScore = -Infinity;
      for (var j = 0; j < frontier.length; j++) {
        var f = frontier[j];
        if (taken[key(f.row, f.col)]) continue;
        var s = f.nb * 12 + f.y * 0.30 - Math.abs(f.x - want) * 0.55;
        if (s > bestScore) { bestScore = s; bestCell = f; }
      }
      if (!bestCell) break;
      taken[key(bestCell.row, bestCell.col)] = 1;
      out.push(bestCell);
    }
    return out;
  }

  function spawnFeed() {
    var cells = pickFeedCells(spec.feedCount);

    cells.forEach(function (cell) {
      feeders.push({
        // In from the nearer side wall, level with the slot it is heading for,
        // so the whole flight happens on screen and reads as the machine
        // adding to the mass rather than something falling out of nowhere.
        x: cell.x < LW / 2 ? -SP : LW + SP,
        y: cell.y,
        row: cell.row, col: cell.col,
        color: pick(COLORS)
      });
    });

    if (cells.length && !feedAnnounced) {
      feedAnnounced = true;
      toast('The machine feeds itself — never next to the marble');
    }
  }

  function stepFeeders(dt) {
    for (var i = feeders.length - 1; i >= 0; i--) {
      var f = feeders[i];
      var tx = cellX(f.row, f.col), ty = cellY(f.row);
      var dx = tx - f.x, dy = ty - f.y;
      var d = Math.hypot(dx, dy);
      var step = FEED_SPEED * dt;

      if (d > step) {
        f.x += (dx / d) * step;
        f.y += (dy / d) * step;
        continue;
      }

      feeders.splice(i, 1);
      landFeeder(f);
    }
  }

  function landFeeder(f) {
    var row = f.row, col = f.col;

    // A shot may have taken the slot, or a pop may have cut it loose from the
    // ceiling, while this was in the air. Either way it needs a live cell.
    if (occupied(row, col) || !hasGumballNeighbour(row, col) || nextToMarble(row, col)) {
      var alt = nearestFrontier(cellX(row, col), cellY(row));
      if (!alt) return;
      row = alt.row; col = alt.col;
    }

    bubbles.set(key(row, col), {
      row: row, col: col, x: cellX(row, col), y: cellY(row), color: f.color
    });

    // A fed gumball only ever sticks. It is deliberately not put through
    // resolve(): the feed is the board working against you, so it must not be
    // able to hand back a pop, and a group it completes is left standing as a
    // setup to fire into.
    measureDepth();
    updateHud();
    checkEnd();
  }

  function nearestFrontier(x, y) {
    var frontier = frontierCells(), best = null, bestD = Infinity;
    frontier.forEach(function (f) {
      var dx = x - f.x, dy = y - f.y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = f; }
    });
    return best;
  }

  // ── Matching, orphans, scoring ────────────────────────────────────────────

  // Walks `bubbles` only, so the marble can never be part of a colour group and
  // can never be popped by one. It is not a colour, it is a hole in the colours.
  function sameColorGroup(start) {
    var out = [start], seen = {}, stack = [start];
    seen[key(start.row, start.col)] = 1;
    while (stack.length) {
      var b = stack.pop();
      var t = nbTable(b.row);
      for (var i = 0; i < 6; i++) {
        var row = b.row + t[i][0], col = b.col + t[i][1], k = key(row, col);
        if (seen[k]) continue;
        var n = bubbles.get(k);
        if (!n || n.color !== start.color) continue;
        seen[k] = 1;
        out.push(n);
        stack.push(n);
      }
    }
    return out;
  }

  // Anything with no chain of gumballs back to the ceiling row is hanging on
  // nothing and falls. The flood never steps through the marble, which is the
  // whole reason a gumball resting against it drops.
  function findOrphans() {
    var seen = {}, stack = [];
    for (var col = 0; col < rowCols(0); col++) {
      var k = key(0, col);
      if (bubbles.has(k)) { seen[k] = 1; stack.push(bubbles.get(k)); }
    }
    while (stack.length) {
      var b = stack.pop();
      var t = nbTable(b.row);
      for (var i = 0; i < 6; i++) {
        var row = b.row + t[i][0], col = b.col + t[i][1], kk = key(row, col);
        if (seen[kk]) continue;
        var n = bubbles.get(kk);
        if (!n) continue;
        seen[kk] = 1;
        stack.push(n);
      }
    }
    var out = [];
    bubbles.forEach(function (b) {
      if (!seen[key(b.row, b.col)]) out.push(b);
    });
    return out;
  }

  function launchFall(b) {
    falls.push({
      x: b.x, y: b.y,
      vx: (Math.random() - 0.5) * 70,
      vy: -30 - Math.random() * 40,
      color: b.color, t: 0
    });
  }

  function resolve(placed) {
    var group = sameColorGroup(placed);
    var gained = 0;

    if (group.length >= MIN_MATCH) {
      var pts = group.length * PTS_MATCH + (group.length - MIN_MATCH) * PTS_GROUP;
      gained += pts;
      matched += group.length;

      var cx = 0, cy = 0;
      group.forEach(function (b) {
        bubbles.delete(key(b.row, b.col));
        cx += b.x; cy += b.y;
        pops.push({ x: b.x, y: b.y, color: b.color, t: 0 });
      });
      floats.push({
        x: cx / group.length, y: cy / group.length,
        text: '+' + pts, color: '#e2e8f0', t: 0
      });
    }

    // This runs after every placement, not only after a pop. A gumball whose
    // only neighbour is the marble never popped anything — it simply has
    // nothing to hold on to, and it has to come straight back out.
    var orphans = findOrphans();
    if (orphans.length) {
      var payable = 0, ox = 0, oy = 0;
      orphans.forEach(function (b) {
        bubbles.delete(key(b.row, b.col));
        launchFall(b);
        ox += b.x; oy += b.y;
        // The shot that just landed and immediately fell back out pays nothing.
        // Otherwise firing into the marble over and over is a points faucet.
        if (b !== placed) payable++;
      });
      if (payable > 0) {
        var bonus = payable * PTS_DROP;
        gained += bonus;
        dropped += payable;
        floats.push({
          x: ox / orphans.length, y: oy / orphans.length,
          text: '+' + bonus + ' DROP', color: '#fbbf24', t: 0
        });
      }
    }

    score += gained;
    measureDepth();
    checkMarble();
  }

  function afterShot() {
    updateHud();
    if (marbleFall || levelClearing) return;   // the level is already won
    if (checkEnd()) return;
    if (shotsLeft() <= 0) { finish('out'); return; }

    // Landed or missed, the feed still comes.
    if (shotsUsed % spec.feedEvery === 0) spawnFeed();
  }

  // ── The marble ────────────────────────────────────────────────────────────

  function marbleSupports() {
    if (!marble) return 0;
    var n = 0, t = nbTable(marble.row);
    for (var i = 0; i < 6; i++) {
      if (bubbles.has(key(marble.row + t[i][0], marble.col + t[i][1]))) n++;
    }
    return n;
  }

  // Run after every clear. Support is counted live rather than against the six
  // cells the marble started with, because a stray shot can pack one of them
  // back in — and a marble with something under it again is, correctly, still
  // sitting there.
  function checkMarble() {
    if (!marble || marbleFall) return false;
    if (marbleSupports() > 0) return false;
    freeMarble();
    return true;
  }

  function freeMarble() {
    marbleFall = {
      x: marble.x, y: marble.y,
      vx: (Math.random() - 0.5) * 30,
      vy: 20,
      rot: 0, t: 0
    };
    marble = null;

    // Anything still flying in has a board it can no longer change.
    feeders.length = 0;
    shot = null;
    running = false;
    measureDepth();
    updateHud();
  }

  function stepMarbleFall(dt) {
    if (!marbleFall) return;
    var m = marbleFall;
    m.t += dt * 1000;
    m.vy += GRAVITY * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    // Rolls as it goes — a sphere with a swirl in it reads as falling only if
    // it turns.
    m.rot += (m.vx / R) * dt * 0.6 + dt * 2.6;

    if (m.x < R)      { m.x = R;      m.vx = -m.vx * 0.7; }
    if (m.x > LW - R) { m.x = LW - R; m.vx = -m.vx * 0.7; }

    if (m.y > LH + SP * 2) {
      marbleFall = null;
      levelCleared();
    }
  }

  function levelCleared() {
    if (levelClearing || resolved) return;
    levelClearing = true;
    levelHold = 0;

    var bonus = PTS_LEVEL + shotsLeft() * PTS_SPARE;
    score += bonus;
    updateHud();

    clearTitleEl.textContent = 'LEVEL ' + level + ' CLEAR';
    clearSubEl.textContent = 'Marble freed with ' + shotsLeft() + ' shot' +
      (shotsLeft() === 1 ? '' : 's') + ' spare  ·  +' + bonus;
    clearEl.classList.add('gb-on');
  }

  function advanceLevel(dt) {
    if (!levelClearing) return;
    levelHold += dt * 1000;
    if (levelHold < LEVEL_HOLD) return;
    levelClearing = false;
    clearEl.classList.remove('gb-on');
    startLevel(level + 1);
  }

  // ── Ending ────────────────────────────────────────────────────────────────

  // Decided here as well as per-frame, so a gumball that arrives in a losing
  // position ends the run on the event that put it there rather than whenever
  // the next frame happens to be drawn.
  function checkEnd() {
    if (marbleFall || levelClearing) return false;
    if (!bubbles.size) {
      // Cannot normally happen — an empty board means the marble lost its last
      // support and left first — but a marble sitting on nothing must go.
      if (marble) { freeMarble(); return true; }
    }
    measureDepth();
    if (lowestY >= DEATH_Y) { finish('line'); return true; }
    return false;
  }

  // How far down the mass now reaches, measured on the bottom edge of the
  // lowest thing in it, marble included.
  function measureDepth() {
    var lo = 0;
    bubbles.forEach(function (b) { if (b.y > lo) lo = b.y; });
    if (marble && marble.y > lo) lo = marble.y;
    lowestY = bubbles.size || marble ? lo + R : 0;
  }

  // ── Aim ───────────────────────────────────────────────────────────────────

  function setAim(px, py) {
    var dx = px - SHOOTER_X, dy = py - SHOOTER_Y;
    if (dy > -1) {
      // Pointer level with or below the shooter — clamp to the nearer side
      // rather than letting the shot go sideways into the wall forever.
      aim = dx >= 0 ? -AIM_MARGIN : -Math.PI + AIM_MARGIN;
    } else {
      aim = clamp(Math.atan2(dy, dx), -Math.PI + AIM_MARGIN, -AIM_MARGIN);
    }
  }

  // Walk the aim forward exactly the way a shot would, banking off the side
  // walls, and stop at the first thing it would touch.
  function trajectory() {
    var pts = [{ x: SHOOTER_X, y: SHOOTER_Y }];
    var x = SHOOTER_X, y = SHOOTER_Y;
    var dx = Math.cos(aim), dy = Math.sin(aim);
    var step = 5, bounces = 0;

    for (var i = 0; i < 900; i++) {
      x += dx * step;
      y += dy * step;

      if (x < R)      { x = R;      dx = -dx; pts.push({ x: x, y: y }); if (++bounces > 3) break; }
      if (x > LW - R) { x = LW - R; dx = -dx; pts.push({ x: x, y: y }); if (++bounces > 3) break; }

      if (y < 0) break;
      if (contactCell(x, y)) break;
    }
    pts.push({ x: x, y: y });
    return pts;
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (lastTime === null) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    step(dt);
    render();
  }

  // One frame of simulation, with no drawing. The rAF loop and the test hook
  // both go through here so there is only one description of a frame.
  function step(dt) {
    if (running && !ended) {
      if (shot) stepShot(dt);
      stepFeeders(dt);
      checkEnd();
    }

    stepEffects(dt);
    stepMarbleFall(dt);
    advanceLevel(dt);
  }

  function stepEffects(dt) {
    var i;
    for (i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt * 1000;
      if (pops[i].t > POP_MS) pops.splice(i, 1);
    }
    for (i = falls.length - 1; i >= 0; i--) {
      var f = falls[i];
      f.t += dt * 1000;
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.t > FALL_MS || f.y > LH + SP) falls.splice(i, 1);
    }
    for (i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt * 1000;
      floats[i].y -= 26 * dt;
      if (floats[i].t > FLOAT_MS) floats.splice(i, 1);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, LW, LH);

    var bg = ctx.createLinearGradient(0, 0, 0, LH);
    bg.addColorStop(0, '#152238');
    bg.addColorStop(1, '#080d18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, LW, LH);

    drawCeiling();
    drawDeathLine();

    bubbles.forEach(function (b) { drawBubble(b.x, b.y, b.color); });

    if (marble) drawMarbleSeated(marble.x, marble.y);

    feeders.forEach(function (f) { drawBubble(f.x, f.y, f.color); });

    falls.forEach(function (f) {
      drawBubble(f.x, f.y, f.color, 1, 1 - f.t / FALL_MS);
    });

    pops.forEach(function (p) {
      var k = p.t / POP_MS;
      drawBubble(p.x, p.y, p.color, 1 + k * 0.75, 1 - k);
    });

    if (marbleFall) drawMarble(marbleFall.x, marbleFall.y, marbleFall.rot);

    if (running && !ended && !shot && !levelClearing) drawAim();
    if (shot) drawBubble(shot.x, shot.y, shot.color);

    drawShooter();
    drawFeedCounter();
    drawFloats();
  }

  // The rail everything hangs off. Without something drawn there the top row
  // reads as floating rather than anchored, which is the one thing a player
  // has to understand before the support rule makes any sense.
  function drawCeiling() {
    var g = ctx.createLinearGradient(0, 0, 0, Y0);
    g.addColorStop(0, '#7c8ba1');
    g.addColorStop(1, '#2b3a4f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, Y0);
  }

  // The line the mass must not cross. Quiet until the mass is within a few rows
  // of it, then it fades up — a warning that arrives in time to be acted on
  // rather than a permanent piece of furniture.
  function drawDeathLine() {
    var warnAt = ROW_H * 4;
    var gap = DEATH_Y - lowestY;
    if (gap > warnAt) return;
    var heat = clamp(1 - gap / warnAt, 0, 1);

    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(239,68,68,' + (0.20 + heat * 0.64).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, DEATH_Y);
    ctx.lineTo(LW, DEATH_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Two rings, doing two different jobs.
  //
  // The pale one is always on: the marble has to read as the target from the
  // first frame, and a grey sphere among primary-coloured spheres is distinct
  // but not *announced*.
  //
  // The amber one brightens as the supports come off, six down to one, because
  // without it the moment the level is one pop from won looks exactly like the
  // moment it is five pops from won.
  function drawMarbleSeated(x, y) {
    var sup = marbleSupports();
    var heat = clamp((6 - sup) / 5, 0, 1);

    ctx.beginPath();
    ctx.arc(x, y, R * 1.34, 0, TAU);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(226,232,240,0.34)';
    ctx.stroke();

    if (sup <= 4) {
      ctx.beginPath();
      ctx.arc(x, y, R * (1.58 + heat * 0.24), 0, TAU);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(250,204,21,' + (0.16 + heat * 0.6).toFixed(3) + ')';
      ctx.stroke();
    }

    drawMarble(x, y, 0);
  }

  // Both readouts live along the bottom edge. The top of this board is packed
  // solid with gumballs from the first frame, so anything drawn up there is
  // printed straight onto them.
  function drawFeedCounter() {
    if (!running || ended) return;
    var left = spec.feedEvery - (shotsUsed % spec.feedEvery);
    var y = LH - 14;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '700 10px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = left === 1 ? 'rgba(251,191,36,0.9)' : 'rgba(148,163,184,0.5)';
    ctx.fillText('FEED IN ' + left, 12, y);

    var sup = marbleSupports();
    ctx.textAlign = 'right';
    ctx.fillStyle = sup <= 2 ? 'rgba(250,204,21,0.9)' : 'rgba(148,163,184,0.5)';
    ctx.fillText('SUPPORTS ' + sup, LW - 12, y);
    ctx.restore();
  }

  function drawAim() {
    var pts = trajectory();
    ctx.save();
    ctx.setLineDash([6, 7]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(226,232,240,0.42)';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    var end = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, R * 0.85, 0, TAU);
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawShooter() {
    ctx.save();
    ctx.translate(SHOOTER_X, SHOOTER_Y);
    ctx.rotate(aim);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, -R * 0.42, R * 2.1, R * 0.84);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(SHOOTER_X, SHOOTER_Y, R * 1.5, 0, TAU);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    if (!shot && queue.length) drawBubble(SHOOTER_X, SHOOTER_Y, queue[0]);

    if (queue.length > 1) {
      var nx = SHOOTER_X + R * 3.6, ny = SHOOTER_Y;
      ctx.globalAlpha = 0.75;
      drawBubble(nx, ny, queue[1], 0.72);
      ctx.globalAlpha = 1;
      ctx.font = '600 10px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT', nx, ny + R * 1.9);
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    floats.forEach(function (f) {
      var k = f.t / FLOAT_MS;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = '700 15px -apple-system, system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,13,24,0.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
  }

  // ── HUD / overlays ────────────────────────────────────────────────────────

  function updateHud() {
    elLevel.textContent = level;
    elScore.textContent = score;
    elShots.textContent = shotsLeft();
    elBest.textContent  = best || '—';
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('gb-toast-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('gb-toast-on');
    }, 2400);
  }

  function finish(reason) {
    if (resolved) return;
    resolved = true;
    ended = true;
    running = false;
    levelClearing = false;
    clearEl.classList.remove('gb-on');

    if (score > best) {
      best = score;
      try { localStorage.setItem('gumball_best', String(best)); } catch (e) {}
    }
    updateHud();

    var cleared = level - 1;
    bannerEl.classList.add('hidden');

    if (reason === 'line') {
      titleEl.textContent = 'THE MASS CROSSED THE LINE';
      modalSubEl.textContent = 'It grew down past the line with the marble still buried. ' +
        'The feed only ever adds — dig faster than it packs.';
    } else {
      titleEl.textContent = 'OUT OF SHOTS';
      modalSubEl.textContent = 'The marble still had ' + marbleSupports() +
        ' gumball' + (marbleSupports() === 1 ? '' : 's') + ' holding it up.';
    }

    if (cleared > 0) {
      bannerEl.textContent = cleared + ' MARBLE' + (cleared === 1 ? '' : 'S') + ' FREED';
      bannerEl.style.background = '#15803d';
      bannerEl.classList.remove('hidden');
    }

    modalScoreEl.textContent = 'Score ' + score;

    breakdownEl.innerHTML = [
      ['Levels cleared', String(cleared)],
      ['Reached', 'level ' + level],
      ['Matched', matched + ' gumball' + (matched === 1 ? '' : 's')],
      ['Dropped', dropped + ' gumball' + (dropped === 1 ? '' : 's') + ' (2×)'],
      ['Shots fired', String(totalShots)],
      ['Best', String(best)]
    ].map(function (r) {
      return '<div class="bd-row"><span>' + r[0] + '</span><strong style="margin-left:auto">' + r[1] + '</strong></div>';
    }).join('');

    overlayEl.classList.remove('hidden');
  }

  function shareLine() {
    return 'Gumball — freed ' + (level - 1) + ' marble' + (level - 1 === 1 ? '' : 's') +
      ', ' + score + ' points, ' + totalShots + ' shots.\nhttps://www.thebunnygame.com/gumball';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function startLevel(n) {
    level = n;
    spec = levelSpec(n);
    shot = null;
    queue = [];
    shotsUsed = 0;
    feeders = [];
    pops = []; falls = []; floats = [];
    marbleFall = null;
    levelClearing = false; levelHold = 0;
    aim = -Math.PI / 2;
    buildBoard();
    fillQueue();
    updateHud();
    running = true;
  }

  function reset() {
    score = 0; totalShots = 0; matched = 0; dropped = 0;
    feedAnnounced = false;
    ended = false; resolved = false;
    clearEl.classList.remove('gb-on');
    startLevel(1);
    running = false;
  }

  function startGame() {
    reset();
    running = true;
    startEl.classList.add('gb-hide');
    overlayEl.classList.add('hidden');
    toast('Free the grey marble — clear everything touching it');
  }

  function fitCanvas() {
    var availW = wrap.clientWidth  - 4;
    var availH = wrap.clientHeight - 4;
    var scale = Math.min(1, availW / LW, availH / LH);
    canvas.style.width  = Math.floor(LW * scale) + 'px';
    canvas.style.height = Math.floor(LH * scale) + 'px';
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (LW / rect.width),
      y: (e.clientY - rect.top)  * (LH / rect.height)
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    wrap      = document.getElementById('canvas-wrap');
    canvas    = document.getElementById('game-canvas');
    ctx       = canvas.getContext('2d');
    elLevel   = document.getElementById('val-level');
    elScore   = document.getElementById('val-score');
    elShots   = document.getElementById('val-shots');
    elBest    = document.getElementById('val-best');
    startEl   = document.getElementById('gb-start');
    toastEl   = document.getElementById('gb-toast');
    clearEl      = document.getElementById('gb-clear');
    clearTitleEl = document.getElementById('gb-clear-title');
    clearSubEl   = document.getElementById('gb-clear-sub');
    overlayEl = document.getElementById('overlay');
    titleEl   = document.getElementById('modal-title');
    modalScoreEl = document.getElementById('modal-score');
    modalSubEl   = document.getElementById('modal-sub');
    breakdownEl  = document.getElementById('modal-breakdown');
    bannerEl     = document.getElementById('perf-banner');

    canvas.width  = Math.round(LW * DPR);
    canvas.height = Math.round(LH * DPR);
    buildSprites();
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    try { best = parseInt(localStorage.getItem('gumball_best'), 10) || 0; } catch (e) { best = 0; }

    // Aim continuously on a mouse; on touch, aim while the finger is down and
    // fire when it lifts — the same drag-then-release the other pointer games use.
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && !pointerDown) return;
      var p = pointerPos(e);
      setAim(p.x, p.y);
    });
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pointerDown = true;
      canvas.setPointerCapture(e.pointerId);
      var p = pointerPos(e);
      setAim(p.x, p.y);
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!pointerDown) return;
      pointerDown = false;
      var p = pointerPos(e);
      setAim(p.x, p.y);
      fire();
    });
    canvas.addEventListener('pointercancel', function () { pointerDown = false; });

    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });
    document.getElementById('new-btn').addEventListener('click', startGame);
    document.getElementById('gb-play-btn').addEventListener('click', startGame);
    document.getElementById('play-again-btn').addEventListener('click', startGame);
    document.getElementById('share-btn').addEventListener('click', function () {
      shareText(shareLine(), 'Gumball — Bunny Game');
    });

    // A board sitting behind the splash so the canvas is not a dead rectangle
    // before the first click.
    reset();
    raf = requestAnimationFrame(frame);

    // Exposed for verification
    window.Gumball = {
      state: function () {
        return {
          mobile: MOBILE, w: LW, h: LH, r: R, cols: COLS, rows: ROWS,
          level: level, spec: spec,
          bubbles: bubbles.size,
          marble: marble ? { row: marble.row, col: marble.col, supports: marbleSupports() } : null,
          marbleFalling: !!marbleFall,
          score: score, shotsUsed: shotsUsed, shotsLeft: shotsLeft(),
          totalShots: totalShots, matched: matched, dropped: dropped,
          queue: queue.slice(), ended: ended, running: running, resolved: resolved,
          levelClearing: levelClearing,
          pops: pops.length, falls: falls.length, floats: floats.length,
          inFlight: !!shot, feeders: feeders.length,
          lowestY: lowestY, deathY: DEATH_Y,
          fillFraction: lowestY / LH,
          feedIn: spec.feedEvery - (shotsUsed % spec.feedEvery)
        };
      },
      aimAt: function (a) { aim = a; },
      fire: fire,
      start: startGame,
      // Runs a shot, anything the feed put in the air, and a marble on its way
      // off the board, all to completion without waiting on frames.
      settle: function (max) {
        var n = 0, cap = max || 6000;
        while ((shot || feeders.length || marbleFall) && n++ < cap) step(1 / 240);
        return n;
      },
      // Sits through the level-clear card and lands on the next board.
      settleLevel: function () {
        var n = 0;
        while (levelClearing && n++ < 6000) step(1 / 240);
        return n;
      },
      tick: step,
      // Where the current queue's gumball would land on this heading, and what
      // it would do when it got there. Used by the balance harness to play the
      // board the way a person does — looking for the shot that pops — rather
      // than firing blind at the marble and calling the level unwinnable.
      previewShot: function (a) {
        var save = aim;
        aim = a;
        var pts = trajectory();
        aim = save;

        var end = pts[pts.length - 1];
        var cell = snapCell(end.x, end.y);
        if (!cell) return null;

        var probe = {
          row: cell[0], col: cell[1],
          x: cellX(cell[0], cell[1]), y: cellY(cell[0]),
          color: queue[0]
        };
        bubbles.set(key(probe.row, probe.col), probe);
        var group = sameColorGroup(probe).length;
        var frees = 0;
        if (group >= MIN_MATCH && marble) {
          var t = nbTable(marble.row);
          for (var i = 0; i < 6; i++) {
            if (bubbles.has(key(marble.row + t[i][0], marble.col + t[i][1]))) frees++;
          }
        }
        bubbles.delete(key(probe.row, probe.col));

        return { row: cell[0], col: cell[1], x: probe.x, y: probe.y, group: group, touching: frees };
      },
      // Test hook: strip the marble's supports directly, to exercise the drop
      // without having to play a level out.
      strandMarble: function () {
        if (!marble) return false;
        var t = nbTable(marble.row);
        for (var i = 0; i < 6; i++) {
          bubbles.delete(key(marble.row + t[i][0], marble.col + t[i][1]));
        }
        findOrphans().forEach(function (b) { bubbles.delete(key(b.row, b.col)); });
        measureDepth();
        return checkMarble();
      },
      marbleXY: function () { return marble ? { x: marble.x, y: marble.y } : null; },
      colorsOnBoard: boardColors,
      cells: function () {
        var out = [];
        bubbles.forEach(function (b) { out.push({ row: b.row, col: b.col, color: b.color }); });
        return out;
      }
    };
  });
}());
