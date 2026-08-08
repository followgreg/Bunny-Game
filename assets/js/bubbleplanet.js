// bubbleplanet.js — Bubble Planet
//
// A bubble shooter with no grid. Bubbles cluster around a cartoon alien planet
// in free space: a fired bubble sticks to the first thing it physically touches,
// wherever that is, at whatever angle it arrived. There is no lattice to snap to,
// so the mass grows into whatever shape the shots and the feed give it.
//
// That freedom is what makes the connection graph the centre of the game rather
// than a bookkeeping detail. Cluster could ask "which of my six hex neighbours
// exist"; here adjacency is a distance test, rebuilt whenever the mass changes,
// and everything downstream — colour matching, the orphan cascade, the combo —
// reads off that one graph.
//
// The whole cluster is stored in the planet's own unrotated frame and spun by a
// single angle at draw and collision time, the way Cluster does it. Nothing in
// the mass moves relative to anything else in it, so rigid-body spin is free and
// the graph only has to be rebuilt when a bubble is added or removed — never
// because the board turned.
//
// Part 1: physics, connection graph, first-contact attachment, match cascade,
// scoring, boundary collision. No rendering and no DOM — this file runs headless.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BubblePlanet = api;
}(typeof globalThis !== 'undefined' ? globalThis :
  typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  // ── Palette ───────────────────────────────────────────────────────────────

  var COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#FF6B81', '#FFA502', '#A55EEA'];
  // Red, Green, Blue, Pink, Orange, Purple

  // Three of the six are in play. Six colours made a match a one-in-six accident:
  // measured over full runs the player cleared about two bubbles a shot against
  // three arriving, so the mass only ever grew. At three colours the same player
  // pops more than twice as often and cascades roughly double. Sprites are still
  // built for all six, so this costs the render path nothing.
  var PALETTE = 3;
  function palette() { return COLORS.slice(0, PALETTE); }

  // ── Board / physics tunables ──────────────────────────────────────────────

  // One logical board, scaled to the viewport by CSS at render time, so the
  // game plays identically on a phone and a desktop and the 22px bubble in the
  // spec stays 22px in game units everywhere.
  // Widened from 560 after measuring board-clear rates: at 560 the cluster had
  // about four bubble rows of room before a wall, and a single spike reaching
  // one wall ends the run, so no board was ever cleared in 400 measured runs.
  // The board progression in the rules only exists if clearing is reachable.
  var LW = 640;               // logical board width
  var LH = 760;               // logical board height
  var R  = 22;                // bubble radius

  var PLANET_X = LW / 2;
  var PLANET_Y = 300;
  var PLANET_R = 60;

  var SHOOTER_X = LW / 2;
  var SHOOTER_Y = LH - 54;

  var SPEED       = R * 34;   // fired bubble, px/sec
  var INCOMING_SPEED = R * 20; // bubbles flying in from off-screen drift slower

  // Tolerance in the graph's adjacency test. The spec's 2px is strict tangency,
  // which suits a hex grid where a landing bubble is automatically adjacent to
  // two or three of its neighbours. There is no grid here: a bubble seats tangent
  // to the one thing it struck and often touches nothing else, so groups almost
  // never completed and the player cleared under two bubbles a shot against four
  // arriving. At 10px a landing bubble reads as touching the neighbours it is
  // visibly nestled against, which is both what the player expects and what
  // makes matching work — measured, it lifts clearing by a third and roughly
  // doubles the score.
  var TOUCH_SLOP  = 10;
  var MIN_MATCH   = 3;

  // Spin. Same model as Cluster: torque is r × v about the planet, so a shot
  // through the centre does not turn the mass at all and a glancing rim hit
  // turns it hard. The gain is an exaggeration — real mass ratios barely move
  // fifty bubbles.
  var SPIN_GAIN   = 26;
  var MAX_OMEGA   = 2.6;      // rad/sec
  var SPIN_DAMP   = 0.5;      // fraction of angular velocity surviving a second
  var OMEGA_FLOOR = 0.02;     // below this the cluster is treated as parked

  var ESCAPE_SPEED = 260;     // px/sec outward for a bubble flying off into space

  var PTS_DIRECT  = 10;       // per bubble in a colour match
  var PTS_CASCADE = 50;       // per bubble that loses its path back to the planet

  var TAU = Math.PI * 2;
  var AIM_MARGIN = 0.14;      // radians of dead zone either side of horizontal

  // ── Bubble ────────────────────────────────────────────────────────────────

  // x/y are in the planet's unrotated frame, with the planet centre at the
  // origin. wx/wy are the world positions, refreshed by spinStep once per frame
  // — the only place rotation is ever applied to the mass.
  function Bubble(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = R;
    this.connected = false;   // true once attached to the cluster
    this.id = Bubble.nextId++;
    this.wx = x;
    this.wy = y;
  }
  Bubble.nextId = 0;

  // ── Small helpers ─────────────────────────────────────────────────────────

  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // ── Connection graph ──────────────────────────────────────────────────────
  //
  // Every attached bubble is a node; an edge exists between two bubbles that are
  // physically touching, and between a bubble and the string 'planet' when it is
  // touching the planet itself. A bubble is held up only if some path through
  // this graph reaches 'planet'. Rebuilt on every change to the mass — the
  // positions are local, so a board that is merely turning does not invalidate it.

  function buildConnectionGraph(bubbles, planet) {
    var graph = new Map();
    var i, j;

    for (i = 0; i < bubbles.length; i++) graph.set(bubbles[i].id, new Set());

    for (i = 0; i < bubbles.length; i++) {
      var a = bubbles[i];
      for (j = i + 1; j < bubbles.length; j++) {
        var b = bubbles[j];
        if (distance(a, b) < a.radius + b.radius + TOUCH_SLOP) {
          graph.get(a.id).add(b.id);
          graph.get(b.id).add(a.id);
        }
      }
    }

    for (i = 0; i < bubbles.length; i++) {
      var c = bubbles[i];
      if (distance(c, planet) < c.radius + planet.radius + TOUCH_SLOP) {
        graph.get(c.id).add('planet');
      }
    }

    return graph;
  }

  // Breadth-first from the planet. Anything the walk never reaches is hanging on
  // nothing — that is the combo: it flies off whether or not it matched a colour.
  function getDisconnectedBubbles(bubbles, graph) {
    var reachable = new Set(['planet']);
    var queue = [];
    var i;

    for (i = 0; i < bubbles.length; i++) {
      var seed = graph.get(bubbles[i].id);
      if (seed && seed.has('planet')) {
        reachable.add(bubbles[i].id);
        queue.push(bubbles[i].id);
      }
    }

    var head = 0;
    while (head < queue.length) {
      var current = queue[head++];
      var neighbors = graph.get(current);
      if (!neighbors) continue;
      neighbors.forEach(function (n) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push(n);
        }
      });
    }

    var out = [];
    for (i = 0; i < bubbles.length; i++) {
      if (!reachable.has(bubbles[i].id)) out.push(bubbles[i]);
    }
    return out;
  }

  // ── Match detection ───────────────────────────────────────────────────────

  // Breadth-first from the bubble that just landed, through touching neighbours
  // of the same colour. Fewer than three and nothing happens — the caller gets
  // an empty array, not a group to pop.
  function findMatchingGroup(attachedBubble, clusterBubbles, graph) {
    var byId = new Map();
    for (var i = 0; i < clusterBubbles.length; i++) {
      byId.set(clusterBubbles[i].id, clusterBubbles[i]);
    }

    var color = attachedBubble.color;
    var group = new Set([attachedBubble.id]);
    var queue = [attachedBubble.id];
    var head = 0;

    while (head < queue.length) {
      var current = queue[head++];
      var neighbors = graph.get(current);
      if (!neighbors) continue;
      neighbors.forEach(function (nId) {
        if (group.has(nId) || nId === 'planet') return;
        var neighbor = byId.get(nId);
        if (neighbor && neighbor.color === color) {
          group.add(nId);
          queue.push(nId);
        }
      });
    }

    if (group.size < MIN_MATCH) return [];
    var out = [];
    group.forEach(function (id) { out.push(byId.get(id)); });
    return out;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  // Cascade bubbles pay five times a matched one. Cutting the mass loose is the
  // skill the game is actually about; matching three is only how you do it.
  function calculateScore(directMatches, cascadeMatches) {
    var directScore  = directMatches.length * PTS_DIRECT;
    var cascadeScore = cascadeMatches.length * PTS_CASCADE;
    var total = directScore + cascadeScore;
    var totalCleared = directMatches.length + cascadeMatches.length;

    var comboLabel = null;
    if      (totalCleared >= 25) comboLabel = 'INSANITY!';
    else if (totalCleared >= 18) comboLabel = 'LUDICROUS COMBO';
    else if (totalCleared >= 13) comboLabel = 'MEGA COMBO';
    else if (totalCleared >= 9)  comboLabel = 'DOUBLE COMBO';
    else if (totalCleared >= 6)  comboLabel = 'COMBO';

    return {
      directScore: directScore,
      cascadeScore: cascadeScore,
      total: total,
      comboLabel: comboLabel,
      totalCleared: totalCleared
    };
  }

  // ── Boundary and clear checks ─────────────────────────────────────────────

  // World space. Reads wx when the caller is the live game (kept up to date by
  // spinStep, so the check costs one pass and no allocation) and falls back to x
  // for plain objects handed in from a test.
  function checkBoundaryCollision(clusterBubbles, playAreaBounds) {
    for (var i = 0; i < clusterBubbles.length; i++) {
      var b = clusterBubbles[i];
      var x = b.wx === undefined ? b.x : b.wx;
      if (x - b.radius <= playAreaBounds.left) return true;
      if (x + b.radius >= playAreaBounds.right) return true;
    }
    return false;
  }

  function isBoardCleared(clusterBubbles) {
    return clusterBubbles.length === 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Game
  // ══════════════════════════════════════════════════════════════════════════

  var bubbles = [];           // the cluster, local frame
  var theta = 0, omega = 0;   // orientation and angular velocity
  var inertia = 1, maxR = 0;

  var shot = null;            // in-flight fired bubble, world coords
  var incoming = [];          // bubbles flying in from off-screen, world coords
  var escapes = [];           // bubbles flying off into space, world coords

  var aim = -Math.PI / 2;     // straight up
  var score = 0;
  var lastResolve = null;     // what the most recent shot cleared
  var dealing = false;        // true while a board is being laid out

  var planetLocal = { x: 0, y: 0, radius: PLANET_R };
  var bounds = { left: 0, right: LW, top: 0, bottom: LH };

  // ── Frame conversion ──────────────────────────────────────────────────────

  var _l = { x: 0, y: 0 };
  var _w = { x: 0, y: 0 };

  function toWorld(x, y, out) {
    var c = Math.cos(theta), s = Math.sin(theta);
    out.x = PLANET_X + x * c - y * s;
    out.y = PLANET_Y + x * s + y * c;
    return out;
  }

  function toLocal(x, y, out) {
    var c = Math.cos(theta), s = Math.sin(theta);
    var dx = x - PLANET_X, dy = y - PLANET_Y;
    out.x = dx * c + dy * s;
    out.y = -dx * s + dy * c;
    return out;
  }

  // ── Board construction ────────────────────────────────────────────────────

  // Board 1's splash cluster, dealt instantly by the same rule every board uses:
  // bubbles flying in from deep space, each sticking where it first makes contact.
  //
  // The concentric shells this replaced looked tidier and played dead. A full
  // ring of bubbles round the planet is two-connected — there is no single
  // bubble whose removal cuts anything loose — so the orphan cascade, which is
  // the whole combo mechanic and five sixths of the scoring, simply never fired.
  // Measured over whole runs it fired zero times. A swarm-built board is
  // irregular: it has arms, pockets and single points of attachment, so cutting
  // the mass loose is actually available to a player who aims for it.
  function buildClusterBySwarm(count) {
    bubbles.length = 0;
    Bubble.nextId = 0;
    incoming.length = 0;
    theta = 0; omega = 0;
    recompute();
    syncWorld();

    // Laying out a board is not play, and it must not be mistaken for it. This
    // runs through the same arrivals code that now pops matching groups, and
    // reset() is called while the previous run's phase is still 'playing' — so
    // without the flag the splash board scores itself as it is dealt, and a
    // player hitting New mid-game starts on a non-zero score.
    dealing = true;
    for (var i = 0; i < count; i++) {
      spawnIncoming(1);
      var guard = 0;
      while (incoming.length && guard++ < 6000) stepIncoming(1 / 240);
    }
    dealing = false;

    smoothColors();
    recompute();
    syncWorld();
  }

  // Two light passes of copying a neighbour's colour. Pure noise gives a board
  // with no readable shapes in it, and blobs are what there is to aim at.
  function smoothColors() {
    var graph = buildConnectionGraph(bubbles, planetLocal);
    var byId = new Map();
    bubbles.forEach(function (b) { byId.set(b.id, b); });

    for (var pass = 0; pass < 2; pass++) {
      bubbles.forEach(function (b) {
        if (Math.random() > 0.42) return;
        var ns = [];
        graph.get(b.id).forEach(function (n) { if (n !== 'planet') ns.push(n); });
        if (!ns.length) return;
        var n = byId.get(pick(ns));
        if (n) b.color = n.color;
      });
    }
  }

  // Moment of inertia about the planet, unit mass per bubble. Popping bubbles
  // lowers it, so a thinning cluster reacts harder to the same shot — the
  // difficulty curve comes free from the physics.
  function recompute() {
    var sum = 0, mx = 0;
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      var d2 = b.x * b.x + b.y * b.y;
      sum += d2;
      if (d2 > mx) mx = d2;
    }
    inertia = Math.max(sum, 40 * R * R);
    maxR = Math.sqrt(mx);
  }

  function syncWorld() {
    var c = Math.cos(theta), s = Math.sin(theta);
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      b.wx = PLANET_X + b.x * c - b.y * s;
      b.wy = PLANET_Y + b.x * s + b.y * c;
    }
  }

  // ── Spin ──────────────────────────────────────────────────────────────────

  function spinStep(dt) {
    theta += omega * dt;
    omega *= Math.pow(SPIN_DAMP, dt);
    if (Math.abs(omega) < OMEGA_FLOOR) omega = 0;
    if (theta > TAU) theta -= TAU;
    if (theta < -TAU) theta += TAU;
    syncWorld();
  }

  // ── First contact ─────────────────────────────────────────────────────────

  // The one contact predicate the whole game shares: the aiming preview, the
  // live shot, and an incoming bubble all ask it the same question, so what the
  // dotted line promises is exactly what the shot does.
  //
  // Returns { type: 'planet' } or { type: 'bubble', bubble } or null.
  function contactAt(wx, wy, radius) {
    toLocal(wx, wy, _l);
    var lx = _l.x, ly = _l.y;
    var d2 = lx * lx + ly * ly;

    // Cheap reject: nothing to hit beyond the cluster's own reach.
    var reach = maxR + radius + R;
    if (d2 > reach * reach && d2 > (PLANET_R + radius) * (PLANET_R + radius)) return null;

    var pr = PLANET_R + radius;
    if (d2 < pr * pr) return { type: 'planet' };

    var found = null, bestD = Infinity;
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      var dx = lx - b.x, dy = ly - b.y;
      var dd = dx * dx + dy * dy;
      var need = radius + b.radius;
      if (dd < need * need && dd < bestD) { bestD = dd; found = b; }
    }
    return found ? { type: 'bubble', bubble: found } : null;
  }

  // Walk a trajectory forward in short steps against a frozen cluster, banking
  // off the side walls, and stop at the first thing it would touch. This is the
  // spec's findFirstContact and the aiming line both — `points` is the polyline
  // the dotted line is drawn from.
  // One step of travel, shared by the aiming preview and the live shot.
  //
  // It is the bubble's CENTRE that travels, so it turns at walls inset by its own
  // radius rather than at the wall surface. Both callers were already doing that
  // correctly and both were already testing contact at radius + radius — what
  // they were not sharing was the step size, and that is what made the line lie:
  // the preview marched 2px at a time and the shot 4.8px, so the two found first
  // contact at different points along the same path. They now march identically.
  var MARCH_STEP = 1;         // px per sample — 1px for exactness
  var MAX_AIM_BOUNCES = 2;    // banks drawn on the preview

  function advanceBubble(p, dist) {
    p.x += p.dx * dist;
    p.y += p.dy * dist;

    var left  = p.radius;
    var right = LW - p.radius;

    // Reflect by forcing the sign rather than negating, so a step that lands
    // past a wall cannot flip twice and stick to it.
    if (p.x <= left)  { p.x = left;  p.dx = Math.abs(p.dx);  return true; }
    if (p.x >= right) { p.x = right; p.dx = -Math.abs(p.dx); return true; }
    return false;
  }

  function traceShot(startX, startY, angle, radius) {
    var p = { x: startX, y: startY,
              dx: Math.cos(angle), dy: Math.sin(angle), radius: radius };
    var points = [{ x: p.x, y: p.y }];
    var bounces = 0;

    for (var i = 0; i < 4000; i++) {
      if (advanceBubble(p, MARCH_STEP)) {
        points.push({ x: p.x, y: p.y });
        if (++bounces > MAX_AIM_BOUNCES) break;
      }

      if (p.y < -radius * 2) break;   // off the top is a clean miss

      var hit = contactAt(p.x, p.y, radius);
      if (hit) {
        points.push({ x: p.x, y: p.y });
        hit.contactPoint = { x: p.x, y: p.y };
        return { contact: hit, points: points, dir: { x: p.dx, y: p.dy } };
      }
    }

    points.push({ x: p.x, y: p.y });
    return { contact: null, points: points, dir: { x: p.dx, y: p.dy } };
  }

  // ── Where a bubble comes to rest ──────────────────────────────────────────
  //
  // The single place a resting position is decided. Both the aiming preview and
  // the fired bubble call it, so the ghost circle is drawn from the same number
  // the bubble is placed at — not a near-miss of it.
  //
  // This was the mismatch: the preview drew its circle at the contact point, the
  // position at which the march first detected overlap, while the bubble was
  // placed at the backed-off position where it actually sits. Those differ by up
  // to a step plus the back-off distance, which is exactly the gap a player sees
  // when a bubble that looked like it fit does not.
  //
  // Works in the planet's local frame, because that is where the cluster lives.
  function restingFromContact(contactWorld, approachWorld, radius, hit) {
    toLocal(contactWorld.x, contactWorld.y, _l);
    var probe = { x: _l.x, y: _l.y, radius: radius };

    if (approachWorld) {
      var c = Math.cos(theta), s = Math.sin(theta);
      var ax = approachWorld.x * c + approachWorld.y * s;
      var ay = -approachWorld.x * s + approachWorld.y * c;
      if (backOff(probe, ax, ay)) return probe;
    }

    // Nowhere clear along the approach: seat it tangent to whatever it struck and
    // push it out of anything else. Only `probe` moves — the cluster is untouched,
    // so the preview can run this too.
    var anchor = hit && hit.type === 'planet' ? planetLocal : (hit && hit.bubble);
    if (anchor) {
      var angle = Math.atan2(probe.y - anchor.y, probe.x - anchor.x);
      if (!isFinite(angle)) angle = 0;
      var seat = anchor.radius + radius;
      probe.x = anchor.x + seat * Math.cos(angle);
      probe.y = anchor.y + seat * Math.sin(angle);
      relaxPlacement(probe, anchor);
    }
    return probe;
  }

  // Trace plus resting position, in world coordinates. The one entry point for
  // "where would a shot fired on this heading end up".
  function findAttachmentPosition(startX, startY, angle, radius) {
    var trace = traceShot(startX, startY, angle, radius);
    if (!trace.contact) {
      return { points: trace.points, contact: null, hitType: 'miss',
               restingX: null, restingY: null };
    }
    var rest = restingFromContact(trace.contact.contactPoint, trace.dir, radius, trace.contact);
    toWorld(rest.x, rest.y, _w);
    return {
      points: trace.points,
      contact: trace.contact,
      hitType: trace.contact.type,
      hitTarget: trace.contact.type === 'planet' ? planetLocal : trace.contact.bubble,
      restingX: _w.x,
      restingY: _w.y
    };
  }

  function findFirstContact(firedBubble, trajectory) {
    var res = traceShot(trajectory.startX, trajectory.startY, trajectory.angle,
                        firedBubble.radius);
    return res.contact;
  }

  // ── Attachment ────────────────────────────────────────────────────────────

  // The fired bubble sits touching whatever it hit, on the bearing it arrived
  // from — not snapped to any grid.
  function attachBubble(firedBubble, contact) {
    // The honest placement, when the caller knows which way the bubble was
    // travelling: rewind along its own path to the exact moment it first made
    // contact. The step loop only detects a hit once the bubble is already a
    // little inside something, and the position one step earlier was in clear
    // space, so the first-touch position is somewhere between the two — and it
    // is non-overlapping by construction, which is the whole point.
    var rest = restingFromContact(contact.contactPoint, contact.approach,
                                  firedBubble.radius, contact);
    firedBubble.x = rest.x;
    firedBubble.y = rest.y;

    // A bubble still buried after all that has no legal place on this board;
    // refusing it keeps the mass consistent, where forcing it in would corrupt
    // every graph read taken afterwards.
    if (penetration(firedBubble.x, firedBubble.y, firedBubble.radius) > TOUCH_SLOP) {
      return null;
    }

    firedBubble.connected = true;
    bubbles.push(firedBubble);
    recompute();
    syncWorld();
    return firedBubble;
  }

  // How far the deepest thing at this position is inside the bubble. Zero is
  // exact tangency; negative is clear space. `skip` leaves one bubble out, for
  // when the bubble being tested is already in the cluster.
  function penetration(x, y, radius, skip) {
    var worst = (PLANET_R + radius) - Math.sqrt(x * x + y * y);
    for (var i = 0; i < bubbles.length; i++) {
      var o = bubbles[i];
      if (o === skip) continue;
      var dx = x - o.x, dy = y - o.y;
      var pen = (radius + o.radius) - Math.sqrt(dx * dx + dy * dy);
      if (pen > worst) worst = pen;
    }
    return worst;
  }

  // Walk the bubble backwards along its heading to the first position clear of
  // everything: coarse scan out to find a clear sample, then bisect onto the
  // exact tangency.
  //
  // The scan runs a long way back on purpose. One step is the usual case, but
  // the mass can grow down over the launch point — nothing in the rules stops it
  // — and a point-blank shot begins its flight already inside the cluster. When
  // even the full scan finds nowhere clear, the shot has no legal resting place
  // at all, and the caller is told so rather than handed a bubble buried in the
  // mass, which would put false edges in the graph and pop groups that are not
  // touching.
  function backOff(nb, dirx, diry) {
    var len = Math.hypot(dirx, diry);
    if (!len) return false;
    dirx /= len; diry /= len;

    var x0 = nb.x, y0 = nb.y;
    var span = R * 10, samples = 40;
    var hi = -1, lo = 0;

    for (var s = 1; s <= samples; s++) {
      var t = (s / samples) * span;
      if (penetration(x0 - dirx * t, y0 - diry * t, nb.radius) <= 0) { hi = t; break; }
      lo = t;
    }
    if (hi < 0) return false;

    for (var i = 0; i < 20; i++) {
      var mid = (lo + hi) / 2;
      if (penetration(x0 - dirx * mid, y0 - diry * mid, nb.radius) > 0) lo = mid;
      else hi = mid;
    }

    nb.x = x0 - dirx * hi;
    nb.y = y0 - diry * hi;
    return true;
  }

  // True when the mass has grown over the launch point, so there is nowhere for
  // the next bubble to start. Nothing in the rules ends a run for this — the
  // only stated loss is the side walls — so the engine reports it and leaves the
  // decision to the game loop.
  function shooterBlocked() {
    toLocal(SHOOTER_X, SHOOTER_Y, _l);
    return penetration(_l.x, _l.y, R) > 0;
  }

  // Straight overlap relaxation: push out of everything it is inside, including
  // the planet, and let it settle where it settles.
  //
  // An earlier version re-seated the bubble on its anchor after every push, to
  // guarantee it stayed touching the thing it hit. That deadlocks: when a
  // neighbour lies between the anchor and the bubble, the push is radial to the
  // anchor and the re-seat undoes it exactly, so the two fight to the iteration
  // cap and leave the bubble embedded 13px into its neighbour — every time, at
  // the same distance. Separating first and only then checking that it is still
  // in contact converges instead.
  function relaxPlacement(nb, anchor) {
    var SEP = 0.4;              // settle a hair inside contact, not a hair outside
    var i, dx, dy, d, need, push;

    for (var iter = 0; iter < 24; iter++) {
      var worst = 0;

      for (i = 0; i < bubbles.length; i++) {
        var o = bubbles[i];
        if (o === nb) continue;
        dx = nb.x - o.x; dy = nb.y - o.y;
        d = Math.sqrt(dx * dx + dy * dy);
        need = nb.radius + o.radius - SEP;
        if (d >= need) continue;
        if (d < 1e-6) { dx = Math.cos(iter); dy = Math.sin(iter); d = 1; }
        push = need - d;
        nb.x += (dx / d) * push;
        nb.y += (dy / d) * push;
        if (push > worst) worst = push;
      }

      // The planet is solid too — nothing may end up buried in it.
      d = Math.sqrt(nb.x * nb.x + nb.y * nb.y);
      need = PLANET_R + nb.radius - SEP;
      if (d < need) {
        if (d < 1e-6) { nb.x = need; nb.y = 0; }
        else {
          push = need - d;
          nb.x += (nb.x / d) * push;
          nb.y += (nb.y / d) * push;
          if (push > worst) worst = push;
        }
      }

      if (worst < 0.05) break;
    }

    seatIfLoose(nb, anchor);
  }

  // Separation can occasionally squeeze a bubble clear of the mass altogether.
  // A bubble touching nothing is not attached, so it is drawn back onto whatever
  // is nearest — its anchor if that is still the closest thing, otherwise the
  // neighbour that actually ended up nearest, which is just as honest a reading
  // of "sticks to what it touches".
  function seatIfLoose(nb, anchor) {
    var nearest = null, bestGap = Infinity, i, dx, dy, d, gap;

    for (i = 0; i < bubbles.length; i++) {
      var o = bubbles[i];
      if (o === nb) continue;
      dx = nb.x - o.x; dy = nb.y - o.y;
      d = Math.sqrt(dx * dx + dy * dy);
      gap = d - (nb.radius + o.radius);
      if (gap < bestGap) { bestGap = gap; nearest = o; }
    }

    d = Math.sqrt(nb.x * nb.x + nb.y * nb.y);
    gap = d - (PLANET_R + nb.radius);
    if (gap < bestGap) { bestGap = gap; nearest = planetLocal; }

    if (!nearest || bestGap < TOUCH_SLOP) return;   // already in contact

    dx = nb.x - nearest.x; dy = nb.y - nearest.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    var seat = nearest.radius + nb.radius - 0.5;
    nb.x = nearest.x + (dx / d) * seat;
    nb.y = nearest.y + (dy / d) * seat;
  }

  // ── The cascade ───────────────────────────────────────────────────────────

  // Everything the game is about happens here: the colour group goes, and then
  // anything the group was holding up goes with it.
  function resolve(placed) {
    var graph = buildConnectionGraph(bubbles, planetLocal);
    var group = findMatchingGroup(placed, bubbles, graph);

    if (!group.length) {
      lastResolve = { direct: [], cascade: [], score: calculateScore([], []) };
      return lastResolve;
    }

    removeBubbles(group);

    var graph2 = buildConnectionGraph(bubbles, planetLocal);
    var orphans = getDisconnectedBubbles(bubbles, graph2);
    if (orphans.length) removeBubbles(orphans);

    var result = calculateScore(group, orphans);
    score += result.total;

    group.forEach(function (b) { launchEscape(b, false); });
    orphans.forEach(function (b) { launchEscape(b, true); });

    recompute();
    syncWorld();

    lastResolve = { direct: group, cascade: orphans, score: result };
    return lastResolve;
  }

  function removeBubbles(list) {
    var doomed = new Set();
    list.forEach(function (b) { doomed.add(b.id); });
    var kept = [];
    for (var i = 0; i < bubbles.length; i++) {
      if (!doomed.has(bubbles[i].id)) kept.push(bubbles[i]);
    }
    bubbles.length = 0;
    for (var j = 0; j < kept.length; j++) bubbles.push(kept[j]);
  }

  // Off into space, radially outward from the planet, carrying whatever tangential
  // velocity the spin was giving it when its support went.
  function launchEscape(b, wasCascade) {
    var wx = b.wx, wy = b.wy;
    var rx = wx - PLANET_X, ry = wy - PLANET_Y;
    var len = Math.hypot(rx, ry) || 1;
    var spread = (Math.random() - 0.5) * 0.9;
    var ux = (rx / len) * Math.cos(spread) - (ry / len) * Math.sin(spread);
    var uy = (rx / len) * Math.sin(spread) + (ry / len) * Math.cos(spread);
    var speed = ESCAPE_SPEED * (wasCascade ? 1.25 : 1) * (0.85 + Math.random() * 0.4);

    escapes.push({
      x: wx, y: wy,
      vx: ux * speed + (-omega * ry),
      vy: uy * speed + ( omega * rx),
      color: b.color,
      cascade: wasCascade,
      t: 0,
      trail: []
    });
  }

  // ── The projectile ────────────────────────────────────────────────────────

  function setAim(px, py) {
    var dx = px - SHOOTER_X, dy = py - SHOOTER_Y;
    if (dy > -1) {
      aim = dx >= 0 ? -AIM_MARGIN : -Math.PI + AIM_MARGIN;
    } else {
      aim = clamp(Math.atan2(dy, dx), -Math.PI + AIM_MARGIN, -AIM_MARGIN);
    }
  }

  function fire(color) {
    if (shot) return null;
    shot = {
      x: SHOOTER_X, y: SHOOTER_Y,
      vx: Math.cos(aim) * SPEED,
      vy: Math.sin(aim) * SPEED,
      color: color || pick(palette()),
      radius: R
    };
    return shot;
  }

  // Walk the projectile forward in short steps, advancing the cluster with it,
  // so a fast shot cannot tunnel through a one-bubble-thick wall and so the
  // mass it hits is the mass that has turned underneath it in flight.
  // The live shot walks the identical path: same step length, same reflection,
  // same contact test. The one thing the preview cannot know about is the spin —
  // the cluster keeps turning while the bubble is in the air, so a board that is
  // moving will land the shot somewhere the frozen line did not predict. That is
  // the mechanic, not a defect; against a parked board the two agree exactly.
  function stepShot(dt) {
    var speed = Math.hypot(shot.vx, shot.vy);
    if (!speed) return null;

    var p = { x: shot.x, y: shot.y,
              dx: shot.vx / speed, dy: shot.vy / speed, radius: R };
    var remaining = dt * speed;      // distance to cover this frame

    while (remaining > 0 && shot) {
      var d = Math.min(remaining, MARCH_STEP);
      remaining -= d;

      advanceBubble(p, d);
      shot.x = p.x; shot.y = p.y;
      shot.vx = p.dx * speed; shot.vy = p.dy * speed;

      spinStep(d / speed);

      if (shot.y < -R * 2) { shot = null; return { missed: true }; }

      var hit = contactAt(shot.x, shot.y, R);
      if (hit) {
        hit.contactPoint = { x: shot.x, y: shot.y };
        hit.approach = { x: shot.vx, y: shot.vy };
        return land(hit, shot.color, shot.x, shot.y, shot.vx, shot.vy);
      }
    }
    return null;
  }

  // Impulse first, while the projectile's velocity is still real. Torque is
  // r × v_rel about the planet: measured against the velocity of the spinning
  // surface rather than the world, so a cluster already turning fast cannot be
  // spun up without limit.
  function land(hit, color, x, y, vx, vy) {
    var rx = x - PLANET_X, ry = y - PLANET_Y;
    var vrx = vx - (-omega * ry);
    var vry = vy - ( omega * rx);
    omega = clamp(omega + SPIN_GAIN * (rx * vry - ry * vrx) / inertia, -MAX_OMEGA, MAX_OMEGA);

    shot = null;

    var nb = new Bubble(0, 0, color);
    if (!attachBubble(nb, hit)) return { refused: true };
    return resolve(nb);
  }

  // ── Incoming bubbles ──────────────────────────────────────────────────────

  var SECT = 24;

  // How far in a bubble arriving on this bearing would actually get before it
  // touched something. This is the real currency, not how thick the mass looks:
  // an arrival lands wherever it first makes contact, so a bearing pointing at a
  // hole the player has just punched lets the bubble travel deep and land inside
  // the mass, while a bearing pointing at intact shell leaves it sitting on the
  // outside.
  function probeLandingRadius(a) {
    var ux = Math.cos(a), uy = Math.sin(a);
    var start = Math.max(launchDistance(ux, uy), maxR) + R * 2;
    for (var d = start; d > PLANET_R; d -= R * 0.4) {
      if (contactAt(PLANET_X + ux * d, PLANET_Y + uy * d, R)) return d;
    }
    return PLANET_R + R;
  }

  // Bearings for a whole batch of arrivals, decided together and biased toward
  // the deepest way in.
  //
  // Two things had to be got right here, both found by measurement.
  //
  // First, timing: arrivals are staggered 80ms apart but each is in the air for
  // the best part of a second, so if each picks its own bearing on launch they
  // all read the same cluster, all pick the same gap, and land on top of each
  // other. Choosing the batch together fixes that.
  //
  // Second, and the one that actually decided whether the game was playable at
  // all: a bubble flying in from outside can only ever land on the outer
  // surface, so the mass grew about one bubble-width per shot no matter how well
  // the board was played, and every run died against a wall in three to six
  // shots. Steering arrivals into the hollows instead means popping the middle
  // of the mass buys back room — the feed fills the hole rather than adding
  // another coat.
  function pickSpreadBearings(n, greedy) {
    var cands = [], i;
    var shallowest = 0;

    for (i = 0; i < SECT; i++) {
      var a = ((i + 0.5) / SECT) * TAU;
      var d = probeLandingRadius(a);
      cands.push({ a: a, d: d });
      if (d > shallowest) shallowest = d;
    }

    // Laying out a fresh board takes the deepest way in every time rather than
    // sampling, which starts the board compact instead of sprawled.
    if (greedy) {
      cands.sort(function (p, q) { return p.d - q.d; });
      var got = [];
      for (i = 0; i < n; i++) {
        var c = cands[i % cands.length];
        got.push(c.a + (Math.random() - 0.5) * (TAU / SECT) * 0.7);
      }
      return got;
    }

    var out = [];
    for (var k = 0; k < n; k++) {
      var total = 0, j;
      for (j = 0; j < cands.length; j++) {
        // Shallower landing radius — further in — weighs far more.
        cands[j].w = Math.pow((shallowest - cands[j].d) + R, 2);
        total += cands[j].w;
      }
      if (!total || !cands.length) { out.push(Math.random() * TAU); continue; }

      var roll = Math.random() * total;
      for (j = 0; j < cands.length; j++) {
        roll -= cands[j].w;
        if (roll <= 0) break;
      }
      if (j >= cands.length) j = cands.length - 1;

      out.push(cands[j].a + (Math.random() - 0.5) * (TAU / SECT) * 0.7);
      cands.splice(j, 1);          // one arrival per bearing per batch
    }
    return out;
  }

  function spawnIncoming(count, bearing, greedy, color) {
    var bearings = bearing === undefined ? pickSpreadBearings(count, greedy) : [bearing];
    for (var i = 0; i < count; i++) {
      var a = bearings[i % bearings.length];
      // Beyond the board edge *and* beyond the cluster. Taking the edge alone
      // spawns the bubble already buried in the mass on any board where the
      // cluster has outgrown the frame, and a bubble that starts inside
      // something has no first contact to find.
      var launch = Math.max(launchDistance(Math.cos(a), Math.sin(a)), maxR) + R * 2;
      var x = PLANET_X + Math.cos(a) * launch;
      var y = PLANET_Y + Math.sin(a) * launch;
      // Straight at the planet. An earlier version added ±0.25rad of sideways
      // bias for variety, which over a 300px approach is up to 75px of drift —
      // enough to miss the bearing that was chosen for it entirely and graze the
      // rim tangentially, sticking far out on the side.
      var toward = Math.atan2(PLANET_Y - y, PLANET_X - x) + (Math.random() - 0.5) * 0.06;
      incoming.push({
        x: x, y: y,
        vx: Math.cos(toward) * INCOMING_SPEED,
        vy: Math.sin(toward) * INCOMING_SPEED,
        color: color || pick(palette()),
        radius: R
      });
    }
  }

  // Where a ray leaving the planet on this heading crosses the edge of the
  // board. Starting one bubble beyond that keeps the flight visible instead of
  // spending most of it outside the frame on the short axis.
  function launchDistance(ux, uy) {
    var tx = ux > 0 ? (LW - PLANET_X) / ux : ux < 0 ? -PLANET_X / ux : Infinity;
    var ty = uy > 0 ? (LH - PLANET_Y) / uy : uy < 0 ? -PLANET_Y / uy : Infinity;
    return Math.min(tx, ty);
  }

  // ── Board assembly ────────────────────────────────────────────────────────
  //
  // A new board is dealt as a swarm: startingClusterSize bubbles launched from
  // random off-screen bearings at 40ms intervals, each sticking where it first
  // makes contact — on the planet for the first arrivals, on the mass for the
  // rest. It runs through the same pending/incoming machinery the per-shot
  // arrivals use, so board layout and in-play pressure obey one attachment rule.
  //
  // Worth knowing what this costs, because it was measured: bubbles that stick
  // where they first touch pack at roughly half the density of a laid-out board,
  // so a swarm-dealt cluster is noticeably wider than the same count arranged by
  // hand. At the sizes in BOARD_CONFIG that is affordable; it was not at the 44
  // this replaced.
  function beginAssembly(boardNum, stagger) {
    queueArrivals(boardSize(boardNum), stagger, true);
  }

  function stepIncoming(dt) {
    var landed = [];
    for (var i = incoming.length - 1; i >= 0; i--) {
      var f = incoming[i];
      var speed = Math.hypot(f.vx, f.vy);
      var remaining = dt;
      var maxStep = (R * 0.22) / speed;
      var done = false;

      while (remaining > 0 && !done) {
        var d = Math.min(remaining, maxStep);
        remaining -= d;
        f.x += f.vx * d;
        f.y += f.vy * d;

        var hit = contactAt(f.x, f.y, R);
        if (hit) {
          hit.contactPoint = { x: f.x, y: f.y };
          hit.approach = { x: f.vx, y: f.vy };
          incoming.splice(i, 1);
          var nb = new Bubble(0, 0, f.color);
          if (attachBubble(nb, hit)) {
            landed.push(nb);
            // An arrival that completes a colour group blows it up and pays for
            // it, exactly as a shot would.
            //
            // Only while the board is in play, though. Board layout runs through
            // this same code, and a board that pops itself as it is being dealt
            // never finishes arriving — the swarm would eat its own work.
            if (phase === 'playing' && !dealing) {
              var res = resolve(nb);
              if (res && res.direct.length) creditResolve(res);
            }
          }
          done = true;
        }
      }

      // A bubble that somehow crossed the whole board without touching anything
      // has nothing left to reach; drop it rather than let it orbit forever.
      if (!done && Math.hypot(f.x - PLANET_X, f.y - PLANET_Y) > Math.max(LW, LH)) {
        incoming.splice(i, 1);
      }
    }
    return landed;
  }

  // ── Escapes ───────────────────────────────────────────────────────────────

  var ESCAPE_LIFE = 1.4;      // seconds
  var TRAIL_MAX = 10;         // capped — the spec's trail grows without bound

  function stepEscapes(dt) {
    for (var i = escapes.length - 1; i >= 0; i--) {
      var e = escapes[i];
      e.t += dt;

      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > TRAIL_MAX) e.trail.shift();

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (e.t > ESCAPE_LIFE ||
          e.x < -R * 6 || e.x > LW + R * 6 ||
          e.y < -R * 6 || e.y > LH + R * 6) {
        escapes.splice(i, 1);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Game loop
  // ══════════════════════════════════════════════════════════════════════════

  // 'idle'       — splash, board turning, no input
  // 'playing'    — accepting shots
  // 'clearing'   — board emptied, celebration running
  // 'assembling' — the next board is flying in
  // 'over'       — run finished, modal up
  var phase = 'idle';

  var board = 1;
  var bubblesPerShot = 3;
  var shotsFired = 0;
  var matched = 0, cascaded = 0, boardsCleared = 0;
  var best = 0;
  var queue = [];             // [current, next] colours

  var pending = [];           // staggered arrivals waiting on their delay
  var floats = [];            // rising score text
  var sparks = [];            // celebration particles
  var combos = [];            // combo badges over the board
  var flash = 0;              // screen wipe, 1 → 0
  var flashColor = '#FFD700';
  var flashMs = 400;
  var overHold = -1;          // counts down from the red flash to the modal
  var celebration = null;
  var clearTimer = 0;
  var endReason = null;

  // One colour for every bubble that arrives on this board. Chosen when the
  // board starts and held until it is cleared, so the threat a player is playing
  // against stays the same shape for the whole board instead of changing under
  // them shot by shot.
  var boardIncomingColor = null;

  // Each tier louder than the last: hotter colour, bigger type. INSANITY! is the
  // only one that keeps moving once it has landed.
  var COMBO_TIERS = {
    'COMBO':           { color: '#FFD700', size: 24 },
    'DOUBLE COMBO':    { color: '#FF8C00', size: 28 },
    'MEGA COMBO':      { color: '#FF4500', size: 33 },
    'LUDICROUS COMBO': { color: '#FF0080', size: 38 },
    'INSANITY!':       { color: '#FF00FF', size: 46, pulse: true }
  };

  var COMBO_LIFE = 1.5;       // seconds on screen before it goes
  var FLOAT_LIFE = 1.2;
  var FLOAT_RISE = 60;        // px a floating score climbs over its life

  var PTS_BOARD = 1000;
  var MAX_PER_SHOT = 5;    // arrivals never exceed five, on any board
  var FEED_EVERY = 1;         // shots between arrivals
  var STAGGER = 0.08;         // 80ms between arrivals after a shot
  var SWARM_STAGGER = 0.04;   // 40ms during a board assembly

  var BOARD_CONFIG = {
    1: { bubblesPerShot: 3, startingClusterSize: 20 },
    2: { bubblesPerShot: 5, startingClusterSize: 24 },
    3: { bubblesPerShot: 5, startingClusterSize: 28 },
    4: { bubblesPerShot: 5, startingClusterSize: 32 },
    5: { bubblesPerShot: 5, startingClusterSize: 36 }
  };

  // Arrivals are capped at five on every board. The table below still climbs to
  // five and then holds, so board 2 onward all run at five and the difficulty
  // after that comes from the board getting bigger rather than from the feed
  // getting heavier. Above five the mass outgrows the frame faster than any
  // player can cut it back, which made every later board a formality.
  function getBoardConfig(n) {
    var cfg = n <= 5 ? BOARD_CONFIG[n] : { bubblesPerShot: 5, startingClusterSize: 40 };
    return {
      bubblesPerShot: Math.min(cfg.bubblesPerShot, MAX_PER_SHOT),
      startingClusterSize: cfg.startingClusterSize
    };
  }

  function bubblesPerShotFor(n) { return getBoardConfig(n).bubblesPerShot; }
  function boardSize(n) { return getBoardConfig(n).startingClusterSize; }

  // Bearings are chosen for the batch here, at queue time, rather than by each
  // arrival as it launches — see pickSpreadBearings for why that distinction
  // decides whether the mass grows round or grows a spike.
  function queueArrivals(count, stagger, swarm) {
    var bearings = pickSpreadBearings(count, !!swarm);

    // Arrivals take the board's locked colour, not a fresh one per wave.
    //
    // Board layout is exempt. It runs through this same queue, and a whole board
    // dealt in one colour would be a solid block of it.
    var waveColor = swarm ? null : boardIncomingColor;

    for (var i = 0; i < count; i++) {
      pending.push({ delay: i * stagger, swarm: !!swarm,
                     bearing: bearings[i], color: waveColor });
    }
  }

  function stepPending(dt) {
    for (var i = pending.length - 1; i >= 0; i--) {
      pending[i].delay -= dt;
      if (pending[i].delay <= 0) {
        var bearing = pending[i].bearing;
        var color = pending[i].color;
        pending.splice(i, 1);
        spawnIncoming(1, bearing, false, color);
      }
    }
  }

  // ── Shot queue ────────────────────────────────────────────────────────────

  // Draw from the colours actually on the board where possible. A shot in a
  // colour that is nowhere on the cluster cannot match anything, and on a board
  // down to its last two colours a full-palette draw is mostly dead shots.
  function nextColor() {
    var seen = {}, live = [];
    for (var i = 0; i < bubbles.length; i++) {
      if (!seen[bubbles[i].color]) { seen[bubbles[i].color] = 1; live.push(bubbles[i].color); }
    }
    if (!live.length) return pick(palette());
    // A little off-board colour keeps it from being a pure sorting exercise.
    return Math.random() < 0.88 ? pick(live) : pick(palette());
  }

  function fillQueue() {
    while (queue.length < 2) queue.push(nextColor());
  }

  // ── Firing ────────────────────────────────────────────────────────────────

  function fireShot() {
    if (phase !== 'playing' || shot) return false;
    var color = queue.shift();
    fillQueue();
    shotsFired++;
    fire(color);
    return true;
  }

  // Everything that happens once a shot has come to rest.
  // Counters, floating score and combo badge for any resolve, whoever caused it.
  function creditResolve(result) {
    matched += result.direct.length;
    cascaded += result.cascade.length;
    showResolve(result);
    updateHud();
  }

  function afterShot(result) {
    if (result && result.direct && result.direct.length) creditResolve(result);

    updateHud();

    if (isBoardCleared(bubbles)) { beginBoardClear(); return; }
    if (wallHit()) { finish('wall'); return; }
    if (shooterBlocked()) { finish('reached'); return; }

    if (shotsFired % FEED_EVERY === 0) queueArrivals(bubblesPerShot, STAGGER, false);
  }

  function showResolve(result) {
    var s = result.score;
    var cx = 0, cy = 0, n = 0, i;
    for (i = 0; i < result.direct.length; i++) { cx += result.direct[i].wx; cy += result.direct[i].wy; n++; }
    for (i = 0; i < result.cascade.length; i++) { cx += result.cascade[i].wx; cy += result.cascade[i].wy; n++; }
    if (!n) return;

    showFloatingScore('+' + s.total, cx / n, cy / n, '#FFD700', 26);
    if (s.comboLabel) showComboText(s.comboLabel, cx / n, cy / n - 52);
  }

  function showFloatingScore(text, x, y, color, size) {
    floats.push({ x: x, y: y, text: text, color: color || '#FFD700',
                  size: size || 26, t: 0 });
  }

  function showComboText(label, x, y) {
    var tier = COMBO_TIERS[label];
    if (!tier) return;
    combos.push({ text: label, x: x, y: y, t: 0,
                  color: tier.color, size: tier.size, pulse: !!tier.pulse });
    burst(x, y + 42, Math.min(48, tier.size), tier.color);
  }

  // ── Board clear ───────────────────────────────────────────────────────────

  function beginBoardClear() {
    phase = 'clearing';
    boardsCleared++;
    score += PTS_BOARD;
    flashScreen('#FFD700', 400);
    clearTimer = 0;
    celebration = { text: 'BOARD ' + board + ' CLEARED!', t: 0 };
    showFloatingScore('+' + PTS_BOARD + ' BOARD BONUS!', PLANET_X, PLANET_Y - 40, '#00FF7F', 28);
    burst(PLANET_X, PLANET_Y, 60, '#FFD700');
    updateHud();
  }

  function stepClear(dt) {
    clearTimer += dt;
    // The swarm starts while the celebration is still on screen — waiting for it
    // to finish first leaves a dead half-second staring at an empty board.
    if (clearTimer > 0.8) {
      board++;
      bubblesPerShot = bubblesPerShotFor(board);
      boardIncomingColor = pick(palette());
      phase = 'assembling';
      clearTimer = 0;
      beginAssembly(board, SWARM_STAGGER);
      updateHud();
    }
  }

  function stepAssemble(dt) {
    if (pending.length || incoming.length) return;
    clearTimer += dt;
    if (clearTimer > 0.3) {          // brief beat after the last bubble lands
      phase = 'playing';
      clearTimer = 0;
      fillQueue();
      toast('Board ' + board + ' — ' + bubblesPerShot + ' bubbles fly in per shot');
    }
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  function flashScreen(color, ms) {
    flashColor = color;
    flashMs = ms;
    flash = 1;
  }

  function burst(x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      var sp = 60 + Math.random() * 260;
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: color, t: 0, life: 0.5 + Math.random() * 0.7,
        size: 1.5 + Math.random() * 2.5
      });
    }
  }

  function stepParticles(dt) {
    var i;
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.97; s.vy *= 0.97;
      if (s.t > s.life) sparks.splice(i, 1);
    }
    for (i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      floats[i].y -= (FLOAT_RISE / FLOAT_LIFE) * dt;
      if (floats[i].t > FLOAT_LIFE) floats.splice(i, 1);
    }
    for (i = combos.length - 1; i >= 0; i--) {
      combos[i].t += dt;
      // Rises at the same rate as the floating score below it. Left static, the
      // score climbs into the badge and the two print on top of each other,
      // which is exactly what happened on the first pass.
      combos[i].y -= (FLOAT_RISE / FLOAT_LIFE) * dt;
      if (combos[i].t > COMBO_LIFE) combos.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt / (flashMs / 1000));

    // The modal is held back until the red flash has been seen. Presenting it on
    // the same frame the run ends puts the card over the top of the thing that
    // killed you, so you never get to see it.
    if (overHold > 0) {
      overHold -= dt;
      if (overHold <= 0) { overHold = -1; showModal(endReason); }
    }
    if (celebration) {
      celebration.t += dt;
      if (celebration.t > 1.6) celebration = null;
    }
  }

  // ── One frame of simulation ───────────────────────────────────────────────

  function step(dt) {
    var landed = null;

    if (shot) {
      landed = stepShot(dt);
    } else {
      spinStep(dt);
    }

    // Resolved immediately, before anything else can touch the board. Run after
    // the arrivals instead and a bubble that happens to land on the same frame
    // refills the cluster before the board-clear check reads it, so the clear is
    // silently missed and play carries on over a board the player had emptied.
    if (landed) afterShot(landed.refused || landed.missed ? null : landed);

    stepPending(dt);
    stepIncoming(dt);
    stepEscapes(dt);
    stepParticles(dt);

    if (phase === 'clearing') stepClear(dt);
    else if (phase === 'assembling') stepAssemble(dt);

    // An arrival can now empty the board as well as a shot can, and the clear has
    // to be caught here because nothing else is watching after a shot has already
    // resolved. Anything still queued is dropped: the player earned the clear, so
    // the rest of the wave should not be allowed to land on an empty planet and
    // take it back.
    if (phase === 'playing' && !shot && isBoardCleared(bubbles)) {
      pending.length = 0;
      incoming.length = 0;
      beginBoardClear();
    }

    // The mass is turning the whole time, so a cluster that was clear a moment
    // ago can bring an arm round into a wall with no shot involved at all.
    if (phase === 'playing' && !shot && wallHit()) finish('wall');
  }

  function wallHit() {
    return checkBoundaryCollision(bubbles, bounds);
  }

  function reset(shells) {
    theta = 0; omega = 0;
    shot = null;
    incoming.length = 0;
    escapes.length = 0;
    pending.length = 0;
    floats.length = 0;
    sparks.length = 0;
    flash = 0;
    combos.length = 0;
    overHold = -1;
    celebration = null;
    clearTimer = 0;
    score = 0;
    lastResolve = null;
    aim = -Math.PI / 2;
    buildClusterBySwarm(boardSize(1));
  }

  function startGame() {
    reset();
    board = 1;
    bubblesPerShot = bubblesPerShotFor(1);
    boardIncomingColor = pick(palette());
    shotsFired = 0;
    matched = 0; cascaded = 0; boardsCleared = 0;
    endReason = null;
    queue.length = 0;
    fillQueue();

    // Board 1 is dealt the same way every board after it is: the splash board
    // built by reset() is cleared off and the swarm flies in, so the run opens on
    // the same sequence a board clear does.
    bubbles.length = 0;
    recompute();
    syncWorld();
    phase = 'assembling';
    clearTimer = 0;
    beginAssembly(1, SWARM_STAGGER);
    if (startEl) startEl.classList.add('bp-hide');
    if (overlayEl) overlayEl.classList.add('hidden');
    updateHud();
  }

  function finish(reason) {
    if (phase === 'over') return;
    phase = 'over';
    endReason = reason;

    recordBest();
    updateHud();
    flashScreen('#FF0000', 300);
    overHold = 0.4;
  }

  // Kept current the moment it is beaten rather than only at the end of a run,
  // so the number in the bar is always true — a player who closes the tab
  // mid-run still keeps what they earned.
  function recordBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem('bubbleplanet_bestScore', String(best)); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Render
  //
  //  Everything below needs a document. The engine above does not, which is what
  //  lets the whole simulation be tested headlessly.
  // ══════════════════════════════════════════════════════════════════════════

  var canvas, ctx, wrap;
  var startEl, toastEl, overlayEl, titleEl, modalScoreEl, modalSubEl, breakdownEl, bannerEl;
  var elScore, elBoard, elBubbles, elBest;
  var DPR = 1;
  var starLayer = null;        // pre-rendered star field
  var twinklers = [];          // the ~20% that breathe, drawn live on top
  var sprites = {};
  var SPRITE_BOX = 0;
  var lastTime = null, raf = null;
  var clock = 0;

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

  // ── Star field ────────────────────────────────────────────────────────────
  //
  // Baked into one offscreen canvas and blitted as a single drawImage. Ninety
  // separate arcs a frame is real cost for something that never moves; only the
  // handful that twinkle are drawn live.

  function buildStars() {
    var c = document.createElement('canvas');
    c.width = Math.ceil(LW * DPR);
    c.height = Math.ceil(LH * DPR);
    var g = c.getContext('2d');
    g.scale(DPR, DPR);

    twinklers.length = 0;

    for (var i = 0; i < 92; i++) {
      var x = Math.random() * LW;
      var y = Math.random() * LH;
      var size = Math.random() < 0.72 ? 1 : 2;
      var alpha = 0.4 + Math.random() * 0.5;

      if (Math.random() < 0.2) {
        // Held out of the baked layer so it can breathe on its own phase.
        twinklers.push({ x: x, y: y, size: size, alpha: alpha,
                         phase: Math.random() * TAU,
                         rate: 0.6 + Math.random() * 1.1 });
        continue;
      }

      g.globalAlpha = alpha;
      g.fillStyle = Math.random() < 0.14 ? '#cfe3ff' : '#ffffff';
      g.fillRect(x, y, size, size);
    }
    g.globalAlpha = 1;
    starLayer = c;
  }

  function drawStars() {
    ctx.drawImage(starLayer, 0, 0, LW, LH);
    for (var i = 0; i < twinklers.length; i++) {
      var t = twinklers[i];
      var k = 0.55 + 0.45 * Math.sin(clock * t.rate + t.phase);
      ctx.globalAlpha = t.alpha * k;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(t.x, t.y, t.size, t.size);
    }
    ctx.globalAlpha = 1;
  }

  // ── Bubble sprites ────────────────────────────────────────────────────────
  //
  // Slope's marble glass, in colour: a radial gradient lit from the top left,
  // an elliptical specular glint, and a rim light picking out the edge against
  // the dark. Baked per colour rather than built per bubble per frame — a
  // hundred radial gradients a frame is not worth paying for, and the light
  // source is fixed, so the glint is the same on every one.

  function buildSprites() {
    SPRITE_BOX = R * 2 + 6;
    var px = Math.ceil(SPRITE_BOX * DPR);

    COLORS.forEach(function (color) {
      var c = document.createElement('canvas');
      c.width = px; c.height = px;
      var g = c.getContext('2d');
      g.scale(DPR, DPR);
      var m = SPRITE_BOX / 2;

      var grad = g.createRadialGradient(m - R * 0.30, m - R * 0.35, R * 0.05, m, m, R);
      grad.addColorStop(0,   shade(color, 0.60));
      grad.addColorStop(0.4, color);
      grad.addColorStop(1,   shade(color, -0.40));

      g.beginPath();
      g.arc(m, m, R, 0, TAU);
      g.fillStyle = grad;
      g.fill();

      // Rim light. Against a near-black sky a coloured sphere loses its edge
      // completely without it.
      g.beginPath();
      g.arc(m, m, R - 0.75, 0, TAU);
      g.strokeStyle = 'rgba(255,255,255,0.20)';
      g.lineWidth = 1.5;
      g.stroke();

      // The glint is an ellipse, not a circle — a round dot reads as a hole
      // punched in the sphere, a raked ellipse reads as a lit surface.
      g.beginPath();
      g.ellipse(m - R * 0.30, m - R * 0.34, R * 0.26, R * 0.16, -0.6, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.70)';
      g.fill();

      // A second, much smaller catchlight below it. One highlight looks painted
      // on; two read as glass.
      g.beginPath();
      g.arc(m + R * 0.28, m + R * 0.30, R * 0.10, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fill();

      sprites[color] = c;
    });
  }

  function drawBubble(x, y, color, scale, alpha) {
    var s = SPRITE_BOX * (scale === undefined ? 1 : scale);
    if (alpha !== undefined && alpha < 1) {
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.drawImage(sprites[color], x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(sprites[color], x - s / 2, y - s / 2, s, s);
    }
  }

  // ── The planet ────────────────────────────────────────────────────────────

  var CRATERS = [
    { ox: -0.30, oy: -0.20, r: 0.15 },
    { ox:  0.20, oy:  0.30, r: 0.10 },
    { ox: -0.10, oy:  0.40, r: 0.08 },
    { ox:  0.34, oy: -0.28, r: 0.07 }
  ];

  // Teal landmasses, in the planet's own frame like the craters.
  var CONTINENTS = [
    { ox:  0.10, oy: -0.34, rx: 0.52, ry: 0.20, rot: -0.35, a: 0.34 },
    { ox: -0.28, oy:  0.26, rx: 0.38, ry: 0.16, rot:  0.55, a: 0.28 },
    { ox:  0.40, oy:  0.44, rx: 0.26, ry: 0.11, rot: -0.20, a: 0.22 }
  ];

  var RING_R = PLANET_R * 1.6;
  var RING_SQUASH = 0.3;

  // The ring is drawn in two halves around the planet so it reads as tilted
  // rather than painted on: the back arc goes down before the sphere, the front
  // arc over it. Drawn in one pass it looks like a hoop lying flat on the glass.
  function drawRingArc(from, to, alpha, width) {
    ctx.save();
    ctx.translate(PLANET_X, PLANET_Y);
    ctx.scale(1, RING_SQUASH);
    ctx.beginPath();
    ctx.arc(0, 0, RING_R, from, to);
    ctx.strokeStyle = 'rgba(0, 255, 200, ' + alpha + ')';
    ctx.lineWidth = width / RING_SQUASH;   // undo the squash on the stroke
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanetBody() {
    var grad = ctx.createRadialGradient(
      PLANET_X - PLANET_R * 0.3, PLANET_Y - PLANET_R * 0.3, PLANET_R * 0.1,
      PLANET_X, PLANET_Y, PLANET_R
    );
    grad.addColorStop(0,   '#A78BFA');
    grad.addColorStop(0.4, '#7C3AED');
    grad.addColorStop(1,   '#2D1B69');

    // A teal atmosphere bloom, so the planet sits in the void rather than on it.
    ctx.save();
    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R * 1.22, 0, TAU);
    var halo = ctx.createRadialGradient(PLANET_X, PLANET_Y, PLANET_R * 0.92,
                                        PLANET_X, PLANET_Y, PLANET_R * 1.22);
    halo.addColorStop(0, 'rgba(0,255,200,0.20)');
    halo.addColorStop(1, 'rgba(0,255,200,0)');
    ctx.fillStyle = halo;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface. Everything here turns with the cluster — without something
    // asymmetric on the face, a spinning board and a parked one look exactly the
    // same. Clipped to the sphere so features run off the limb rather than
    // stopping short of it.
    ctx.save();
    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, TAU);
    ctx.clip();
    ctx.translate(PLANET_X, PLANET_Y);
    ctx.rotate(theta);

    // Teal continents. The brief calls the planet purple-teal, and with the
    // teal only in the ring and the halo the sphere itself was flatly purple —
    // the two colours never met on the thing they are supposed to describe.
    for (var j = 0; j < CONTINENTS.length; j++) {
      var t = CONTINENTS[j];
      ctx.save();
      ctx.translate(t.ox * PLANET_R, t.oy * PLANET_R);
      ctx.rotate(t.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, t.rx * PLANET_R, t.ry * PLANET_R, 0, 0, TAU);
      ctx.fillStyle = 'rgba(45, 212, 191, ' + t.a + ')';
      ctx.fill();
      ctx.restore();
    }

    for (var i = 0; i < CRATERS.length; i++) {
      var c = CRATERS[i];
      ctx.beginPath();
      ctx.arc(c.ox * PLANET_R, c.oy * PLANET_R, c.r * PLANET_R, 0, TAU);
      ctx.fillStyle = 'rgba(20, 10, 50, 0.55)';
      ctx.fill();
      // A lit lower lip turns a flat disc into a dent.
      ctx.beginPath();
      ctx.arc(c.ox * PLANET_R + c.r * PLANET_R * 0.18,
              c.oy * PLANET_R + c.r * PLANET_R * 0.22,
              c.r * PLANET_R * 0.80, 0, TAU);
      ctx.fillStyle = 'rgba(196, 181, 253, 0.20)';
      ctx.fill();
    }
    ctx.restore();

    // Terminator — darkens the lower right so the sphere has a light direction
    // that agrees with the bubbles'.
    ctx.save();
    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, TAU);
    ctx.clip();
    var term = ctx.createRadialGradient(
      PLANET_X - PLANET_R * 0.35, PLANET_Y - PLANET_R * 0.35, PLANET_R * 0.2,
      PLANET_X, PLANET_Y, PLANET_R * 1.25
    );
    term.addColorStop(0, 'rgba(0,0,0,0)');
    term.addColorStop(1, 'rgba(10, 4, 26, 0.55)');
    ctx.fillStyle = term;
    ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2);
    ctx.restore();
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, LW, LH);

    // Backdrop: the same two-ellipse wash the page carries, so the board reads
    // as a window onto the same sky rather than a panel sitting on it.
    ctx.fillStyle = '#1A0A2E';
    ctx.fillRect(0, 0, LW, LH);

    var neb = ctx.createRadialGradient(LW * 0.30, LH * 0.20, 0,
                                       LW * 0.30, LH * 0.20, LW * 0.85);
    neb.addColorStop(0, 'rgba(45, 27, 105, 0.85)');
    neb.addColorStop(1, 'rgba(45, 27, 105, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, LW, LH);

    var well = ctx.createRadialGradient(LW * 0.70, LH * 0.80, 0,
                                        LW * 0.70, LH * 0.80, LW * 0.70);
    well.addColorStop(0, 'rgba(13, 5, 33, 0.85)');
    well.addColorStop(1, 'rgba(13, 5, 33, 0)');
    ctx.fillStyle = well;
    ctx.fillRect(0, 0, LW, LH);

    drawStars();

    // The ring is split by depth, and the near half is drawn after the cluster.
    // Drawn before it, the ring is invisible in play: it sits at 1.6 planet
    // radii, which is exactly where the innermost shell of bubbles sits, so the
    // whole near side disappears behind them the moment a board is dealt. Taking
    // the near half over the top costs a thin teal band across a few bubbles and
    // buys back the planet's silhouette.
    drawRingArc(Math.PI, TAU, 0.38, 6);        // far half, behind the planet
    drawPlanetBody();

    bubbles.forEach(function (b) { drawBubble(b.wx, b.wy, b.color); });

    incoming.forEach(function (f) { drawBubble(f.x, f.y, f.color); });

    drawEscapes();

    if (phase === 'playing' && !shot) drawAim();
    if (shot) drawBubble(shot.x, shot.y, shot.color);

    drawRingArc(0, Math.PI, 0.60, 6);          // near half, over the cluster

    drawShooter();
    drawScoreReadout();
    drawSparks();
    drawFloats();
    drawCombos();
    drawCelebration();
    drawFlash();
  }

  // Blasted off into space: shrinking, fading, and dragging a tail of its own
  // colour behind it.
  function drawEscapes() {
    for (var i = 0; i < escapes.length; i++) {
      var e = escapes[i];
      var k = e.t / ESCAPE_LIFE;

      for (var j = 0; j < e.trail.length; j++) {
        var p = e.trail[j];
        var f = (j / e.trail.length);
        ctx.globalAlpha = (1 - k) * f * 0.42;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.5 * f * (1 - k * 0.6), 0, TAU);
        ctx.fillStyle = e.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawBubble(e.x, e.y, e.color, 1 - k * 0.75, 1 - k);
    }
  }

  // ── Aim and shooter ───────────────────────────────────────────────────────

  function drawAim() {
    var aimResult = findAttachmentPosition(SHOOTER_X, SHOOTER_Y, aim, R);
    var pts = aimResult.points;

    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(232, 255, 0, 0.45)';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // A ghost of the bubble where it will actually come to rest — the same
    // number the shot is placed at, at the bubble's true size, so what fits in
    // the preview is what fits on the board.
    var end = aimResult.contact
      ? { x: aimResult.restingX, y: aimResult.restingY }
      : pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, R, 0, TAU);
    ctx.strokeStyle = 'rgba(232, 255, 0, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawShooter() {
    if (phase === 'idle') return;

    ctx.save();
    ctx.translate(SHOOTER_X, SHOOTER_Y);
    ctx.rotate(aim);
    var bg = ctx.createLinearGradient(0, 0, R * 2.2, 0);
    bg.addColorStop(0, '#4c3a7a');
    bg.addColorStop(1, '#7C3AED');
    ctx.fillStyle = bg;
    ctx.fillRect(0, -R * 0.40, R * 2.2, R * 0.80);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(SHOOTER_X, SHOOTER_Y, R * 1.5, 0, TAU);
    ctx.fillStyle = '#2D1B69';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.45)';
    ctx.stroke();

    if (!shot && queue.length) drawBubble(SHOOTER_X, SHOOTER_Y, queue[0]);

    // On deck.
    if (queue.length > 1) {
      var nx = SHOOTER_X + R * 3.8, ny = SHOOTER_Y;
      ctx.globalAlpha = 0.8;
      drawBubble(nx, ny, queue[1], 0.66);
      ctx.globalAlpha = 1;
      ctx.font = '600 10px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(182, 168, 216, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT', nx, ny + R * 1.75);
    }

    // How many arrive behind the next shot — the pressure, stated plainly.
    if (phase === 'playing') {
      ctx.textAlign = 'left';
      ctx.font = '700 10px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232, 255, 0, 0.75)';
      ctx.fillText('+' + bubblesPerShot + ' PER SHOT', 12, 20);
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  // The score, big and centred across the top of the board. It used to live in
  // the stats bar as one cell among four, which is a strange place for the only
  // number the player is actually chasing.
  function drawScoreReadout() {
    if (phase === 'idle') return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    var txt = String(score);
    ctx.font = '700 54px -apple-system, system-ui, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(13, 5, 33, 0.9)';
    ctx.strokeText(txt, LW / 2, 62);
    ctx.shadowColor = 'rgba(232, 255, 0, 0.55)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#E8FF00';
    ctx.fillText(txt, LW / 2, 62);
    ctx.shadowBlur = 0;

    // Best sits under it, quiet — a target rather than a running number.
    if (best > 0) {
      ctx.font = '700 12px -apple-system, system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(13, 5, 33, 0.85)';
      ctx.strokeText('BEST ' + best, LW / 2, 82);
      ctx.fillStyle = 'rgba(182, 168, 216, 0.9)';
      ctx.fillText('BEST ' + best, LW / 2, 82);
    }
    ctx.restore();
  }

  function drawSparks() {
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      ctx.globalAlpha = Math.max(0, 1 - s.t / s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      var k = f.t / FLOAT_LIFE;
      // Held at full opacity for the first third, then faded — a number that
      // starts dying immediately is hard to read at all.
      ctx.globalAlpha = k < 0.35 ? 1 : 1 - Math.pow((k - 0.35) / 0.65, 2);
      ctx.font = '700 ' + (f.size || 26) + 'px -apple-system, system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(13, 5, 33, 0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // The combo badge: snaps up from nothing, overshoots to 130%, settles at 100%,
  // holds, then goes. INSANITY! never quite settles — it keeps breathing, which
  // is the only way the top tier reads as different from the one below it once
  // both have finished animating.
  function drawCombos() {
    ctx.textAlign = 'center';

    for (var i = 0; i < combos.length; i++) {
      var c = combos[i];
      var k = c.t / COMBO_LIFE;

      var scale;
      if (c.t < 0.14) {
        scale = 1.3 * (c.t / 0.14);                    // 0 → 130%
      } else if (c.t < 0.30) {
        scale = 1.3 - 0.3 * ((c.t - 0.14) / 0.16);     // 130% → 100%
      } else {
        scale = 1;
      }
      if (c.pulse && c.t >= 0.30) {
        scale = 1 + 0.09 * Math.sin((c.t - 0.30) * 15);
      }

      var alpha = k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(c.x, c.y);
      ctx.scale(scale, scale);
      ctx.font = '700 ' + c.size + 'px -apple-system, system-ui, sans-serif';

      // A glow under the hotter tiers so they carry against the purple.
      ctx.shadowColor = c.color;
      ctx.shadowBlur = c.pulse ? 26 : 14;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(13, 5, 33, 0.9)';
      ctx.strokeText(c.text, 0, 0);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawCelebration() {
    if (!celebration) return;
    var k = celebration.t / 1.6;
    var pop = celebration.t < 0.22 ? celebration.t / 0.22 : 1;

    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(PLANET_X, PLANET_Y - 110);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.textAlign = 'center';
    ctx.font = '700 30px -apple-system, system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(13, 5, 33, 0.9)';
    ctx.strokeText(celebration.text, 0, 0);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(celebration.text, 0, 0);
    ctx.restore();
  }

  function drawFlash() {
    if (flash <= 0) return;
    ctx.globalAlpha = flash * 0.5;
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 1;
  }

  // ── HUD, toast, modal ─────────────────────────────────────────────────────

  function updateHud() {
    recordBest();
    // The score reads off the board itself now, so the bar may not carry a Score
    // cell at all; each stat is written only if the page ships one.
    if (elScore)   elScore.textContent   = score;
    if (elBoard)   elBoard.textContent   = board;
    if (elBubbles) elBubbles.textContent = bubbles.length;
    if (elBest)    elBest.textContent    = best || '—';
  }

  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('bp-toast-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('bp-toast-on');
    }, 2400);
  }

  function showModal(reason) {
    if (!overlayEl) return;

    if (boardsCleared > 0) {
      bannerEl.textContent = boardsCleared + ' BOARD' + (boardsCleared === 1 ? '' : 'S') + ' CLEARED';
      bannerEl.style.background = '#7C3AED';
      bannerEl.classList.remove('hidden');
    } else {
      bannerEl.classList.add('hidden');
    }

    if (reason === 'reached') {
      titleEl.textContent = 'THE CLUSTER REACHED YOU';
      modalSubEl.textContent = 'It grew all the way down onto the launcher. Pop faster than it arrives.';
    } else {
      titleEl.textContent = 'THE CLUSTER HIT THE WALL';
      modalSubEl.textContent = 'It outgrew the board at ' + bubbles.length +
        ' bubble' + (bubbles.length === 1 ? '' : 's') +
        '. Every shot brings ' + bubblesPerShot + ' more in.';
    }

    modalScoreEl.textContent = 'Score ' + score;

    var rows = [
      ['Board reached', String(board)],
      ['Boards cleared', String(boardsCleared)],
      ['Matched', matched + ' bubble' + (matched === 1 ? '' : 's')],
      ['Blasted loose', cascaded + ' bubble' + (cascaded === 1 ? '' : 's') + ' (5×)'],
      ['Shots fired', String(shotsFired)],
      ['Best', String(best) + (score >= best && score > 0 ? ' — new best!' : '')]
    ];

    breakdownEl.innerHTML = rows.map(function (r) {
      return '<div class="bd-row"><span>' + r[0] + '</span><strong style="margin-left:auto">' +
             r[1] + '</strong></div>';
    }).join('');

    overlayEl.classList.remove('hidden');
  }

  function shareLine() {
    return 'Bubble Planet — scored ' + score + ' points across ' + board +
      ' board' + (board === 1 ? '' : 's') + '. Can you beat that? ' +
      'https://www.thebunnygame.com/bubbleplanet';
  }

  var DIRECTIONS_TEXT =
    'Bubble Planet puts you in charge of defending an alien planet from incoming '  +
    'bubbles. Aim and fire from the bottom (your shots can bounce off the side '     +
    'walls.) Match 3 or more of the same color to blast them off into space. '       +
    'Chain reactions score big. Clear the entire planet to earn bonuses and face '   +
    'the next wave. The game ends when the cluster reaches the walls. '              +
    'How long can you hold the planet?';

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (lastTime === null) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    clock += dt;

    step(dt);
    render();
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

  function boot() {
    wrap   = document.getElementById('canvas-wrap');
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    startEl      = document.getElementById('bp-start');
    toastEl      = document.getElementById('bp-toast');
    overlayEl    = document.getElementById('overlay');
    titleEl      = document.getElementById('modal-title');
    modalScoreEl = document.getElementById('modal-score');
    modalSubEl   = document.getElementById('modal-sub');
    breakdownEl  = document.getElementById('modal-breakdown');
    bannerEl     = document.getElementById('perf-banner');
    elScore      = document.getElementById('val-score');
    elBoard      = document.getElementById('val-board');
    elBubbles    = document.getElementById('val-bubbles');
    elBest       = document.getElementById('val-best');

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(LW * DPR);
    canvas.height = Math.round(LH * DPR);

    buildSprites();
    buildStars();
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    try { best = parseInt(localStorage.getItem('bubbleplanet_bestScore'), 10) || 0; } catch (e) { best = 0; }

    // Aim continuously on a mouse; on touch, aim while the finger is down and
    // fire when it lifts — the same drag-then-release the other pointer games use.
    var pointerDown = false;

    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && !pointerDown) return;
      e.preventDefault();
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
      e.preventDefault();
      pointerDown = false;
      var p = pointerPos(e);
      setAim(p.x, p.y);
      fireShot();
    });
    canvas.addEventListener('pointercancel', function () { pointerDown = false; });

    // Aiming stays on pointer events — one code path for mouse and touch, which
    // is what the rest of the collection uses. Registering mouse *and* touch
    // handlers instead would run the game logic twice on a phone, since a touch
    // also synthesises a mouse event.
    //
    // These touch listeners therefore carry no game logic at all. They exist to
    // cancel the browser's own gesture, and they must be passive:false or
    // preventDefault is ignored on touchmove in current browsers — which is the
    // one that matters, because the drag is the aim.
    ['touchstart', 'touchmove', 'touchend'].forEach(function (type) {
      canvas.addEventListener(type, function (e) { e.preventDefault(); },
                              { passive: false });
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('selectstart', function (e) { e.preventDefault(); });

    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });
    document.getElementById('new-btn').addEventListener('click', startGame);
    document.getElementById('bp-play-btn').addEventListener('click', startGame);
    document.getElementById('play-again-btn').addEventListener('click', startGame);
    document.getElementById('share-btn').addEventListener('click', function () {
      shareText(shareLine(), 'Bubble Planet — Bunny Game');
    });

    // A slowly turning board behind the splash, so the page is not a dead
    // rectangle before the first click.
    reset();
    omega = 0.30;
    phase = 'idle';
    updateHud();

    raf = requestAnimationFrame(frame);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  // ── API ───────────────────────────────────────────────────────────────────

  return {
    // Constants
    COLORS: COLORS,
    LW: LW, LH: LH, R: R,
    PLANET_X: PLANET_X, PLANET_Y: PLANET_Y, PLANET_R: PLANET_R,
    SHOOTER_X: SHOOTER_X, SHOOTER_Y: SHOOTER_Y,
    MIN_MATCH: MIN_MATCH,

    // Pure logic — the spec's functions, usable on any plain objects
    Bubble: Bubble,
    distance: distance,
    buildConnectionGraph: buildConnectionGraph,
    getDisconnectedBubbles: getDisconnectedBubbles,
    findMatchingGroup: findMatchingGroup,
    calculateScore: calculateScore,
    checkBoundaryCollision: checkBoundaryCollision,
    isBoardCleared: isBoardCleared,

    // Live game
    reset: reset,
    setAim: setAim,
    fire: fire,
    step: step,
    spinStep: spinStep,
    spawnIncoming: spawnIncoming,
    traceShot: traceShot,
    findAttachmentPosition: findAttachmentPosition,
    findFirstContact: findFirstContact,
    attachBubble: attachBubble,
    contactAt: contactAt,
    resolve: resolve,
    wallHit: wallHit,
    shooterBlocked: shooterBlocked,

    // Runs an in-flight shot and anything in the air to completion without
    // waiting on frames — the test hook and the headless harness both use it.
    startGame: startGame,
    fireShot: fireShot,
    phase: function () { return phase; },
    setPalette: function (n) { PALETTE = Math.max(2, Math.min(COLORS.length, n)); },
    getBoardConfig: getBoardConfig,
    showComboText: showComboText,
    showFloatingScore: showFloatingScore,
    flashScreen: flashScreen,
    comboTiers: function () { return Object.keys(COMBO_TIERS); },
    setFeedEvery: function (n) { FEED_EVERY = n; },
    setSlop: function (v) { TOUCH_SLOP = v; },
    getPalette: function () { return PALETTE; },

    settle: function (max) {
      var n = 0, cap = max || 20000;
      while ((shot || incoming.length || pending.length ||
              phase === 'clearing' || phase === 'assembling') && n++ < cap) {
        step(1 / 240);
      }
      return n;
    },

    state: function () {
      return {
        bubbles: bubbles.length,
        theta: theta, omega: omega,
        maxR: maxR, inertia: inertia,
        score: score, best: best,
        phase: phase, board: board,
        bubblesPerShot: bubblesPerShot,
        boardIncomingColor: boardIncomingColor,
        boardsCleared: boardsCleared,
        shotsFired: shotsFired,
        matched: matched, cascaded: cascaded,
        inFlight: !!shot,
        incoming: incoming.length,
        pending: pending.length,
        escapes: escapes.length,
        sparks: sparks.length,
        floats: floats.length,
        combos: combos.length,
        flash: flash,
        queue: queue.slice(),
        aim: aim,
        cleared: isBoardCleared(bubbles),
        wallHit: wallHit(),
        endReason: endReason,
        lastResolve: lastResolve && {
          direct: lastResolve.direct.length,
          cascade: lastResolve.cascade.length,
          score: lastResolve.score
        }
      };
    },

    // Direct access for the renderer and the tests. Live arrays, not copies.
    bubbles: function () { return bubbles; },
    incomingList: function () { return incoming; },
    escapeList: function () { return escapes; },
    shotRef: function () { return shot; },
    planet: function () { return planetLocal; },
    bounds: function () { return bounds; },
    aimAngle: function () { return aim; },
    setOmega: function (v) { omega = v; },
    setTheta: function (v) { theta = v; syncWorld(); },
    setBubbles: function (list) {
      bubbles.length = 0;
      for (var i = 0; i < list.length; i++) bubbles.push(list[i]);
      recompute(); syncWorld();
    }
  };
}));
