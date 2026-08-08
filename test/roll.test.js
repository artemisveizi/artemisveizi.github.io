/*
 * Rolling and ball-marking tests for assets/js/pool.js.
 *
 * The interesting one is "texture mapping matches the sphere": it lifts each
 * pixel of a rendered ball back onto the unit sphere, works out which marking
 * belongs at that point, and compares against what the shipped drawing code
 * actually painted. That checks the spherical-cap projection — including the
 * awkward case of a cap lapping the limb — rather than trusting it.
 *
 *   node test/roll.test.js
 */
'use strict';

var T = require('./harness');
// Path as well as Ctx: the clip patch further down does an instanceof against it.
var ok = T.ok, near = T.near, group = T.group, Ctx = T.Ctx, Path = T.Path;

var loaded = T.loadPool();
var pool = loaded.pool;
var ctx = loaded.ctx;

var G = pool.geometry;
var R = G.R;

// ------------------------------------------------------------------ helpers

function frameOf(b) { return [b.ax, b.ay, b.az, b.sx, b.sy, b.sz]; }

function orthonormal(b, tol) {
  var an = Math.hypot(b.ax, b.ay, b.az);
  var sn = Math.hypot(b.sx, b.sy, b.sz);
  var dot = b.ax * b.sx + b.ay * b.sy + b.az * b.sz;
  return Math.abs(an - 1) < tol && Math.abs(sn - 1) < tol && Math.abs(dot) < tol;
}

// Roll a lone ball a given distance in a given direction, using the real roll().
function rollBall(b, dirx, diry, dist, steps) {
  var sp = 100;
  var n = steps || 400;
  var dt = (dist / sp) / n;
  var m = Math.hypot(dirx, diry);
  b.vx = sp * dirx / m; b.vy = sp * diry / m;
  for (var i = 0; i < n; i++) pool.roll(b, sp, dt);
  b.vx = 0; b.vy = 0;
}

// Render exactly one ball and return a colour probe over its disc.
function probe(ball) {
  var st = pool.state();
  st.balls.length = 0;
  st.balls.push(ball);
  ctx.fills = [];
  ctx.clips = [];
  ctx.stack = [];
  pool.render();
  // Locate the ball's disc from the clip arc the draw opens with: the only
  // full circle of the ball's radius that gets clipped to.
  return ctx;
}

// ---------------------------------------------------------------- tests

group('rack + frame invariants');
pool.rack();
var st = pool.state();
ok(st.balls.length === 16, 'racked 16 balls');
var allOrtho = st.balls.every(function (b) { return orthonormal(b, 1e-12); });
ok(allOrtho, 'every racked ball has an orthonormal frame');
var facing = st.balls.every(function (b) { return b.az === 1 && b.sy === 1; });
ok(facing, 'racked balls face the camera with a level stripe axis');

group('rolling direction and amount');
var b = pool.makeBall(9, 50, 25);
// Roll a quarter turn to the right: the number pole should travel to the
// leading edge, i.e. from +z round to +x.
rollBall(b, 1, 0, R * Math.PI / 2, 2000);
near(b.ax, 1, 1e-6, 'rolling right carries the number pole to +x');
near(b.ay, 0, 1e-6, 'no y drift when rolling along x');
near(b.az, 0, 1e-6, 'pole has left the face');
near(b.sy, 1, 1e-6, 'stripe axis is unmoved by rolling along it');

b = pool.makeBall(9, 50, 25);
rollBall(b, 0, 1, R * Math.PI / 2, 2000);
near(b.ay, 1, 1e-6, 'rolling down carries the pole to +y');
near(b.ax, 0, 1e-6, 'no x drift when rolling along y');

b = pool.makeBall(9, 50, 25);
rollBall(b, 1, 0, 2 * Math.PI * R, 4000);
near(b.ax, 0, 1e-6, 'a full circumference returns the pole: ax');
near(b.ay, 0, 1e-6, 'a full circumference returns the pole: ay');
near(b.az, 1, 1e-6, 'a full circumference returns the pole: az');

b = pool.makeBall(9, 50, 25);
rollBall(b, 0.6, -0.8, R * 2 * Math.PI, 4000);
ok(orthonormal(b, 1e-9), 'frame stays orthonormal after a diagonal full turn');

