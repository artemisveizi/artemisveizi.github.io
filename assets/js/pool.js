/*
 * Pool table.
 *
 * Hidden below the bottom of the home page: scrolling to the end reveals a
 * "keep going" prompt, and pushing past it expands the table.
 *
 * Vanilla JS, no dependencies — GitHub Pages serves this as a static file.
 *
 * Geometry is in inches on a 9-foot table (100" x 50" playing surface,
 * 2.25" balls), so the proportions and the way the balls behave relative to
 * the pockets match a real table. Only the render step converts to pixels.
 */
(function () {
  'use strict';

  var root = document.getElementById('pool');
  var hint = document.getElementById('pool-hint');
  if (!root || !hint) return;

  var canvas = root.querySelector('.pool-canvas');
  var rerackBtn = root.querySelector('.pool-rerack');
  var status = root.querySelector('.pool-status');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- table

  var W = 100;            // playing surface width
  var H = 50;             // playing surface height
  var R = 1.125;          // ball radius
  var RAIL = 5;           // rail drawn outside the surface

  /* Pocket mouths, following the WPA table spec: 4.5in between the cushion noses
     at a corner, 5in at a side. Side pockets really are cut wider — a ball
     arrives at one across the rail rather than along it, so it needs the extra
     width to drop. Held as half-widths, since every test is against a distance
     from the pocket's own centre line. */
  var MOUTH_CORNER = 2.25;
  var MOUTH_SIDE = 2.5;

  /* Angle the facing — the cut on the end of a cushion — makes with the rail it
     ends. A plain 45deg chamfer, the same at every pocket.

     Not the spec figure. The WPA gives the angle between a pocket's two facings as
     142deg at a corner and 104deg at a side, which works out to 26deg and 38deg
     off the rail. Those are the real angles, but 26deg draws a jaw that rakes back
     3.1in along the rail for 1.5in of cushion depth, and a taper that long reads
     as a spike rather than a jaw. 45deg gives equal run and rise, which is what
     the cut actually looks like on a table.

     Cosmetic only: this feeds drawCushions and nothing else. Where a ball drops is
     decided by the nose positions and the shelf, neither of which reads it. */
  var JAW_ANGLE = 45;

  /* Shelf: how far past the nose line a ball's centre has to travel before it
     drops. This is the whole of a pocket's stringency, and the reason a
     regulation table refuses shots a bar table accepts. 1 3/4in at a corner is
     the WPA figure; sides are cut with almost none.

     It replaced a plain capture radius measured from the pocket point, which had
     no notion of direction at all: a ball still out on the cloth was inside it,
     and a ball drifting along the rail past a pocket got taken just the same.
     That was the "sucked in" feel. */
  var SHELF_CORNER = 1.75;
  var SHELF_SIDE = 0.35;

  /* The cushion nose, as a peg a ball can rattle off. Without this there is
     nothing in the mouth to refuse a ball: the cushion is cut away there, so
     everything that reached the gap used to drop. The clean gap left for a
     ball's centre between two nose pegs is mouth/2 - R - NOSE_R, which comes to
     +-0.775in at a corner. */
  var NOSE_R = 0.35;

  /* Depth of each opening, from the nose line to the back of the hole, and how
     much wider than its own mouth the hole gets. See pocketOval.

     Sides run shallower than corners, and end up wider than they are deep. That
     is forced rather than chosen: a side pocket's mouth is 5in across and it has
     only the 5in rail to run back into, so an opening deep enough to be round
     would come out level with the outside edge of the wood. It is also what real
     side pockets look like. A corner measures its depth from a nose line already
     2.25in inside the corner point, so it has the whole diagonal to work with and
     can afford to be the longer way round.

     These leave about 2in of wood beyond a side pocket and 4.5in beyond a corner,
     on the 5in rail. */
  var DEPTH_CORNER = 3.8;
  var DEPTH_SIDE = 3.0;
  var POCKET_FLARE = 1.06;

  // How long a potted ball goes on being drawn while it drops.
  var SINK_TIME = 0.42;

  // Rolling resistance on cloth. Real billiard cloth gives a rolling ball about
  // 4-10 in/s^2 (mu_roll ~= 0.01 against g = 386 in/s^2), and 9 sat at the top
  // of that band: 42 was far too draggy, 7 let balls run too freely, 11 was
  // slightly heavy.
  //
  // Raised past that to 13, deliberately over-damped, once the balls started
  // visibly rolling. Spin makes duration legible in a way sliding did not — the
  // same 7 seconds that passed unnoticed read as balls refusing to stop. A
  // medium shot now settles in 5.3s rather than 6.8s.
  //
  // The wait is object balls still running, not a slow crawl at the end:
  // raising SLEEP_SPEED to 1.5 or 2.5 changes total settle time by under 0.1s,
  // so it is not the lever it looks like. Deceleration is.
  var ROLL_DECEL = 13;
  var BALL_E = 0.95;
  var CUSHION_E = 0.75;
  var CUSHION_FRICTION = 0.97;
  var SLEEP_SPEED = 0.6;      // below this a ball is parked
  var MAX_SHOT = 340;         // in/s, roughly a hard break

  // Cosmetic geometry, drawing only — the physics never reads these.
  var CUSH = 1.5;                   // cushion depth outside the playing surface
  var FRAME_R = 2.4;                // corner radius of the outer rail

  var SQ = Math.SQRT1_2;
  /* Each pocket carries the direction it faces — outward from the playing
     surface — and its class, since corners and sides differ in the width of the
     mouth, the depth of the hole behind it, and which way that hole runs. */
  var POCKETS = [
    { x: 0,     y: 0, ox: -SQ, oy: -SQ, corner: true  },
    { x: W / 2, y: 0, ox:   0, oy:  -1, corner: false },
    { x: W,     y: 0, ox:  SQ, oy: -SQ, corner: true  },
    { x: 0,     y: H, ox: -SQ, oy:  SQ, corner: true  },
    { x: W / 2, y: H, ox:   0, oy:   1, corner: false },
    { x: W,     y: H, ox:  SQ, oy:  SQ, corner: true  }
  ];

  function mouthOf(p)   { return p.corner ? MOUTH_CORNER : MOUTH_SIDE; }
  function shelfOf(p)   { return p.corner ? SHELF_CORNER : SHELF_SIDE; }
  function depthOf(p)   { return p.corner ? DEPTH_CORNER : DEPTH_SIDE; }

  /* Every pocket test happens in the pocket's own frame: s runs outward along its
     bisector from the pocket point, u runs across the mouth. Reducing a ball's
     position to (s, u) is what makes "has it crossed the shelf, and is it inside
     the mouth" expressible at all — the old radius test could not tell a ball
     heading in from one drifting past. */
  function toLocal(p, x, y) {
    var dx = x - p.x, dy = y - p.y;
    return { s: dx * p.ox + dy * p.oy, u: dx * -p.oy + dy * p.ox };
  }
  function toWorld(p, s, t) {
    return { x: p.x + p.ox * s - p.oy * t, y: p.y + p.oy * s + p.ox * t };
  }

  /* The nose line, along the bisector. At a corner the mouth is measured across
     the diagonal, so each nose stands back from the pocket point by half the
     mouth; at a side the mouth is the gap in the rail itself, so the nose line
     runs through the pocket point. */
  function noseSOf(p) { return p.corner ? -mouthOf(p) : 0; }

  // Where a ball's centre must reach to drop: the outer edge of the shelf.
  function fallSOf(p) { return noseSOf(p) + shelfOf(p); }

  /* Distance along a rail from the pocket point to the cushion nose. At a corner
     the two noses are mouth apart across the diagonal, which puts each of them
     mouth/sqrt(2) along its own rail — further out than the old code cut the
     cushion, which is why the rubber used to reach into the mouth. */
  function railGapOf(p) { return p.corner ? mouthOf(p) * Math.SQRT2 : mouthOf(p); }

  function facingRad() { return JAW_ANGLE * Math.PI / 180; }

  /* How far along the rail the facing travels in crossing the cushion's depth. At
     45deg that is the depth itself.

     The direction matters and used to be inverted: the nose is the closest point
     on the cushion to the pocket, and the facing rakes AWAY from the pocket going
     back into the rubber, so the back edge is inset from the face. */
  function setbackOf() { return CUSH / Math.tan(facingRad()); }

  /* The pocket opening is drawn from the NOSE line, spanning nose to nose, and the
     drop — the part that is actually a hole — from the fall line.

     Getting this wrong is what made the corners look sealed. Drawing only from
     the fall line leaves the stretch of mouth between the noses and the drop
     rendered as bare rail: the opening is 1.75in of shelf deep at a corner, so
     most of what should be an open mouth came out as wood, and the pocket read as
     something a ball could not possibly enter.

     Drawn in three passes instead, which needs no clipping and no separate shelf
     shape:

       1. the opening, dark, from the nose line — so the mouth is open all the way
          across, including the part that runs under the rail;
       2. the bed cloth over it, which paints back exactly the part of the opening
          that lies on the playing surface — and that IS the shelf;
       3. the drop, dark again, from the fall line out.

     What survives is the opening minus the shelf, which is what you see looking
     down at a real pocket. */
  /* The opening, as an oval whose rim passes through both cushion noses.

     Put the rim through the two nose pegs and the jaw tips land on its edge for
     nothing, which is what makes this shape right rather than merely tidy. Earlier
     goes drew a trapezoid — straight sides, flat back — which stayed blocky however
     the corners were rounded, because straight sides and a flat back is what it
     was.

     An ellipse rather than a circle: a true circle reads as a hole drilled in the
     table, where a real pocket runs a little deeper than it is wide and widens
     behind the jaws. Two knobs — POCKET_FLARE for how much wider than its mouth
     the hole gets, and the depth — with the third value forced by the noses.

     For across-semi-axis b and depth d, the rim passes through a nose at
     (noseS, +-m) when

         q = sqrt(1 - (m/b)^2),   a = d / (1 + q),   centre = noseS + a*q

     which puts the widest point just behind the mouth, as it should be. */
  function pocketOval(p) {
    var m = mouthOf(p);
    var b = m * POCKET_FLARE;
    var q = Math.sqrt(1 - (m / b) * (m / b));
    var a = depthOf(p) / (1 + q);
    return { s: noseSOf(p) + a * q, a: a, b: b };
  }

  // Far edge along the bisector — where the drop bottoms out.
  function holeFarOf(p) {
    var o = pocketOval(p);
    return o.s + o.a;
  }

  function openingInto(target, p) {
    var o = pocketOval(p);
    var w = toWorld(p, o.s, 0);
    var rot = Math.atan2(p.oy, p.ox);      // rotated +x runs out along the bisector
    // moveTo first: on a Path2D already holding the bed rect, a bare ellipse would
    // be joined to it by a stray line.
    target.moveTo(u(w.x) + u(o.a) * Math.cos(rot), u(w.y) + u(o.a) * Math.sin(rot));
    target.ellipse(u(w.x), u(w.y), u(o.a), u(o.b), rot, 0, 2 * Math.PI);
  }

  function pocketShade(p) {
    var o = pocketOval(p);
    var n0 = toWorld(p, o.s - o.a, 0), n1 = toWorld(p, o.s + o.a, 0);
    var g = ctx.createLinearGradient(u(n0.x), u(n0.y), u(n1.x), u(n1.y));
    g.addColorStop(0, '#1b1f18');
    g.addColorStop(0.42, '#0a0c09');
    g.addColorStop(1, '#000000');
    return g;
  }

  // The twelve nose pegs, resolved once — they never move.
  var NOSES = [];
  (function () {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i], m = mouthOf(p), s = noseSOf(p);
      NOSES.push(toWorld(p, s, m), toWorld(p, s, -m));
    }
  })();


  // Cloth and cushion colours. Tournament blue rather than green; the rails
  // stay walnut, which is the usual pairing. Named so the cushion faces can't
  // drift out of sync with the bed.
  var CLOTH = '#1b5a91';
  var CUSHION_FACE = '#2b76b4';
  var CUSHION_MID = '#21608e';
  var CUSHION_BACK = '#164668';

  // Ball colours. The blue (2/10) and purple (4/12) are deeper than a real set
  // would be: against blue cloth they are hue-adjacent, so hue alone can't
  // separate them and they need the luminance gap instead. At their usual
  // values they measured 1.09:1 and 1.03:1 against the bed — invisible.
  var COLORS = {
    1: '#e8b427', 2: '#152c6b', 3: '#c0392b', 4: '#4a1d78',
    5: '#e0762a', 6: '#1c7a4a', 7: '#7d3b2e', 8: '#18191b',
    9: '#e8b427', 10: '#152c6b', 11: '#c0392b', 12: '#4a1d78',
    13: '#e0762a', 14: '#1c7a4a', 15: '#7d3b2e'
  };

  // Standard 8-ball rack: apex on the foot spot, 8 in the middle, and one
  // solid / one stripe in the back corners.
  var RACK = [[1], [2, 9], [10, 8, 3], [11, 12, 4, 13], [5, 6, 14, 7, 15]];

  // ---------------------------------------------------------------- markings
  //
  // Balls roll rather than slide, which needs a real orientation per ball: the
  // markings have to travel across the visible face and turn away over the
  // limb, not pinwheel in place. Coordinates are the screen's own — x right, y
  // down, z out of the table toward the viewer — so projecting to the canvas is
  // just dropping z, and the cloth is the plane at z = -R.
  //
  // Each ball carries two orthonormal world vectors, which between them are the
  // whole orientation matrix (the third axis is their cross product):
  //
  //   A   the pole the number is printed on. Both numbers sit at +-A.
  //   S   the stripe axis. The band is the zone within BAND_SIN of the great
  //       circle square to S.
  //
  // Keeping A . S = 0 puts the number circle in the middle of the stripe, as on
  // a real ball. The glyph's up is -S and its right is S x A, which is what
  // makes the number read upright when the stripe lies horizontal.

  // Cap sizes as sines of their angular radius. The values are the projected
  // radii the flat version drew, so a ball facing the camera is unchanged.
  var NUM_SIN = 0.44;                                   // number circle, ~26deg
  var NUM_COS = Math.sqrt(1 - NUM_SIN * NUM_SIN);
  var BAND_SIN = 0.54;                                  // stripe half-width, ~33deg
  // The white area outside the band is itself a cap, of radius 90deg minus the
  // band's — so its sine and cosine are the band's, swapped.
  var POLE_SIN = Math.sqrt(1 - BAND_SIN * BAND_SIN);
  var POLE_COS = BAND_SIN;

  var IVORY = '#f7f4ea';
  var NUMBER_PATCH = '#f9f7ef';

  /* Racked balls all start square to the camera: numbers readable, stripes
     level. Someone has just racked them by hand, and it means the numbers can
     be read before the break. */
  function makeBall(n, x, y) {
    return {
      n: n, x: x, y: y, vx: 0, vy: 0,
      ax: 0, ay: 0, az: 1,      // A — number pole, facing the viewer
      sx: 0, sy: 1, sz: 0       // S — stripe axis, so the band reads level
    };
  }

  var balls = [];
  var potted = [];
  // Potted but still being drawn while they drop. Out of play: nothing here
  // collides, and nothing here holds up the settle.
  var sinking = [];
  var running = false;
  var rafId = null;
  var lastT = 0;

  function cueSpot() { return { x: W * 0.25, y: H / 2 }; }

  function rack() {
    balls = [];
    potted = [];
    sinking = [];
    var spot = cueSpot();
    balls.push(makeBall(0, spot.x, spot.y));

    var footX = W * 0.72;
    // A hair of air between balls. Racking them at exactly 2R leaves every
    // neighbour in contact, so floating-point noise puts some pairs marginally
    // inside the collision threshold and the first step resolves the whole
    // rack at once — the break flies apart unnaturally. Real racks have gaps.
    var pitch = 2 * R * 1.004;
    var rowGap = (pitch / 2) * Math.sqrt(3);
    for (var i = 0; i < RACK.length; i++) {
      for (var j = 0; j < RACK[i].length; j++) {
        balls.push(makeBall(
          RACK[i][j],
          footX + i * rowGap,
          H / 2 + (j - i / 2) * pitch
        ));
      }
    }
    render();
    announce();
  }

  // ---------------------------------------------------------------- physics

  function anyMoving() {
    for (var i = 0; i < balls.length; i++) {
      if (balls[i].vx || balls[i].vy) return true;
    }
    return false;
  }

  /* The table is busy while anything is moving OR still dropping. The drop has to
     count: a scratch respots the cue, and doing that while the old one is still
     visibly falling would show two cue balls at once. */
  function busy() {
    return anyMoving() || sinking.length > 0;
  }

  /* True when the ball sits in a pocket's mouth, where the cushion is cut
     away. Without this the rails would bounce balls off the pocket jaws. */
  function inMouth(b, axis, at) {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      var g = railGapOf(p);
      if (axis === 'x' && p.y === at && Math.abs(b.x - p.x) < g) return true;
      if (axis === 'y' && p.x === at && Math.abs(b.y - p.y) < g) return true;
    }
    return false;
  }

  /* Turn a ball's orientation as if its contact patch never slips. The cloth is
     below the ball, at (0, 0, -R) from its centre, so rolling without slipping
     means v + omega x (0, 0, -R) = 0, giving omega = (-vy, vx, 0) / R: a
     rotation about the horizontal axis square to the direction of travel. The
     consequence to sanity-check is that the top of the ball then moves the way
     the ball does, at twice its speed — which is what rolling looks like.

     Real balls slide briefly after a hit before rolling takes over. That is not
     modelled, for the same reason the physics has no english: nothing in the
     shot lets you ask for it. */
  function roll(b, sp, dt) {
    if (sp < 1e-9) return;
    var kx = -b.vy / sp, ky = b.vx / sp;       // unit axis; its z is always 0
    var th = sp * dt / R;
    var co = Math.cos(th), si = Math.sin(th), mc = 1 - co;

    // Rodrigues, with the axis' zero z folded in.
    var d = kx * b.ax + ky * b.ay;
    var nx = b.ax * co + ky * b.az * si + kx * d * mc;
    var ny = b.ay * co - kx * b.az * si + ky * d * mc;
    var nz = b.az * co + (kx * b.ay - ky * b.ax) * si;
    d = kx * b.sx + ky * b.sy;
    var mx = b.sx * co + ky * b.sz * si + kx * d * mc;
    var my = b.sy * co - kx * b.sz * si + ky * d * mc;
    var mz = b.sz * co + (kx * b.sy - ky * b.sx) * si;

    // Re-orthonormalise. A break lands thousands of substeps on some balls, and
    // drift in the frame shows up as the stripe creeping off its number circle.
    var len = Math.hypot(nx, ny, nz) || 1;
    b.ax = nx / len; b.ay = ny / len; b.az = nz / len;
    d = b.ax * mx + b.ay * my + b.az * mz;
    mx -= b.ax * d; my -= b.ay * d; mz -= b.az * d;
    len = Math.hypot(mx, my, mz) || 1;
    b.sx = mx / len; b.sy = my / len; b.sz = mz / len;
  }

  function step(dt) {
    var i, j, b;

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.vx && !b.vy) continue;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      var sp = Math.hypot(b.vx, b.vy);
      roll(b, sp, dt);

      // Rolling resistance acts against the direction of travel, so a ball
      // decelerates linearly and actually comes to rest.
      var next = sp - ROLL_DECEL * dt;
      if (next <= SLEEP_SPEED) {
        b.vx = b.vy = 0;
      } else {
        b.vx *= next / sp;
        b.vy *= next / sp;
      }
    }

    // cushions
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.y < R && !inMouth(b, 'x', 0)) {
        b.y = R; b.vy = -b.vy * CUSHION_E; b.vx *= CUSHION_FRICTION;
      } else if (b.y > H - R && !inMouth(b, 'x', H)) {
        b.y = H - R; b.vy = -b.vy * CUSHION_E; b.vx *= CUSHION_FRICTION;
      }
      if (b.x < R && !inMouth(b, 'y', 0)) {
        b.x = R; b.vx = -b.vx * CUSHION_E; b.vy *= CUSHION_FRICTION;
      } else if (b.x > W - R && !inMouth(b, 'y', W)) {
        b.x = W - R; b.vx = -b.vx * CUSHION_E; b.vy *= CUSHION_FRICTION;
      }
    }

    /* Cushion noses, as pegs. These are what make a pocket refusable: across a
       mouth the cushion is cut away, so before this there was nothing to strike
       and anything that reached the gap went in. A ball clipping a nose now
       deflects off it and can rattle in the jaws or come back out onto the
       cloth, which is most of what "too easy" was about.

       They also seal the mouth against escape. Past the nose line a ball can only
       be beyond the mouth laterally by having gone through a peg, and a peg
       turns it away. */
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.vx && !b.vy) continue;
      for (j = 0; j < NOSES.length; j++) {
        var nz = NOSES[j];
        var ndx = b.x - nz.x, ndy = b.y - nz.y;
        var nd = Math.hypot(ndx, ndy);
        var lim = R + NOSE_R;
        if (nd >= lim || nd < 1e-9) continue;
        var nnx = ndx / nd, nny = ndy / nd;
        b.x = nz.x + nnx * lim;
        b.y = nz.y + nny * lim;
        var vn = b.vx * nnx + b.vy * nny;
        if (vn < 0) {
          b.vx -= (1 + CUSHION_E) * vn * nnx;
          b.vy -= (1 + CUSHION_E) * vn * nny;
          // Rubber drags across the face as well as pushing back along it.
          var ptx = -nny, pty = nnx;
          var vt = b.vx * ptx + b.vy * pty;
          b.vx += (CUSHION_FRICTION - 1) * vt * ptx;
          b.vy += (CUSHION_FRICTION - 1) * vt * pty;
        }
      }
    }

    // ball-to-ball: equal masses, so the pair just swaps the component of
    // relative velocity along the line of centres.
    //
    // Resolved over several passes. On a break a dozen balls are in contact
    // simultaneously, and one pass leaves overlaps that the next frame sees as
    // fresh collisions, which reads as the rack shuddering.
    for (var pass = 0; pass < 4; pass++) {
      var moved = false;
      for (i = 0; i < balls.length; i++) {
        for (j = i + 1; j < balls.length; j++) {
          var a = balls[i], c = balls[j];
          var dx = c.x - a.x, dy = c.y - a.y;
          var d = Math.hypot(dx, dy);
          if (d === 0 || d >= 2 * R) continue;
          moved = true;

          var nx = dx / d, ny = dy / d;

          // push apart so they don't sink into each other and jitter
          var overlap = (2 * R - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;

          var rvn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rvn >= 0) continue;                 // already separating
          var imp = -(1 + BALL_E) * rvn / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          c.vx += imp * nx; c.vy += imp * ny;
        }
      }
      if (!moved) break;
    }

    // pockets
    for (i = balls.length - 1; i >= 0; i--) {
      b = balls[i];
      var into = null;
      for (j = 0; j < POCKETS.length; j++) {
        var pk = POCKETS[j];
        /* Drop only once the centre has crossed the far edge of the shelf while
           inside the mouth. Both halves matter: the shelf is what stops a ball
           being taken while it is still out on the cloth, and the mouth test is
           what stops one merely passing the pocket from being taken at all. */
        var L = toLocal(pk, b.x, b.y);
        if (L.s >= fallSOf(pk) && Math.abs(L.u) <= mouthOf(pk)) {
          into = pk;
          break;
        }
      }
      // Safety net. The nose pegs and the mouth test should make escape
      // impossible, but a ball that somehow ends up beyond the rails would
      // otherwise coast away forever and never let the table settle. Treat it as
      // pocketed, down whichever pocket it is nearest, so it still leaves by
      // going somewhere rather than blinking out.
      if (!into && (b.x < -R || b.x > W + R || b.y < -R || b.y > H + R)) {
        into = nearestPocket(b);
      }
      if (into) {
        balls.splice(i, 1);
        if (b.n !== 0) potted.push(b.n);
        else scratch = true;
        startSink(b, into);
        announce();
      }
    }

    // Balls on their way down. Purely cosmetic — they are already out of play —
    // and stepped after the sweep above so one potted this tick gets its first
    // frame of drop straight away rather than a tick late.
    for (i = sinking.length - 1; i >= 0; i--) {
      b = sinking[i];
      b.sinkT += dt;
      if (b.sinkT >= SINK_TIME) { sinking.splice(i, 1); continue; }
      var q = b.sinkT / SINK_TIME;
      var e = 1 - (1 - q) * (1 - q);                     // easeOutQuad
      b.x = b.sinkFromX + (b.sinkToX - b.sinkFromX) * e;
      b.y = b.sinkFromY + (b.sinkToY - b.sinkFromY) * e;
      // Turning the whole way down: it is rolling into the pocket, not falling
      // in a vacuum, so the spin should not taper off before it is out of sight.
      var sp = Math.hypot(b.vx, b.vy);
      if (sp > 1e-9) roll(b, sp, dt);
    }
  }

  function nearestPocket(b) {
    var best = POCKETS[0], bestD = Infinity;
    for (var i = 0; i < POCKETS.length; i++) {
      var d = Math.hypot(b.x - POCKETS[i].x, b.y - POCKETS[i].y);
      if (d < bestD) { bestD = d; best = POCKETS[i]; }
    }
    return best;
  }

  /* A potted ball leaves play at once — it stops colliding, and stops holding up
     the settle — but goes on being drawn while it rolls in. Vanishing the instant
     it crossed a line was the jarring part.

     It carries on down the bisector at full spin and full size, and leaves by
     going under: it is drawn clipped to the open part of the table, so crossing
     the back edge of the hole cuts it off. Nothing shrinks and nothing fades out
     in the open — what takes it out of sight is the rail passing over it. */
  function startSink(b, p) {
    b.sinkT = 0;
    b.pocket = p;
    b.sinkFromX = b.x;
    b.sinkFromY = b.y;
    // Far enough down that it finishes wholly behind the hole's back edge.
    var end = toWorld(p, holeFarOf(p) + R + 0.9, 0);
    b.sinkToX = end.x;
    b.sinkToY = end.y;
    sinking.push(b);
  }

  var scratch = false;

  function respotCue() {
    var spot = cueSpot();
    // walk left along the table until the spot is clear
    for (var tries = 0; tries < 60; tries++) {
      var clear = true;
      for (var i = 0; i < balls.length; i++) {
        if (Math.hypot(balls[i].x - spot.x, balls[i].y - spot.y) < 2 * R + 0.1) {
          clear = false; break;
        }
      }
      if (clear) break;
      spot.x -= R;
      if (spot.x < R * 2) { spot.x = W * 0.25; spot.y += R * 2; }
    }
    balls.push(makeBall(0, spot.x, spot.y));
    scratch = false;
  }

  function cueBall() {
    for (var i = 0; i < balls.length; i++) if (balls[i].n === 0) return balls[i];
    return null;
  }

  // ---------------------------------------------------------------- render

  var scale = 1;

  /* Fit the table into whatever box the stage gives us, honouring both
     dimensions. In the full-screen panel the limiting axis is usually height,
     so sizing off width alone (as the inline version did) would overflow. */
  function resize() {
    var stage = root.querySelector('.pool-stage');
    if (!stage) return;
    var availW = stage.clientWidth;
    var availH = stage.clientHeight;
    if (!availW || !availH) return;

    // leave a little breathing room, and room under the table for the controls
    availW *= 0.96;
    availH = availH * 0.98 - 44;
    if (availH < 80) availH = 80;

    var tableW = W + 2 * RAIL, tableH = H + 2 * RAIL;
    var cssW = Math.min(availW, availH * tableW / tableH);
    var cssH = cssW * tableH / tableW;

    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    /* Match the element's corner radius to the radius actually painted inside
       it. The canvas is transparent outside the rail's rounded rect, and
       box-shadow follows the *element's* border-radius — so any mismatch draws
       a shadow around a squarer outline than the table, leaving the corners
       showing as pale notches. The painted radius scales with the table, so no
       fixed CSS value can track it; it has to be set here. */
    canvas.style.borderRadius = (FRAME_R * cssW / tableW).toFixed(2) + 'px';

    scale = (cssW / tableW) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(RAIL * scale, RAIL * scale);
    render();
  }

  function u(v) { return v * scale; }   // table units -> device pixels

  function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    drawFrame();
    drawPocketOpenings();
    drawCloth();
    drawSpots();
    drawShelfShade();
    drawDrops();
    /* Balls on their way down go in here, between the hole and the cushions, and
       clipped to whatever part of the table is open. That clip is what takes them
       out of sight: crossing the back edge of the hole cuts them off, so they roll
       under the rail rather than shrinking away. */
    for (var s = 0; s < sinking.length; s++) drawSinking(sinking[s]);
    drawCushions();
    drawDiamonds();
    drawAim();
    for (var i = 0; i < balls.length; i++) drawShadow(balls[i]);
    for (i = 0; i < balls.length; i++) drawBall(balls[i]);
    drawPower();
  }

  // How far into its drop a ball is, 0 for one still in play.
  function sunk(b) {
    return b.sinkT === undefined ? 0 : Math.min(1, b.sinkT / SINK_TIME);
  }

  function drawSinking(b) {
    ctx.save();
    // Open table: the bed, plus the hole it is dropping into.
    var open = new Path2D();
    open.rect(0, 0, u(W), u(H));
    openingInto(open, b.pocket);
    ctx.clip(open);
    drawShadow(b);
    drawBall(b);
    ctx.restore();
  }

  // --- table -----------------------------------------------------------

  function drawFrame() {
    var x0 = u(-RAIL), y0 = u(-RAIL);
    var w = u(W + 2 * RAIL), h = u(H + 2 * RAIL);

    var g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#7a5237');
    g.addColorStop(0.42, '#5c3a24');
    g.addColorStop(1, '#3a2315');
    roundRect(ctx, x0, y0, w, h, u(FRAME_R));
    ctx.fillStyle = g;
    ctx.fill();

    // a soft top highlight, so the rail reads as rounded rather than flat
    ctx.save();
    roundRect(ctx, x0, y0, w, h, u(FRAME_R));
    ctx.clip();
    var hl = ctx.createLinearGradient(0, y0, 0, y0 + u(RAIL));
    hl.addColorStop(0, 'rgba(255,255,255,0.16)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x0, y0, w, u(RAIL));
    ctx.restore();
  }

  function drawCloth() {
    ctx.fillStyle = CLOTH;
    ctx.fillRect(0, 0, u(W), u(H));

    // vignette: brighter under the lamp in the middle, falling off to the rails
    var g = ctx.createRadialGradient(u(W / 2), u(H / 2), 0, u(W / 2), u(H / 2), u(W * 0.62));
    g.addColorStop(0, 'rgba(255,255,255,0.085)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, u(W), u(H));
  }

  function drawSpots() {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(u(W * 0.75), u(H / 2), u(0.32), 0, 2 * Math.PI);
    ctx.fill();
  }

  /* Pockets, shaped per class rather than drawn as one circle apiece. A corner
     pocket's hole runs away into the corner along the diagonal; a side pocket's
     runs straight out under the rail, and is cut wider. Both are capsules — a
     mouth wide, and deeper than they are wide — which is what makes a hole read
     as somewhere a ball goes rather than a dot painted on the cloth.

     The gradient runs along the throat, lightest at the mouth where the cloth
     still catches light and black at the back. That is also what a sinking ball
     descends into: it is drawn over this, so the darkening it picks up on the
     way down matches the hole it is going into. */
  // Pass 1: the opening, from the nose line, so the mouth is open nose to nose.
  function drawPocketOpenings() {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      ctx.beginPath();
      openingInto(ctx, p);
      ctx.fillStyle = pocketShade(p);
      ctx.fill();
    }
  }

  /* Pass 2.5: the shelf, shaded. This is what stops a regulation corner looking
     sealed. Its drop sits 1.75in back from the noses, so the only cloth the drop
     actually cuts off is a 1in notch at the very corner — and with the shelf left
     at full cloth brightness the rest reads as ordinary table surface, as though
     the pocket had been painted on.

     On a real table that shelf is recessed below the rail line and lies in the
     shadow of the two jaws, and that shading is most of what tells you the pocket
     is open at all. Runs from nothing at the nose line to nearly the dark of the
     drop, so the two meet without a step. Clipped to the bed, so it only touches
     the part of the opening that is cloth — which leaves a side pocket, whose
     shelf is under the rail, untouched. */
  function drawShelfShade() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, u(W), u(H));
    ctx.clip();
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      var n0 = toWorld(p, noseSOf(p), 0), n1 = toWorld(p, fallSOf(p), 0);
      ctx.beginPath();
      openingInto(ctx, p);
      var g = ctx.createLinearGradient(u(n0.x), u(n0.y), u(n1.x), u(n1.y));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.26)');
      g.addColorStop(1, 'rgba(0,0,0,0.66)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  /* Pass 3: the drop — the part of the opening past the fall line. Clipped to that
     half-plane rather than drawn as its own shape, so the drop can never disagree
     with the opening about where the pocket's edge is. Everything between the fall
     line and the nose line therefore stays cloth, and that cloth is the shelf. */
  function drawDrops() {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      var fs = fallSOf(p), big = W;          // any span past the table will do
      var a = toWorld(p, fs, -big), b = toWorld(p, fs, big);
      var c = toWorld(p, fs + big, big), d = toWorld(p, fs + big, -big);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(u(a.x), u(a.y));
      ctx.lineTo(u(b.x), u(b.y));
      ctx.lineTo(u(c.x), u(c.y));
      ctx.lineTo(u(d.x), u(d.y));
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      openingInto(ctx, p);
      ctx.fillStyle = pocketShade(p);
      ctx.fill();
      ctx.restore();
    }
  }

  /* Cushions as separate runs between the pocket noses, each end cut at its own
     pocket's regulation facing angle — 26deg off the rail at a corner, 38deg at a
     side, derived from the WPA figures for the angle between a pocket's facings.

     The sense of that cut matters and used to be inverted: the nose is the
     closest point on the cushion to the pocket, and the facing rakes AWAY from
     the pocket as it goes back into the rubber, so the back edge is inset from
     the face. Drawn the other way round the rubber appeared to reach into the
     mouth, which is part of why the pockets read as the wrong shape. */
  function drawCushions() {
    // Each rail, as the pockets standing along it in order.
    var rails = [
      { horiz: true,  face: 0, back: -CUSH,    on: [POCKETS[0], POCKETS[1], POCKETS[2]], k: 'x' },
      { horiz: true,  face: H, back: H + CUSH, on: [POCKETS[3], POCKETS[4], POCKETS[5]], k: 'x' },
      { horiz: false, face: 0, back: -CUSH,    on: [POCKETS[0], POCKETS[3]],             k: 'y' },
      { horiz: false, face: W, back: W + CUSH, on: [POCKETS[2], POCKETS[5]],             k: 'y' }
    ];
    for (var r = 0; r < rails.length; r++) {
      var rail = rails[r];
      for (var i = 0; i + 1 < rail.on.length; i++) {
        var A = rail.on[i], B = rail.on[i + 1];
        var faceFrom = A[rail.k] + railGapOf(A);
        var faceTo = B[rail.k] - railGapOf(B);
        cushionRun(faceFrom, faceTo,
                   faceFrom + setbackOf(), faceTo - setbackOf(),
                   rail.face, rail.back, rail.horiz);
      }
    }
  }

  function cushionRun(f0, f1, k0, k1, faceC, backC, horiz) {
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(u(f0), u(faceC));
      ctx.lineTo(u(f1), u(faceC));
      ctx.lineTo(u(k1), u(backC));
      ctx.lineTo(u(k0), u(backC));
    } else {
      ctx.moveTo(u(faceC), u(f0));
      ctx.lineTo(u(faceC), u(f1));
      ctx.lineTo(u(backC), u(k1));
      ctx.lineTo(u(backC), u(k0));
    }
    ctx.closePath();
    var g = horiz ? ctx.createLinearGradient(0, u(faceC), 0, u(backC))
                  : ctx.createLinearGradient(u(faceC), 0, u(backC), 0);
    g.addColorStop(0, CUSHION_FACE);
    g.addColorStop(0.55, CUSHION_MID);
    g.addColorStop(1, CUSHION_BACK);
    ctx.fillStyle = g;
    ctx.fill();

    // Crisp line where the rubber meets the cloth, and along the two facing cuts
    // as well: the jaw tip is the edge of the pocket mouth, and without an outline
    // it dissolves into cloth of nearly the same colour.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, u(0.16));
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(u(f0), u(faceC)); ctx.lineTo(u(f1), u(faceC));
      ctx.moveTo(u(f0), u(faceC)); ctx.lineTo(u(k0), u(backC));
      ctx.moveTo(u(f1), u(faceC)); ctx.lineTo(u(k1), u(backC));
    } else {
      ctx.moveTo(u(faceC), u(f0)); ctx.lineTo(u(faceC), u(f1));
      ctx.moveTo(u(faceC), u(f0)); ctx.lineTo(u(backC), u(k0));
      ctx.moveTo(u(faceC), u(f1)); ctx.lineTo(u(backC), u(k1));
    }
    ctx.stroke();
  }

  /* Sights, at the standard eighth-of-the-playing-surface spacing. Nothing in
     the game uses them; they're just what makes a table look like a table. */
  function drawDiamonds() {
    var railMid = (RAIL + CUSH) / 2;
    var r = Math.max(1.2, u(0.62));
    var long = [W / 8, W / 4, 3 * W / 8, 5 * W / 8, 3 * W / 4, 7 * W / 8];
    var short = [H / 4, H / 2, 3 * H / 4];
    var i;
    for (i = 0; i < long.length; i++) {
      diamond(u(long[i]), u(-railMid), r);
      diamond(u(long[i]), u(H + railMid), r);
    }
    for (i = 0; i < short.length; i++) {
      diamond(u(-railMid), u(short[i]), r);
      diamond(u(W + railMid), u(short[i]), r);
    }
  }

  function diamond(cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = '#e7dcc0';
    ctx.fill();
  }

  // --- balls -----------------------------------------------------------

  function drawShadow(b) {
    // A ball in the hole has nothing left to cast a shadow onto.
    var q = sunk(b);
    if (q >= 1) return;
    var pr = u(R);
    // Fades as it leaves the cloth: there is nothing under a ball in a pocket for
    // it to cast onto. Quick, because it is over the hole almost at once.
    var fade = Math.max(0, 1 - q * 2.2);
    var cx = u(b.x) + pr * 0.16, cy = u(b.y) + pr * 0.26;
    var g = ctx.createRadialGradient(cx, cy, pr * 0.35, cx, cy, pr * 1.35);
    g.addColorStop(0, 'rgba(0,0,0,' + (0.34 * fade).toFixed(3) + ')');
    g.addColorStop(0.62, 'rgba(0,0,0,' + (0.14 * fade).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, pr * 1.35, 0, 2 * Math.PI);
    ctx.fill();
  }

  /* Fill the visible part of a spherical cap, in the projection of a ball
     already clipped to its own disc. Every marking on a ball is a cap — the
     number circles, and the white pole either side of a stripe — so this is the
     only piece of code that has to know how the sphere maps to the canvas.

     A cap's rim is a circle on the sphere, so under a straight-down view it
     projects to an ellipse: centred pr*cosA along the axis, pr*sinA wide square
     to it, squashed to |cz| of that along it. Down the axis that is a circle;
     edge-on it closes to a line, which is what makes a marking roll away rather
     than fade out.

     Once a cap laps the limb its rim is only partly in view, and the rest of
     what shows is bounded by the chord at pr*cosA from the centre. Working that
     second piece out exactly (rather than settling for the ellipse) is what
     keeps a marking from vanishing early as it crosses the edge. Falling out of
     the algebra: the chord only meets the disc while |cz| < sinA, so both cases
     below are self-limiting and need no test on cz beyond its sign. */
  function fillCap(px, py, pr, cx, cy, cz, cosA, sinA, style) {
    var m = Math.hypot(cx, cy);                  // in-plane part of the axis
    var d = m > 1e-9 ? pr * cosA / m : Infinity; // centre to the chord
    var lapping = d < pr;
    var phi = m > 1e-9 ? Math.atan2(cy, cx) : 0;
    var psi = lapping ? Math.acos(d / pr) : 0;

    var ecx = px + pr * cosA * cx;
    var ecy = py + pr * cosA * cy;
    var along = pr * sinA * Math.abs(cz);
    var across = pr * sinA;

    ctx.fillStyle = style;

    if (cz >= 0) {
      // Turned toward us: the rim ellipse, plus the far side of the chord if the
      // cap laps the limb.
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, along, across, phi, 0, 2 * Math.PI);
      ctx.fill();
      if (lapping) {
        ctx.beginPath();
        ctx.arc(px, py, pr, phi - psi, phi + psi);
        ctx.closePath();
        ctx.fill();
      }
    } else if (lapping) {
      // Turned away, but far enough round that its near edge still shows: what
      // is left is the far side of the chord, less the rim ellipse. Built as two
      // subpaths of one even-odd path, since the ellipse always sits inside the
      // disc and so punches a clean hole.
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr, phi - psi, phi + psi);
      ctx.closePath();
      ctx.clip();
      var hole = new Path2D();
      hole.arc(px, py, pr, 0, 2 * Math.PI);
      var rim = new Path2D();
      rim.ellipse(ecx, ecy, along, across, phi, 0, 2 * Math.PI);
      hole.addPath(rim);
      ctx.fill(hole, 'evenodd');
      ctx.restore();
    }
  }

  /* The number, mapped onto whichever pole is turned toward us. It is drawn in
     that pole's own tangent plane — up is -S, right is S x A — so it turns with
     the ball and squashes as the pole swings toward the limb, instead of sitting
     flat on the front of the sphere.

     Clipped to the rim ellipse, which is also what retires it: as the pole
     reaches the limb the ellipse closes to a line, so the glyph thins away
     rather than popping. That slightly under-draws a number whose circle laps
     the edge, which is the safe direction — it can never spill onto the colour.

     Drawn at 100 units to the radius rather than at final pixel size, so the
     font is asked for at a sane size and the transform does the scaling. */
  function drawNumber(b, px, py, pr) {
    var near = b.az >= 0 ? 1 : -1;
    var ax = b.ax * near, ay = b.ay * near, az = b.az * near;

    // Up is -S at either pole; right flips with the pole, or the number on the
    // far side would be drawn mirrored.
    var rx = (b.sy * b.az - b.sz * b.ay) * near;
    var ry = (b.sz * b.ax - b.sx * b.az) * near;
    var k = pr / 100;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px + pr * NUM_COS * ax, py + pr * NUM_COS * ay,
                pr * NUM_SIN * az, pr * NUM_SIN,
                Math.atan2(ay, ax), 0, 2 * Math.PI);
    ctx.clip();
    ctx.transform(rx * k, ry * k, b.sx * k, b.sy * k, px + pr * ax, py + pr * ay);
    ctx.fillStyle = '#1a1b1d';
    ctx.font = '600 58px ui-sans-serif, system-ui, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.n), 0, 2);
    ctx.restore();
  }

  function drawBall(b) {
    /* A ball on its way into a pocket keeps every marking and keeps turning. All
       that changes is that it shrinks, as anything falling away from the camera
       does, and goes dark as the hole closes over it — so the same code draws a
       ball in play and a ball two thirds gone. */
    var q = sunk(b);
    var px = u(b.x), py = u(b.y), pr = u(R);
    var color = b.n === 0 ? IVORY : COLORS[b.n];

    // Clip once, up front: every marking below is a cap fill that would
    // otherwise have to re-derive the silhouette for itself.
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = color;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);

    // Stripes: fill the white pole either side of the band and let the band be
    // whatever is left. One primitive covers both, and it comes out right at
    // every angle — a level bar side-on, a ring around the rim when the stripe
    // axis points at the camera.
    if (b.n > 8) {
      fillCap(px, py, pr,  b.sx,  b.sy,  b.sz, POLE_COS, POLE_SIN, IVORY);
      fillCap(px, py, pr, -b.sx, -b.sy, -b.sz, POLE_COS, POLE_SIN, IVORY);
    }

    // Both number circles, not just the near one: while a pole is within
    // NUM_SIN of the limb the far circle laps into view alongside it.
    if (b.n !== 0) {
      fillCap(px, py, pr,  b.ax,  b.ay,  b.az, NUM_COS, NUM_SIN, NUMBER_PATCH);
      fillCap(px, py, pr, -b.ax, -b.ay, -b.az, NUM_COS, NUM_SIN, NUMBER_PATCH);
      // Only where there are enough pixels to read it.
      if (pr >= 7) drawNumber(b, px, py, pr);
    }

    // Spherical shading: lit from upper-left, dark at the lower-right rim. Fixed
    // to the lamp overhead, not to the ball, so it must not turn with the
    // markings — which is why it is laid over them rather than under.
    var g = ctx.createRadialGradient(
      px - pr * 0.38, py - pr * 0.42, pr * 0.05,
      px - pr * 0.10, py - pr * 0.10, pr * 1.32
    );
    g.addColorStop(0, 'rgba(255,255,255,0.60)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.13)');
    g.addColorStop(0.66, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = g;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);

    /* Into the shade of the pocket. Only part way — the hole's back edge is what
       removes it, so this just has to stop a brightly lit ball looking pasted on
       top of a black hole. Squared, so it holds its colour while it is still over
       the shelf and darkens once it is properly inside. */
    if (q > 0) {
      ctx.fillStyle = 'rgba(7, 9, 7, ' + (0.62 * q * q).toFixed(3) + ')';
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    ctx.restore();

    // specular pin-point, last so it sits on top of everything
    if (q < 1) {
      ctx.beginPath();
      ctx.arc(px - pr * 0.34, py - pr * 0.38, pr * 0.15, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - q * q)).toFixed(3) + ')';
      ctx.fill();
    }
  }

  // --- aiming ----------------------------------------------------------

  function drawAim() {
    var cue = cueBall();
    if (!aim.active || !cue) return;
    var len = Math.hypot(aim.x - cue.x, aim.y - cue.y);
    if (len < 0.001) return;
    var ux = (aim.x - cue.x) / len, uy = (aim.y - cue.y) / len;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, u(0.2));
    ctx.setLineDash([u(1.5), u(1.5)]);
    ctx.beginPath();
    ctx.moveTo(u(cue.x + ux * R), u(cue.y + uy * R));
    ctx.lineTo(u(cue.x + ux * 40), u(cue.y + uy * 40));
    ctx.stroke();
    ctx.restore();
  }

  function drawPower() {
    if (!aim.active) return;
    var trackW = 30, trackH = 1.5;
    var x = W / 2 - trackW / 2;
    var y = H + CUSH + (RAIL - CUSH) / 2 - trackH / 2;

    roundRect(ctx, u(x), u(y), u(trackW), u(trackH), u(trackH / 2));
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();

    if (aim.power > 0.01) {
      roundRect(ctx, u(x), u(y), u(trackW * aim.power), u(trackH), u(trackH / 2));
      ctx.fillStyle = aim.power > 0.8 ? '#e0762a' : '#efe9d8';
      ctx.fill();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function announce() {
    if (!status) return;
    status.textContent = potted.length
      ? 'potted: ' + potted.slice().sort(function (a, b) { return a - b; }).join(', ')
      : '';
  }

  // ---------------------------------------------------------------- input

  var aim = { active: false, x: 0, y: 0, power: 0 };

  function toTable(ev) {
    var rect = canvas.getBoundingClientRect();
    var cssW = rect.width;
    var unit = cssW / (W + 2 * RAIL);
    return {
      x: (ev.clientX - rect.left) / unit - RAIL,
      y: (ev.clientY - rect.top) / unit - RAIL
    };
  }

  function canShoot() { return !busy() && cueBall(); }

  function onDown(ev) {
    if (!canShoot()) return;
    var p = toTable(ev);
    aim.active = true;
    aim.x = p.x; aim.y = p.y;
    updatePower();
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    render();
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!aim.active) return;
    var p = toTable(ev);
    aim.x = p.x; aim.y = p.y;
    updatePower();
    render();
    ev.preventDefault();
  }

  function updatePower() {
    var cue = cueBall();
    if (!cue) { aim.power = 0; return; }
    // Power ramps with how far the pointer is pulled from the cue ball,
    // saturating at roughly a third of the table's length.
    aim.power = Math.min(1, Math.hypot(aim.x - cue.x, aim.y - cue.y) / 34);
  }

  function onUp(ev) {
    if (!aim.active) return;
    aim.active = false;
    var cue = cueBall();
    if (cue && aim.power > 0.04) {
      var len = Math.hypot(aim.x - cue.x, aim.y - cue.y);
      if (len > 0.001) {
        var sp = MAX_SHOT * aim.power;
        cue.vx = (aim.x - cue.x) / len * sp;
        cue.vy = (aim.y - cue.y) / len * sp;
        start();
      }
    }
    aim.power = 0;
    render();
    if (ev) ev.preventDefault();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', function () { aim.active = false; render(); });
  // stop the page from panning while aiming on a touchscreen
  canvas.style.touchAction = 'none';

  if (rerackBtn) rerackBtn.addEventListener('click', function () { rack(); start(); });

  // ---------------------------------------------------------------- loop

  /* Advance the simulation by dt, split into substeps small enough that no
     ball travels more than a third of its radius in one tick. At the old fixed
     1/600s a 340 in/s break moved 0.57" per step — half a ball radius — which
     is enough to clip a contact or slip through a pocket mouth. */
  function advance(dt) {
    var maxSp = 0;
    for (var i = 0; i < balls.length; i++) {
      var sp = Math.hypot(balls[i].vx, balls[i].vy);
      if (sp > maxSp) maxSp = sp;
    }
    var sub = maxSp > 0 ? Math.min(1 / 240, (R / 3) / maxSp) : 1 / 240;
    var left = dt, guard = 0;
    while (left > 1e-9 && guard++ < 4000) {
      var h = Math.min(sub, left);
      step(h);
      left -= h;
    }
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;

    advance(dt);

    if (!busy()) {
      if (scratch) respotCue();
      running = false;
      render();
      return;
    }
    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    } else if (busy()) {
      start();
    }
  });

  // ---------------------------------------------------------------- reveal

  var opened = false;
  // True while the opening glide is in flight. Without it the scroll handler
  // below would see the panel still sitting under the viewport on the very
  // first frame and close it again before the page had travelled anywhere.
  var settling = false;

  /* Eased scroll. Native `behavior: smooth` is fast and its duration can't be
     set, which is most of why the reveal felt abrupt — and animating the
     panel's height at the same time made the target move while the scroll was
     chasing it. Here the height is committed instantly (invisible, since the
     panel is below the fold) and this glide is the only motion. */
  function glideTo(targetY, duration, done) {
    var startY = window.scrollY;
    var dy = targetY - startY;
    if (reduceMotion || Math.abs(dy) < 2) {
      window.scrollTo(0, targetY);
      if (done) done();
      return;
    }
    var t0 = null;
    function ease(p) {   // easeInOutCubic: unhurried at both ends
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    }
    function tick(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / duration);
      window.scrollTo(0, startY + dy * ease(p));
      if (p < 1) requestAnimationFrame(tick);
      else if (done) done();
    }
    requestAnimationFrame(tick);
  }

  function open() {
    if (opened) return;
    opened = true;
    root.classList.remove('is-collapsed', 'is-leaving');
    root.classList.add('is-open');
    root.removeAttribute('aria-hidden');
    hint.setAttribute('aria-expanded', 'true');
    hint.classList.add('is-open');

    // Height is now committed, so the stage finally has a box to measure.
    resize();
    var targetY = root.getBoundingClientRect().top + window.scrollY;

    // Ball positions survive a collapse, so a shot left mid-roll resumes.
    if (busy()) start();

    settling = true;
    // One frame later, so the arrival transition has a starting state to
    // animate from rather than being collapsed into the same style recalc.
    requestAnimationFrame(function () {
      root.classList.add('is-arriving');
      glideTo(targetY, 1250, function () { settling = false; });
    });
  }

  /* Leaving puts the table away. The invitation returns at its faintest and has
     to be clicked again — the pool is somewhere you go, not a state the page
     gets stuck in. Only the panel closes; the balls stay where they lie.

     The height is animated shut rather than dropped. There is usually less than
     a viewport of page above the panel, so removing 100svh at once leaves the
     scroll position past the new bottom and the browser clamps it — a sudden
     downward snap, precisely while the reader is scrolling up. Easing the
     height down lets that clamp happen a few pixels at a time, which reads as
     the page settling instead. */
  function collapse() {
    if (!opened) return;
    opened = false;
    settling = false;

    running = false;
    if (rafId) cancelAnimationFrame(rafId);

    root.classList.remove('is-arriving');
    root.setAttribute('aria-hidden', 'true');

    hint.classList.remove('is-open', 'is-ready');
    hint.setAttribute('aria-expanded', 'false');
    travelled = 0;
    hint.style.setProperty('--reveal', '0');

    if (reduceMotion) {
      root.classList.remove('is-open');
      root.classList.add('is-collapsed');
      return;
    }

    root.classList.add('is-leaving');
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      root.removeEventListener('transitionend', onEnd);
      // If it was reopened mid-close, open() already took over.
      if (!opened) {
        root.classList.remove('is-leaving', 'is-open');
        root.classList.add('is-collapsed');
      }
    }
    function onEnd(ev) {
      if (ev.propertyName === 'height') finish();
    }
    root.addEventListener('transitionend', onEnd);
    setTimeout(finish, 900);   // transitionend can be skipped if display changes
  }

  var backBtn = root.querySelector('.pool-back');
  if (backBtn) {
    backBtn.addEventListener('click', function () { glideTo(0, 1100, collapse); });
  }

  function atBottom() {
    return window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 6;
  }

  /* Scrolling past the end of the page is a tease, not a trigger: it darkens
     the invitation and fills its underline, but only a click opens the panel.
     That keeps the way in explicit and discoverable, instead of depending on
     someone pushing against a dead scrollbar long enough. The accumulated
     fraction is exposed as a CSS variable; leaving the bottom resets it. */
  var REVEAL_PX = 1500;
  var travelled = 0;

  function bumpReveal(px) {
    if (opened || !atBottom()) return;
    travelled = Math.min(REVEAL_PX, travelled + px);
    hint.style.setProperty('--reveal', (travelled / REVEAL_PX).toFixed(3));
    // At full progress the invitation is as loud as it gets — flag it so the
    // styling can say "ready", since nothing will happen until it's clicked.
    if (travelled >= REVEAL_PX) hint.classList.add('is-ready');
  }

  // Reveal the prompt once it comes into view.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) hint.classList.add('is-visible');
      });
    }, { threshold: 0.9 }).observe(hint);
  } else {
    hint.classList.add('is-visible');
  }

  window.addEventListener('wheel', function (ev) {
    if (ev.deltaY > 0) bumpReveal(ev.deltaY);
  }, { passive: true });

  window.addEventListener('keydown', function (ev) {
    if (opened) return;
    var k = ev.key;
    if (k === 'ArrowDown') bumpReveal(110);
    else if (k === 'PageDown') bumpReveal(380);
    else if (k === 'End') bumpReveal(REVEAL_PX);
  });

  // Clicking is the only way in — see bumpReveal.
  hint.addEventListener('click', open);

  // Reset if they wander back up, so the invitation builds again next time.
  window.addEventListener('scroll', function () {
    if (opened) {
      if (settling) return;
      /* Close once the table is mostly gone rather than entirely gone. The
         panel is a full viewport tall and there is usually less page than that
         above it, so "entirely below the viewport" is unreachable by scrolling
         and only the back button ever fired. Its top edge dropping past the
         middle of the screen means the reader has clearly left. */
      var top = root.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.45) collapse();
      return;
    }
    if (atBottom()) return;
    travelled = 0;
    hint.classList.remove('is-ready');
    hint.style.setProperty('--reveal', '0');
  }, { passive: true });

  var touchY = null;
  window.addEventListener('touchstart', function (ev) {
    touchY = ev.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchmove', function (ev) {
    if (opened || touchY === null) return;
    var dy = touchY - ev.touches[0].clientY;
    if (dy > 0) bumpReveal(dy);
    touchY = ev.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('resize', resize);

  rack();
  resize();

  /* Debug surface. Small enough to be worth keeping: it makes the simulation
     drivable from a console (or a headless harness) without a mouse, which is
     the only practical way to check that shots settle, nothing tunnels through
     a cushion, and no velocity goes NaN. */
  window.__pool = {
    state: function () {
      return { balls: balls, potted: potted, sinking: sinking, moving: anyMoving(), busy: busy() };
    },
    geometry: {
      W: W, H: H, R: R, POCKETS: POCKETS,
      MOUTH_CORNER: MOUTH_CORNER, MOUTH_SIDE: MOUTH_SIDE,
      SHELF_CORNER: SHELF_CORNER, SHELF_SIDE: SHELF_SIDE,
      JAW_ANGLE: JAW_ANGLE,
      NOSE_R: NOSE_R, NOSES: NOSES, SINK_TIME: SINK_TIME,
      mouthOf: mouthOf, shelfOf: shelfOf, noseSOf: noseSOf, fallSOf: fallSOf,
      railGapOf: railGapOf, facingRad: facingRad, setbackOf: setbackOf,
      holeFarOf: holeFarOf,
      toLocal: toLocal, toWorld: toWorld,
      NUM_SIN: NUM_SIN, NUM_COS: NUM_COS, POLE_SIN: POLE_SIN, POLE_COS: POLE_COS
    },
    step: step,
    advance: advance,
    rack: rack,
    // Orientation is state the eye checks but assertions can't reach through
    // step() alone, so the roll and the redraw are drivable on their own.
    roll: roll,
    render: render,
    makeBall: makeBall,
    shoot: function (vx, vy) {
      var cue = cueBall();
      if (cue) { cue.vx = vx; cue.vy = vy; }
    },
    settle: function (maxSeconds) {
      var t = 0, cap = maxSeconds || 60;
      while (busy() && t < cap) { advance(1 / 120); t += 1 / 120; }
      if (scratch) respotCue();
      return t;
    }
  };
})();
