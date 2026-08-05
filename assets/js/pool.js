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
  var POCKET_R = 2.6;     // a ball whose centre comes this close is potted
  // The cushion is cut away within MOUTH of each pocket so balls drop instead
  // of rattling off the jaws. This MUST stay below POCKET_R: any ball that
  // crosses the rail line through the gap has to be inside the capture radius,
  // or it slips past the cushion, is never potted, and leaves the table.
  var MOUTH = 2.2;

  // Rolling resistance on cloth. Real billiard cloth gives a rolling ball
  // about 4-10 in/s^2 (mu_roll ~= 0.01 against g = 386 in/s^2). 42 was far too
  // draggy, 7 let balls run too freely, 11 was slightly heavy; 9 sits mid-band.
  var ROLL_DECEL = 9;
  var BALL_E = 0.95;
  var CUSHION_E = 0.75;
  var CUSHION_FRICTION = 0.97;
  var SLEEP_SPEED = 0.6;      // below this a ball is parked
  var MAX_SHOT = 340;         // in/s, roughly a hard break

  // Cosmetic geometry, drawing only — the physics never reads these.
  var CUSH = 1.5;                   // cushion depth outside the playing surface
  var JAW = 1.2;                    // how far each cushion face is cut back
  var VMOUTH = POCKET_R * 1.14;     // visual pocket opening half-width
  var FRAME_R = 2.4;                // corner radius of the outer rail

  var POCKETS = [
    { x: 0, y: 0 }, { x: W / 2, y: 0 }, { x: W, y: 0 },
    { x: 0, y: H }, { x: W / 2, y: H }, { x: W, y: H }
  ];


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

  var balls = [];
  var potted = [];
  var running = false;
  var rafId = null;
  var lastT = 0;

  function cueSpot() { return { x: W * 0.25, y: H / 2 }; }

  function rack() {
    balls = [];
    potted = [];
    var spot = cueSpot();
    balls.push({ n: 0, x: spot.x, y: spot.y, vx: 0, vy: 0 });

    var footX = W * 0.72;
    // A hair of air between balls. Racking them at exactly 2R leaves every
    // neighbour in contact, so floating-point noise puts some pairs marginally
    // inside the collision threshold and the first step resolves the whole
    // rack at once — the break flies apart unnaturally. Real racks have gaps.
    var pitch = 2 * R * 1.004;
    var rowGap = (pitch / 2) * Math.sqrt(3);
    for (var i = 0; i < RACK.length; i++) {
      for (var j = 0; j < RACK[i].length; j++) {
        balls.push({
          n: RACK[i][j],
          x: footX + i * rowGap,
          y: H / 2 + (j - i / 2) * pitch,
          vx: 0, vy: 0
        });
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

  /* True when the ball sits in a pocket's mouth, where the cushion is cut
     away. Without this the rails would bounce balls off the pocket jaws. */
  function inMouth(b, axis, at) {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      if (axis === 'x' && p.y === at && Math.abs(b.x - p.x) < MOUTH) return true;
      if (axis === 'y' && p.x === at && Math.abs(b.y - p.y) < MOUTH) return true;
    }
    return false;
  }

  function step(dt) {
    var i, j, b;

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.vx && !b.vy) continue;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Rolling resistance acts against the direction of travel, so a ball
      // decelerates linearly and actually comes to rest.
      var sp = Math.hypot(b.vx, b.vy);
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
      var gone = false;
      for (j = 0; j < POCKETS.length; j++) {
        if (Math.hypot(b.x - POCKETS[j].x, b.y - POCKETS[j].y) < POCKET_R) {
          gone = true;
          break;
        }
      }
      // Safety net. MOUTH < POCKET_R should make escape impossible, but a
      // ball that somehow ends up beyond the rails would otherwise coast away
      // forever and never let the table settle. Treat it as pocketed.
      if (!gone && (b.x < -R || b.x > W + R || b.y < -R || b.y > H + R)) {
        gone = true;
      }
      if (gone) {
        balls.splice(i, 1);
        if (b.n !== 0) potted.push(b.n);
        else scratch = true;
        announce();
      }
    }
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
    balls.push({ n: 0, x: spot.x, y: spot.y, vx: 0, vy: 0 });
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
    drawCloth();
    drawSpots();
    drawPockets();
    drawCushions();
    drawDiamonds();
    drawAim();
    for (var i = 0; i < balls.length; i++) drawShadow(balls[i]);
    for (i = 0; i < balls.length; i++) drawBall(balls[i]);
    drawPower();
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

  function drawPockets() {
    for (var i = 0; i < POCKETS.length; i++) {
      var p = POCKETS[i];
      var pr = u(POCKET_R * 1.08);
      var g = ctx.createRadialGradient(u(p.x), u(p.y), pr * 0.15, u(p.x), u(p.y), pr);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.72, '#080a07');
      g.addColorStop(1, '#20241c');
      ctx.beginPath();
      ctx.arc(u(p.x), u(p.y), pr, 0, 2 * Math.PI);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  /* Cushions as separate segments between the pocket openings, each with its
     face cut back at both ends. That taper is what makes the pocket jaws read
     as jaws instead of a rectangle with holes punched in it. */
  function drawCushions() {
    var i;
    var alongLong = [[VMOUTH, W / 2 - VMOUTH], [W / 2 + VMOUTH, W - VMOUTH]];
    var alongShort = [[VMOUTH, H - VMOUTH]];

    for (i = 0; i < alongLong.length; i++) {
      cushionH(alongLong[i][0], alongLong[i][1], 0, -CUSH);      // head rail
      cushionH(alongLong[i][0], alongLong[i][1], H, H + CUSH);   // foot rail
    }
    for (i = 0; i < alongShort.length; i++) {
      cushionV(alongShort[i][0], alongShort[i][1], 0, -CUSH);
      cushionV(alongShort[i][0], alongShort[i][1], W, W + CUSH);
    }
  }

  function cushionFill(faceA, faceB) {
    var g = ctx.createLinearGradient(0, u(faceA), 0, u(faceB));
    g.addColorStop(0, CUSHION_FACE);
    g.addColorStop(0.55, CUSHION_MID);
    g.addColorStop(1, CUSHION_BACK);
    return g;
  }

  function cushionH(x1, x2, faceY, backY) {
    ctx.beginPath();
    ctx.moveTo(u(x1 + JAW), u(faceY));
    ctx.lineTo(u(x2 - JAW), u(faceY));
    ctx.lineTo(u(x2), u(backY));
    ctx.lineTo(u(x1), u(backY));
    ctx.closePath();
    ctx.fillStyle = cushionFill(faceY, backY);
    ctx.fill();
    // crisp line where the rubber meets the cloth
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, u(0.16));
    ctx.beginPath();
    ctx.moveTo(u(x1 + JAW), u(faceY));
    ctx.lineTo(u(x2 - JAW), u(faceY));
    ctx.stroke();
  }

  function cushionV(y1, y2, faceX, backX) {
    ctx.beginPath();
    ctx.moveTo(u(faceX), u(y1 + JAW));
    ctx.lineTo(u(faceX), u(y2 - JAW));
    ctx.lineTo(u(backX), u(y2));
    ctx.lineTo(u(backX), u(y1));
    ctx.closePath();
    var g = ctx.createLinearGradient(u(faceX), 0, u(backX), 0);
    g.addColorStop(0, CUSHION_FACE);
    g.addColorStop(0.55, CUSHION_MID);
    g.addColorStop(1, CUSHION_BACK);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1, u(0.16));
    ctx.beginPath();
    ctx.moveTo(u(faceX), u(y1 + JAW));
    ctx.lineTo(u(faceX), u(y2 - JAW));
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
    var pr = u(R);
    var cx = u(b.x) + pr * 0.16, cy = u(b.y) + pr * 0.26;
    var g = ctx.createRadialGradient(cx, cy, pr * 0.35, cx, cy, pr * 1.35);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, pr * 1.35, 0, 2 * Math.PI);
    ctx.fill();
  }

  function drawBall(b) {
    var px = u(b.x), py = u(b.y), pr = u(R);
    var color = b.n === 0 ? '#f7f4ea' : COLORS[b.n];
    var striped = b.n > 8;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = striped ? '#f7f4ea' : color;
    ctx.fill();

    if (striped) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(px - pr, py - pr * 0.54, pr * 2, pr * 1.08);
      ctx.restore();
    }

    // spherical shading: lit from upper-left, dark at the lower-right rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, 2 * Math.PI);
    ctx.clip();
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
    ctx.restore();
    ctx.restore();

    // number, only where there are enough pixels to read it
    if (b.n !== 0 && pr >= 7) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.44, 0, 2 * Math.PI);
      ctx.fillStyle = '#f9f7ef';
      ctx.fill();
      ctx.fillStyle = '#1a1b1d';
      ctx.font = '600 ' + (pr * 0.58) + 'px ui-sans-serif, system-ui, Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.n), px, py + pr * 0.02);
      ctx.restore();
    }

    // specular pin-point, last so it sits on top of everything
    ctx.beginPath();
    ctx.arc(px - pr * 0.34, py - pr * 0.38, pr * 0.15, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
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

  function canShoot() { return !anyMoving() && cueBall(); }

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

    if (!anyMoving()) {
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
    } else if (anyMoving()) {
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
    if (anyMoving()) start();

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
    state: function () { return { balls: balls, potted: potted, moving: anyMoving() }; },
    geometry: { W: W, H: H, R: R, POCKETS: POCKETS, POCKET_R: POCKET_R },
    step: step,
    advance: advance,
    rack: rack,
    shoot: function (vx, vy) {
      var cue = cueBall();
      if (cue) { cue.vx = vx; cue.vy = vy; }
    },
    settle: function (maxSeconds) {
      var t = 0, cap = maxSeconds || 60;
      while (anyMoving() && t < cap) { advance(1 / 120); t += 1 / 120; }
      if (scratch) respotCue();
      return t;
    }
  };
})();