group('frame survives a break');
pool.rack();
pool.shoot(300, 6);
var t = pool.settle(90);
ok(t > 0 && t < 90, 'break settles in ' + t.toFixed(1) + 's');
st = pool.state();
var anyNaN = st.balls.some(function (bb) {
  return frameOf(bb).some(function (v) { return !isFinite(v); });
});
ok(!anyNaN, 'no NaN or Infinity in any orientation after a break');
ok(st.balls.every(function (bb) { return orthonormal(bb, 1e-9); }),
   'every frame still orthonormal after a break (' + st.balls.length + ' on table)');
var turned = st.balls.filter(function (bb) { return bb.az < 0.999; }).length;
ok(turned >= st.balls.length - 1, turned + '/' + st.balls.length + ' balls actually turned');

group('texture mapping matches the sphere');
/* The real check: render a ball at some orientation, then for a grid of pixels
   inside its disc, lift the pixel back onto the sphere and ask which marking
   should be there. Compares against what the shipped drawing code painted. */
function checkTexture(n, ax, ay, az, sx, sy, sz, label) {
  var ball = pool.makeBall(n, 50, 25);
  ball.ax = ax; ball.ay = ay; ball.az = az;
  ball.sx = sx; ball.sy = sy; ball.sz = sz;
  probe(ball);

  // The disc, recovered the same way the renderer computes it.
  var scale = ctx.__scale;
  var px = ctx.__px, py = ctx.__py, pr = ctx.__pr;

  var COLORS = {
    1: '#e8b427', 2: '#152c6b', 3: '#c0392b', 4: '#4a1d78',
    5: '#e0762a', 6: '#1c7a4a', 7: '#7d3b2e', 8: '#18191b',
    9: '#e8b427', 10: '#152c6b', 11: '#c0392b', 12: '#4a1d78',
    13: '#e0762a', 14: '#1c7a4a', 15: '#7d3b2e'
  };
  var IVORY = '#f7f4ea', PATCH = '#f9f7ef';
  var striped = n > 8;
  var eps = 0.03, bad = 0, tested = 0, first = null;

  var N = 220;
  for (var i = 0; i <= N; i++) {
    for (var j = 0; j <= N; j++) {
      var dx = (2 * i / N - 1), dy = (2 * j / N - 1);
      var rr = dx * dx + dy * dy;
      if (rr > 1) continue;
      var dz = Math.sqrt(1 - rr);
      if (dz < eps * 2) continue;                       // skip the limb

      var pa = dx * ax + dy * ay + dz * az;
      var ps = dx * sx + dy * sy + dz * sz;
      // Skip pixels straddling a boundary, where a half-pixel of rasterising
      // difference is not a defect.
      if (Math.abs(Math.abs(pa) - G.NUM_COS) < eps) continue;
      if (striped && Math.abs(Math.abs(ps) - G.POLE_COS) < eps) continue;

      var want;
      if (n === 0) want = IVORY;
      else if (Math.abs(pa) >= G.NUM_COS) want = PATCH;
      else if (striped) want = Math.abs(ps) <= G.POLE_COS ? COLORS[n] : IVORY;
      else want = COLORS[n];

      var got = ctx.colorAt(px + dx * pr, py + dy * pr);
      tested++;
      if (got !== want) {
        bad++;
        if (!first) first = { dx: dx.toFixed(3), dy: dy.toFixed(3), got: got, want: want };
      }
    }
  }
  ok(bad === 0, label + ' — ' + bad + '/' + tested + ' pixels wrong' +
     (first ? ' e.g. (' + first.dx + ',' + first.dy + ') got ' + first.got +
              ' want ' + first.want : ''));
}

// Recover the disc the renderer used, by watching for the clip circle.
var origClip = Ctx.prototype.clip;
Ctx.prototype.clip = function (arg, rule) {
  if (!(arg instanceof Path) && this.__lastCircle) {
    this.__px = this.__lastCircle[0];
    this.__py = this.__lastCircle[1];
    this.__pr = this.__lastCircle[2];
  }
  return origClip.call(this, arg, rule);
};
var origArc = Ctx.prototype.arc;
Ctx.prototype.arc = function (cx, cy, r, a0, a1) {
  if (Math.abs((a1 - a0) - 2 * Math.PI) < 1e-9) this.__lastCircle = [cx, cy, r];
  return origArc.call(this, cx, cy, r, a0, a1);
};

var s2 = Math.SQRT1_2;

