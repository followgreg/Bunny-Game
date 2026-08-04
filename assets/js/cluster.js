// cluster.js — Cluster
//
// A bubble shooter where the mass is not a static top-down grid: every bubble
// hangs off a spinner in the middle of the board, and every shot that lands
// torques the whole thing. The gap you aimed at has moved by the time the next
// bubble gets there.
//
// The cluster is stored once, in the spinner's own unrotated frame (axial hex
// coordinates). Rotation is a single angle applied at draw time and inverted
// when a projectile needs to be tested against the mass. Nothing in the cluster
// ever moves relative to anything else in it, which is what makes rigid-body
// spin cheap and the hex snap exact.

(function () {
  'use strict';

  var DIRECTIONS_TEXT =
    'Every bubble hangs off the spinner in the middle. Move the mouse — or drag a ' +
    'finger — to aim, then click or let go to fire. Land three or more of one colour ' +
    'together and they pop. Anything left with no path back to the hub has nothing ' +
    'holding it up, so it falls too, and it pays double. ' +
    'The catch: a shot that lands off-centre spins the whole cluster, and a glancing ' +
    'hit on the rim spins it hard. Aim straight at the hub if you want it to sit still. ' +
    'Shots bank off the side walls to reach the back. Clear every bubble and your score doubles.';

  // ── Board / physics tunables ──────────────────────────────────────────────

  var RING          = 5;      // initial cluster radius in hex rings → 91 cells
  var SHOT_LIMIT    = 50;     // a miss costs a shot too
  var SAFE_SHOTS    = 25;     // opening queue draws only colours already on the board
  var MIN_MATCH     = 3;

  var SPIN_GAIN     = 26;     // impulse exaggeration — real mass ratios barely move 90 bubbles
  var MAX_OMEGA     = 3.2;    // rad/sec
  var SPIN_DAMP     = 0.5;    // fraction of angular velocity surviving each second
  var OMEGA_FLOOR   = 0.02;   // below this the cluster is treated as parked

  var GRAVITY       = 900;    // px/sec² on bubbles that fall
  var POP_MS        = 320;
  var FALL_MS       = 1000;
  var FLOAT_MS      = 900;

  var PTS_MATCH     = 10;     // per bubble in a direct match
  var PTS_GROUP     = 5;      // per bubble beyond the third
  var PTS_DROP      = 25;     // per bubble that falls off the cluster

  var COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7'];

  var TAU = Math.PI * 2;
  var SQ3_2 = Math.sqrt(3) / 2;
  var AIM_MARGIN = 0.14;      // radians of dead zone either side of horizontal

  // Axial hex neighbours, in the same order all the way through.
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // ── Layout — one mobile size, one desktop size, chosen once ───────────────

  // innerWidth can still be 0 in an embedded frame that has not been laid out
  // when the script runs, which would silently hand a desktop the phone board.
  var VIEW_W = window.innerWidth || document.documentElement.clientWidth ||
               (window.screen && window.screen.width) || 1024;
  var MOBILE = VIEW_W < 640;
  var LW = MOBILE ? 400 : 560;
  var LH = MOBILE ? 640 : 720;
  var R  = MOBILE ? 13  : 15;     // bubble radius
  var SP = R * 2;                 // hex spacing — touching bubbles
  var SPEED = R * 36;             // projectile speed, px/sec

  var HUB_X = LW / 2;
  var HUB_Y = Math.round(LH * 0.385);
  var HUB_R = R * 1.45;
  var SHOOTER_Y = LH - 54;

  // The mass must stay out of this circle around the shooter. Measured against
  // the shooter rather than as a radius around the hub, so a cluster growing
  // off to one side is not punished for growing in a harmless direction — and
  // so a long arm that only threatens the shooter once the spin brings it round
  // actually has to come round. The shot limit is the main pressure; this is
  // the backstop for a player who keeps feeding the mass instead of popping it.
  var SHOOTER_SAFE = R * 3.2;

  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ── State ─────────────────────────────────────────────────────────────────

  var bubbles = new Map();    // "q,r" → { q, r, x, y, color }
  var theta = 0, omega = 0;   // cluster orientation and angular velocity
  var inertia = 1, maxR = 0;  // recomputed whenever the cluster changes

  var shot = null;            // in-flight projectile, world coords
  var queue = [];             // [current, next] colours
  var safeLeft = SAFE_SHOTS;
  var freshAnnounced = false;

  var score = 0, shotsUsed = 0, matched = 0, dropped = 0;
  var best = 0;
  var running = false, ended = false;

  var aim = -Math.PI / 2;     // straight up
  var pointerDown = false;

  var pops = [], falls = [], floats = [];
  var lastTime = null, raf = null;

  // ── DOM ───────────────────────────────────────────────────────────────────

  var canvas, ctx, wrap;
  var elScore, elShots, elBubbles, elBest;
  var startEl, toastEl;
  var overlayEl, titleEl, modalScoreEl, modalSubEl, breakdownEl, bannerEl;

  // ── Small helpers ─────────────────────────────────────────────────────────

  function key(q, r) { return q + ',' + r; }

  // Axial → local pixel. Neighbours land exactly SP apart in every direction.
  function cellX(q, r) { return SP * (q + r / 2); }
  function cellY(q, r) { return SP * SQ3_2 * r; }

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

  // Local (spinner frame) → world, and back.
  function toWorld(x, y, out) {
    var c = Math.cos(theta), s = Math.sin(theta);
    out.x = HUB_X + x * c - y * s;
    out.y = HUB_Y + x * s + y * c;
    return out;
  }
  function toLocal(x, y, out) {
    var c = Math.cos(theta), s = Math.sin(theta);
    var dx = x - HUB_X, dy = y - HUB_Y;
    out.x = dx * c + dy * s;
    out.y = -dx * s + dy * c;
    return out;
  }

  var _w = { x: 0, y: 0 }, _l = { x: 0, y: 0 };

  // ── Bubble sprites — 90 radial gradients a frame is not worth paying for ──

  var sprites = {};
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

  // ── Board construction ────────────────────────────────────────────────────

  function buildCluster() {
    bubbles.clear();
    var cells = [];
    for (var q = -RING; q <= RING; q++) {
      var lo = Math.max(-RING, -q - RING);
      var hi = Math.min(RING, -q + RING);
      for (var r = lo; r <= hi; r++) {
        if (q === 0 && r === 0) continue;    // the hub sits here
        cells.push([q, r]);
      }
    }

    cells.forEach(function (c) {
      bubbles.set(key(c[0], c[1]), {
        q: c[0], r: c[1],
        x: cellX(c[0], c[1]), y: cellY(c[0], c[1]),
        color: pick(COLORS)
      });
    });

    // Two light smoothing passes. Pure noise gives a board with no readable
    // shapes in it; copying a neighbour some of the time grows blobs worth
    // aiming at without making the opening trivially clearable.
    for (var pass = 0; pass < 2; pass++) {
      var snapshot = [];
      bubbles.forEach(function (b) { snapshot.push(b); });
      snapshot.forEach(function (b) {
        if (Math.random() > 0.35) return;
        var d = DIRS[(Math.random() * 6) | 0];
        var n = bubbles.get(key(b.q + d[0], b.r + d[1]));
        if (n) b.color = n.color;
      });
    }

    recompute();
  }

  // Moment of inertia about the hub, unit mass per bubble. Popping bubbles
  // lowers it, so a cluster late in a run reacts harder to the same shot —
  // the difficulty curve comes free from the physics.
  function recompute() {
    var sum = 0, mx = 0;
    bubbles.forEach(function (b) {
      var d2 = b.x * b.x + b.y * b.y;
      sum += d2;
      if (d2 > mx) mx = d2;
    });
    inertia = Math.max(sum, 40 * R * R);
    maxR = Math.sqrt(mx);
  }

  // ── Shot queue ────────────────────────────────────────────────────────────

  function boardColors() {
    var seen = {}, out = [];
    bubbles.forEach(function (b) {
      if (!seen[b.color]) { seen[b.color] = 1; out.push(b.color); }
    });
    return out.length ? out : COLORS;
  }

  function nextColor() {
    if (safeLeft > 0) {
      safeLeft--;
      if (safeLeft === 0 && !freshAnnounced) {
        freshAnnounced = true;
        toast('Safe colours used up — fresh colours from here');
      }
      return pick(boardColors());
    }
    return pick(COLORS);
  }

  function fillQueue() {
    while (queue.length < 2) queue.push(nextColor());
  }

  // ── Firing ────────────────────────────────────────────────────────────────

  function fire() {
    if (!running || ended || shot) return;
    if (shotsUsed >= SHOT_LIMIT) return;

    var color = queue.shift();
    fillQueue();
    shotsUsed++;

    shot = {
      x: HUB_X, y: SHOOTER_Y,
      vx: Math.cos(aim) * SPEED,
      vy: Math.sin(aim) * SPEED,
      color: color
    };
    updateHud();
  }

  // Walk the projectile forward in short steps, advancing the cluster with it,
  // so a fast shot cannot tunnel through a one-bubble-thick wall.
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
      spinStep(d);

      if (shot.x < R)      { shot.x = R;      shot.vx = -shot.vx; }
      if (shot.x > LW - R) { shot.x = LW - R; shot.vx = -shot.vx; }

      // Off the top is a clean miss. The shot is spent, the cluster is not fed.
      if (shot.y < -SP) { shot = null; afterShot(); return; }

      var hit = contactCell(shot.x, shot.y);
      if (hit) { attach(hit); return; }
    }
  }

  // The occupied cell (or the hub) the projectile is currently overlapping,
  // tested in the spinner's frame. Returns null when the shot is in open space.
  function contactCell(x, y) {
    toLocal(x, y, _l);
    var d2 = _l.x * _l.x + _l.y * _l.y;

    // Cheap reject: nothing to hit outside the cluster's own radius.
    if (d2 > (maxR + SP + R) * (maxR + SP + R)) return null;

    if (d2 < (HUB_R + R) * (HUB_R + R)) return { hub: true, x: 0, y: 0 };

    var found = null, bestD = SP * SP;
    bubbles.forEach(function (b) {
      var dx = _l.x - b.x, dy = _l.y - b.y;
      var dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; found = b; }
    });
    return found;
  }

  function attach(hitCell) {
    var color = shot.color;

    // Impulse first, while the projectile's velocity is still real. Torque is
    // r × v_rel about the hub: a shot aimed through the centre has no lever arm
    // and does not spin the cluster at all, a glancing rim hit spins it hard.
    // Using velocity *relative to the spinning surface* keeps a cluster already
    // turning fast from being spun up without limit.
    var rx = shot.x - HUB_X, ry = shot.y - HUB_Y;
    var vrx = shot.vx - (-omega * ry);
    var vry = shot.vy - ( omega * rx);
    omega = clamp(omega + SPIN_GAIN * (rx * vry - ry * vrx) / inertia, -MAX_OMEGA, MAX_OMEGA);

    toLocal(shot.x, shot.y, _l);
    var lx = _l.x, ly = _l.y;
    shot = null;

    var cell = snapCell(hitCell, lx, ly);
    var b = {
      q: cell[0], r: cell[1],
      x: cellX(cell[0], cell[1]), y: cellY(cell[0], cell[1]),
      color: color
    };
    bubbles.set(key(b.q, b.r), b);

    resolve(b);
  }

  // Nearest free hex cell to the contact point, among the empty neighbours of
  // everything nearby. Taking the nearest to where the bubble actually stopped
  // (rather than to the cell it struck) is what makes a shot squeezed into a
  // pocket land in the pocket.
  function snapCell(hitCell, lx, ly) {
    var candidates = [], seen = {};
    var reach = SP * 2.2, reach2 = reach * reach;

    function offer(q, r) {
      var k = key(q, r);
      if (seen[k] || bubbles.has(k)) return;
      if (q === 0 && r === 0) return;              // the hub is not a slot
      seen[k] = 1;
      candidates.push([q, r]);
    }

    // Neighbours of the hub, plus neighbours of every bubble near the contact.
    if (hitCell.hub) {
      for (var i = 0; i < 6; i++) offer(DIRS[i][0], DIRS[i][1]);
    }
    bubbles.forEach(function (b) {
      var dx = lx - b.x, dy = ly - b.y;
      if (dx * dx + dy * dy > reach2) return;
      for (var i = 0; i < 6; i++) offer(b.q + DIRS[i][0], b.r + DIRS[i][1]);
    });

    if (!candidates.length) {
      // Cannot happen with a non-empty cluster, but a shot that lands with no
      // slot at all must not wedge the game.
      for (var j = 0; j < 6; j++) {
        var q = (hitCell.q || 0) + DIRS[j][0], r = (hitCell.r || 0) + DIRS[j][1];
        if (!bubbles.has(key(q, r)) && !(q === 0 && r === 0)) return [q, r];
      }
      return [RING + 1, 0];
    }

    var bestCell = candidates[0], bestD = Infinity;
    candidates.forEach(function (c) {
      var dx = lx - cellX(c[0], c[1]), dy = ly - cellY(c[0], c[1]);
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestCell = c; }
    });
    return bestCell;
  }

  // ── Matching, orphans, scoring ────────────────────────────────────────────

  function sameColorGroup(start) {
    var out = [start], seen = {}, stack = [start];
    seen[key(start.q, start.r)] = 1;
    while (stack.length) {
      var b = stack.pop();
      for (var i = 0; i < 6; i++) {
        var q = b.q + DIRS[i][0], r = b.r + DIRS[i][1], k = key(q, r);
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

  // Anything with no chain of bubbles back to a hub neighbour is hanging on
  // nothing and falls.
  function findOrphans() {
    var seen = {}, stack = [];
    for (var i = 0; i < 6; i++) {
      var k = key(DIRS[i][0], DIRS[i][1]);
      if (bubbles.has(k)) { seen[k] = 1; stack.push(bubbles.get(k)); }
    }
    while (stack.length) {
      var b = stack.pop();
      for (var j = 0; j < 6; j++) {
        var q = b.q + DIRS[j][0], r = b.r + DIRS[j][1], kk = key(q, r);
        if (seen[kk]) continue;
        var n = bubbles.get(kk);
        if (!n) continue;
        seen[kk] = 1;
        stack.push(n);
      }
    }
    var out = [];
    bubbles.forEach(function (b) {
      if (!seen[key(b.q, b.r)]) out.push(b);
    });
    return out;
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
        bubbles.delete(key(b.q, b.r));
        toWorld(b.x, b.y, _w);
        cx += _w.x; cy += _w.y;
        pops.push({ x: _w.x, y: _w.y, color: b.color, t: 0 });
      });
      floats.push({
        x: cx / group.length, y: cy / group.length,
        text: '+' + pts, color: '#e2e8f0', t: 0
      });

      var orphans = findOrphans();
      if (orphans.length) {
        var bonus = orphans.length * PTS_DROP;
        gained += bonus;
        dropped += orphans.length;

        var ox = 0, oy = 0;
        orphans.forEach(function (b) {
          bubbles.delete(key(b.q, b.r));
          toWorld(b.x, b.y, _w);
          ox += _w.x; oy += _w.y;
          // Launched on the tangent it was travelling when its support went.
          var rx = _w.x - HUB_X, ry = _w.y - HUB_Y;
          var len = Math.hypot(rx, ry) || 1;
          falls.push({
            x: _w.x, y: _w.y,
            vx: -omega * ry + (rx / len) * 40,
            vy:  omega * rx + (ry / len) * 40 - 60,
            color: b.color, t: 0
          });
        });
        floats.push({
          x: ox / orphans.length, y: oy / orphans.length,
          text: '+' + bonus + ' DROP', color: '#fbbf24', t: 0
        });
      }
    }

    score += gained;
    recompute();
    afterShot();
  }

  function afterShot() {
    updateHud();

    if (bubbles.size === 0) { finish('win'); return; }

    // Decided here as well as per-frame, so a bubble that lands inside the
    // shooter's zone ends the run on the shot that put it there rather than
    // whenever the next frame happens to be drawn.
    measureShooterGap();
    if (shooterGap < SHOOTER_SAFE) { finish('reached'); return; }

    if (shotsUsed >= SHOT_LIMIT) { finish('out'); return; }
  }

  // Distance from the shooter to the nearest bubble, in the spinner's frame so
  // the whole cluster does not have to be transformed. Recomputed each frame:
  // the cluster keeps turning between shots, so an arm can arrive on its own.
  var shooterGap = Infinity;

  function measureShooterGap() {
    toLocal(HUB_X, SHOOTER_Y, _l);
    var sx = _l.x, sy = _l.y, best = Infinity;
    bubbles.forEach(function (b) {
      var dx = sx - b.x, dy = sy - b.y;
      var d = dx * dx + dy * dy;
      if (d < best) best = d;
    });
    shooterGap = Math.sqrt(best) - R;
  }

  // ── Spin ──────────────────────────────────────────────────────────────────

  function spinStep(dt) {
    theta += omega * dt;
    omega *= Math.pow(SPIN_DAMP, dt);
    if (Math.abs(omega) < OMEGA_FLOOR) omega = 0;
    if (theta > TAU) theta -= TAU;
    if (theta < -TAU) theta += TAU;
  }

  // ── Aim ───────────────────────────────────────────────────────────────────

  function setAim(px, py) {
    var dx = px - HUB_X, dy = py - SHOOTER_Y;
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
    var pts = [{ x: HUB_X, y: SHOOTER_Y }];
    var x = HUB_X, y = SHOOTER_Y;
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

    if (running && !ended) {
      if (shot) stepShot(dt);
      else spinStep(dt);
      measureShooterGap();
      if (shooterGap < SHOOTER_SAFE) finish('reached');
    } else {
      spinStep(dt);
      measureShooterGap();
    }

    stepEffects(dt);
    render();
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

    // Backdrop
    var bg = ctx.createRadialGradient(HUB_X, HUB_Y, R, HUB_X, HUB_Y, LH * 0.85);
    bg.addColorStop(0, '#152238');
    bg.addColorStop(1, '#080d18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, LW, LH);

    drawDanger();
    drawHub();

    bubbles.forEach(function (b) {
      toWorld(b.x, b.y, _w);
      drawBubble(_w.x, _w.y, b.color);
    });

    falls.forEach(function (f) {
      drawBubble(f.x, f.y, f.color, 1, 1 - f.t / FALL_MS);
    });

    pops.forEach(function (p) {
      var k = p.t / POP_MS;
      drawBubble(p.x, p.y, p.color, 1 + k * 0.75, 1 - k);
    });

    if (running && !ended && !shot) drawAim();
    if (shot) drawBubble(shot.x, shot.y, shot.color);

    drawShooter();
    drawFloats();
  }

  // The keep-out ring around the shooter. Invisible until the mass is within
  // a few bubbles of it, then it fades up — a warning that arrives in time to
  // be acted on rather than a permanent piece of furniture.
  function drawDanger() {
    var warnAt = SHOOTER_SAFE * 3.2;
    if (shooterGap > warnAt) return;
    var heat = clamp(1 - (shooterGap - SHOOTER_SAFE) / (warnAt - SHOOTER_SAFE), 0, 1);

    ctx.beginPath();
    ctx.arc(HUB_X, SHOOTER_Y, SHOOTER_SAFE, 0, TAU);
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(239,68,68,' + (0.18 + heat * 0.62).toFixed(3) + ')';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawHub() {
    ctx.save();
    ctx.translate(HUB_X, HUB_Y);

    ctx.beginPath();
    ctx.arc(0, 0, HUB_R + 3, 0, TAU);
    ctx.fillStyle = 'rgba(148,163,184,0.10)';
    ctx.fill();

    ctx.rotate(theta);

    var g = ctx.createRadialGradient(-HUB_R * 0.3, -HUB_R * 0.3, HUB_R * 0.15, 0, 0, HUB_R);
    g.addColorStop(0, '#94a3b8');
    g.addColorStop(1, '#33415a');
    ctx.beginPath();
    ctx.arc(0, 0, HUB_R, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();

    // Spokes. Without them a symmetrical hub gives no reading of how fast the
    // cluster is actually turning between shots.
    ctx.strokeStyle = 'rgba(15,23,42,0.75)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * HUB_R * 0.85, Math.sin(a) * HUB_R * 0.85);
      ctx.stroke();
    }
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

    // Barrel
    ctx.translate(HUB_X, SHOOTER_Y);
    ctx.rotate(aim);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, -R * 0.42, R * 2.1, R * 0.84);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(HUB_X, SHOOTER_Y, R * 1.5, 0, TAU);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    if (!shot && queue.length) drawBubble(HUB_X, SHOOTER_Y, queue[0]);

    // On deck
    if (queue.length > 1) {
      var nx = HUB_X + R * 3.6, ny = SHOOTER_Y;
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
    elScore.textContent   = score;
    elShots.textContent   = Math.max(0, SHOT_LIMIT - shotsUsed);
    elBubbles.textContent = bubbles.size;
    elBest.textContent    = best || '—';
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('cl-toast-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('cl-toast-on');
    }, 2400);
  }

  function finish(reason) {
    ended = true;
    running = false;

    var doubled = false;
    if (reason === 'win') { score *= 2; doubled = true; }

    if (score > best) {
      best = score;
      try { localStorage.setItem('cluster_best', String(best)); } catch (e) {}
    }
    updateHud();

    if (reason === 'win') {
      bannerEl.textContent = 'BOARD CLEARED — SCORE DOUBLED';
      bannerEl.style.background = '#15803d';
      bannerEl.classList.remove('hidden');
      titleEl.textContent = 'CLUSTER CLEARED';
      modalSubEl.textContent = 'Every bubble off the spinner with ' +
        (SHOT_LIMIT - shotsUsed) + ' shot' + (SHOT_LIMIT - shotsUsed === 1 ? '' : 's') + ' to spare.';
    } else if (reason === 'reached') {
      bannerEl.classList.add('hidden');
      titleEl.textContent = 'THE CLUSTER REACHED YOU';
      modalSubEl.textContent = 'It grew out to the shooter. Pop more than you feed it.';
    } else {
      bannerEl.classList.add('hidden');
      titleEl.textContent = 'OUT OF BUBBLES';
      modalSubEl.textContent = bubbles.size + ' bubble' + (bubbles.size === 1 ? '' : 's') + ' still hanging on.';
    }

    modalScoreEl.textContent = 'Score ' + score;

    var rows = [
      ['Matched', matched + ' bubble' + (matched === 1 ? '' : 's')],
      ['Dropped', dropped + ' bubble' + (dropped === 1 ? '' : 's') + ' (2×)'],
      ['Shots used', shotsUsed + ' of ' + SHOT_LIMIT]
    ];
    if (doubled) rows.push(['Full clear', 'score ×2']);
    rows.push(['Best', String(best)]);

    breakdownEl.innerHTML = rows.map(function (r) {
      return '<div class="bd-row"><span>' + r[0] + '</span><strong style="margin-left:auto">' + r[1] + '</strong></div>';
    }).join('');

    overlayEl.classList.remove('hidden');
  }

  function shareLine() {
    var head = ended && bubbles.size === 0 ? 'Cleared the cluster' : 'Cluster';
    return head + ' — ' + score + ' points, ' + matched + ' matched, ' +
      dropped + ' dropped, ' + shotsUsed + ' shots.\nhttps://www.thebunnygame.com/cluster';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function reset() {
    theta = 0; omega = 0;
    shot = null;
    queue = [];
    safeLeft = SAFE_SHOTS;
    freshAnnounced = false;
    score = 0; shotsUsed = 0; matched = 0; dropped = 0;
    pops = []; falls = []; floats = [];
    ended = false;
    aim = -Math.PI / 2;
    buildCluster();
    fillQueue();
    updateHud();
  }

  function startGame() {
    reset();
    running = true;
    startEl.classList.add('cl-hide');
    overlayEl.classList.add('hidden');
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
    elScore   = document.getElementById('val-score');
    elShots   = document.getElementById('val-shots');
    elBubbles = document.getElementById('val-bubbles');
    elBest    = document.getElementById('val-best');
    startEl   = document.getElementById('cl-start');
    toastEl   = document.getElementById('cl-toast');
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

    try { best = parseInt(localStorage.getItem('cluster_best'), 10) || 0; } catch (e) { best = 0; }

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
    document.getElementById('cl-play-btn').addEventListener('click', startGame);
    document.getElementById('play-again-btn').addEventListener('click', startGame);
    document.getElementById('share-btn').addEventListener('click', function () {
      shareText(shareLine(), 'Cluster — Bunny Game');
    });

    // A parked cluster on the splash screen so the board is not a dead
    // rectangle before the first click.
    reset();
    omega = 0.35;
    raf = requestAnimationFrame(frame);

    // Exposed for verification
    window.Cluster = {
      state: function () {
        return {
          mobile: MOBILE, w: LW, h: LH, r: R,
          bubbles: bubbles.size, theta: theta, omega: omega,
          maxR: maxR, inertia: inertia,
          score: score, shotsUsed: shotsUsed, matched: matched, dropped: dropped,
          safeLeft: safeLeft, queue: queue.slice(), ended: ended, running: running,
          inFlight: !!shot, shooterSafe: SHOOTER_SAFE, shooterGap: shooterGap
        };
      },
      aimAt: function (a) { aim = a; },
      fire: fire,
      start: startGame,
      // Runs a shot to completion without waiting on frames.
      settle: function (max) {
        var n = 0;
        while (shot && n++ < (max || 4000)) stepShot(1 / 240);
        return n;
      },
      spin: function (s) { var n = 0; while (n++ < s * 240) spinStep(1 / 240); },
      setOmega: function (v) { omega = v; },
      colorsOnBoard: boardColors,
      cells: function () {
        var out = [];
        bubbles.forEach(function (b) { out.push({ q: b.q, r: b.r, color: b.color }); });
        return out;
      }
    };
  });
}());