/* Build the kind of frame roll() maintains: A unit, S unit and square to it.
   Feeding checkTexture anything else tests a state the renderer never sees. */
function frame(ax, ay, az, sx, sy, sz) {
  var la = Math.hypot(ax, ay, az);
  ax /= la; ay /= la; az /= la;
  var d = ax * sx + ay * sy + az * sz;
  sx -= ax * d; sy -= ay * d; sz -= az * d;
  var ls = Math.hypot(sx, sy, sz);
  return [ax, ay, az, sx / ls, sy / ls, sz / ls];
}

function check(n, f, label) {
  checkTexture(n, f[0], f[1], f[2], f[3], f[4], f[5], label);
}

check(9, frame(0, 0, 1, 0, 1, 0), 'stripe, racked (pole at camera, level band)');
check(3, frame(0, 0, 1, 0, 1, 0), 'solid, racked');
check(9, frame(1, 0, 0, 0, 1, 0), 'stripe, pole rolled to the leading limb');
check(9, frame(0, 0, 1, 1, 0, 0), 'stripe, band upright');
check(9, frame(0, 1, 0, 0, 0, 1), 'stripe axis at the camera (band as a rim ring)');
check(11, frame(s2, 0, s2, 0, 1, 0), 'stripe, pole half-turned');
check(5, frame(1, 0.5, 0.5, -1, 0.5, 0.5), 'solid, skewed frame');
check(14, frame(-0.3, 0.5, -0.812, 0.9, 0.3, -0.316), 'stripe, pole turned away');
check(0, frame(0, 0, 1, 0, 1, 0), 'cue ball stays plain');

// Branch coverage, spelled out rather than hoped for. The cap fill has three
// outcomes — rim ellipse only, ellipse plus the chord's far side, and the
// chord's far side less the ellipse — and which one applies turns on the axis'
// z against the cap's own sine.
check(12, frame(0, 0.25, -0.25, 1, 0, 0), 'stripe, number cap just past the limb');
check(4, frame(0.4, 0.2, -0.2, 0, 1, 0.3), 'solid, number cap just past the limb');
check(10, frame(0, 1, 0, 0.2, 0, -0.3), 'stripe, both bands lapping the limb');
check(13, frame(0.5, -0.5, 0.1, 0.3, 0.4, -0.9), 'stripe, everything oblique');

group('texture mapping, random orthonormal frames');
// Deterministic LCG: the point is coverage of every branch and sign, not
// surprise, and a run that fails has to be reproducible.
var seed = 20260805;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
var badFrames = 0;
for (var q = 0; q < 40; q++) {
  var f = frame(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1,
                rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
  var num = q % 2 ? 9 : 3;                    // alternate striped and solid
  var before = T.failures();
  checkTexture(num, f[0], f[1], f[2], f[3], f[4], f[5],
               'random frame ' + q + ' (' + (num > 8 ? 'stripe' : 'solid') + ')');
  if (T.failures() > before) badFrames++;
}
ok(badFrames === 0, badFrames + ' of 40 random frames mismapped');

group('markings hold their projected size head-on');
/* A ball facing the camera must look exactly like the old flat renderer, or the
   rolling work has quietly restyled every ball on the table. */
var ball = pool.makeBall(9, 50, 25);
probe(ball);
var pxc = ctx.__px, pyc = ctx.__py, prc = ctx.__pr;
// Band half-width was a fillRect of 0.54*pr either side of centre.
ok(ctx.colorAt(pxc, pyc + prc * 0.50) === '#f9f7ef' ||
   ctx.colorAt(pxc, pyc + prc * 0.50) === '#e8b427',
   'inside the band at 0.50pr is stripe or number patch');
ok(ctx.colorAt(pxc, pyc + prc * 0.60) === '#f7f4ea', 'ivory just outside the band at 0.60pr');
ok(ctx.colorAt(pxc, pyc + prc * 0.48) === '#e8b427', 'stripe colour at 0.48pr, clear of the patch');
ok(ctx.colorAt(pxc, pyc) === '#f9f7ef', 'number patch at the centre');
ok(ctx.colorAt(pxc + prc * 0.40, pyc) === '#f9f7ef', 'number patch still at 0.40pr');
ok(ctx.colorAt(pxc + prc * 0.47, pyc) === '#e8b427', 'past the patch at 0.47pr');

T.report();
