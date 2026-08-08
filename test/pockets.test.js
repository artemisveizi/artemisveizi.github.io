/*
 * Pocket and sink tests for assets/js/pool.js.
 *
 * The failure these guard against is silent and specific: the cushion is cut
 * away across a pocket mouth, so a ball that enters the gap and is neither
 * dropped nor turned back by a nose peg has nothing left to stop it and coasts
 * off the table forever.
 *
 * The mouth probe fires shots parallel to each pocket's bisector from measured
 * lateral offsets — parallel, so the offset survives to the mouth — and checks
 * both that nothing escapes and that the pot rate falls off the way a
 * regulation pocket's should.
 *
 *   node test/pockets.test.js
 */
'use strict';

// Imported as T, not H: H is the table height throughout this file.
var T = require('./harness');
var ok = T.ok, group = T.group;

function loadPool() { return T.loadPool().pool; }

var pool = loadPool();

var G = pool.geometry;
var W = G.W, H = G.H, R = G.R;

group('spec conformance');
ok(Math.abs(G.MOUTH_CORNER * 2 - 4.5) < 1e-9, 'corner mouth is 4.5in across');
ok(Math.abs(G.MOUTH_SIDE * 2 - 5.0) < 1e-9, 'side mouth is 5.0in across');
ok(G.MOUTH_SIDE > G.MOUTH_CORNER, 'side mouths are the wider pair');
ok(G.JAW_ANGLE === 45, 'jaw facings are cut at 45deg off the rail');
ok(Math.abs(G.SHELF_CORNER - 1.75) < 1e-9, 'corner shelf is 1 3/4in');
ok(G.SHELF_SIDE < G.SHELF_CORNER, 'sides are cut with far less shelf');
ok(G.POCKETS.length === 6, 'six pockets');
ok(G.POCKETS.filter(function (p) { return p.corner; }).length === 4, 'four of them corners');
ok(G.NOSES.length === 12, 'twelve nose pegs');

group('derived geometry');
// A 45deg cut means equal run and rise: the set-back along the rail is the
// cushion's own depth.
var deg = G.facingRad() * 180 / Math.PI;
ok(Math.abs(deg - 45) < 1e-9, 'facing sits 45deg off the rail (got ' + deg.toFixed(2) + ')');
ok(G.setbackOf() > 0, 'facings rake away from the pocket, not into it');
ok(Math.abs(G.setbackOf() - 1.5) < 1e-9,
   'set-back equals the cushion depth (got ' + G.setbackOf().toFixed(3) + ')');

// Nose positions: mouth apart, and on the rails.
G.POCKETS.forEach(function (p, i) {
  var a = G.toWorld(p, G.noseSOf(p), G.mouthOf(p));
  var b = G.toWorld(p, G.noseSOf(p), -G.mouthOf(p));
  var span = Math.hypot(a.x - b.x, a.y - b.y);
  ok(Math.abs(span - G.mouthOf(p) * 2) < 1e-9,
     'pocket ' + i + ': noses are one mouth apart');
  // Both noses must sit on a rail line.
  [a, b].forEach(function (nz) {
    var onRail = Math.abs(nz.x) < 1e-9 || Math.abs(nz.x - W) < 1e-9 ||
                 Math.abs(nz.y) < 1e-9 || Math.abs(nz.y - H) < 1e-9;
    ok(onRail, 'pocket ' + i + ': nose lies on a rail line');
  });
});

group('the clean gap between nose pegs is half a ball');
G.POCKETS.forEach(function (p, i) {
  var gap = G.mouthOf(p) - R - G.NOSE_R;
  ok(gap > 0, 'pocket ' + i + ': a ball can pass at all (gap ' + gap.toFixed(3) + 'in)');
  ok(gap < R, 'pocket ' + i + ': and only just — under one ball radius');
});

group('outward vectors point off the table');
G.POCKETS.forEach(function (p, i) {
  var len = Math.hypot(p.ox, p.oy);
  ok(Math.abs(len - 1) < 1e-9, 'pocket ' + i + ': outward vector is unit');
  // A step outward must leave the playing surface.
  var ox = p.x + p.ox * 0.5, oy = p.y + p.oy * 0.5;
  ok(ox < 0 || ox > W || oy < 0 || oy > H,
     'pocket ' + i + ': outward leads off the surface');
});

group('mouth probe: escape, and how often a ball actually drops');
/* Fire PARALLEL to each pocket's bisector from a measured lateral offset, so the
   offset survives all the way to the mouth. Aiming at the pocket point instead —
   which an earlier version of this test did — makes every shot converge to dead
   centre and the offsets do nothing, which is how 504/504 came to pot.

   Two things are being checked. Nothing may ever leave the table, at any offset
   or speed. And the pot rate across the offsets is the feel number: a regulation
   pocket is supposed to refuse an off-centre ball. */
var escapes = 0, unsettled = 0;
var SPEEDS = [40, 90, 150, 220, 300, 340];
// Offsets as a fraction of the mouth half-width. The clean gap for a ball's
// centre is (mouth/2 - R - NOSE_R), so anything past about 0.35 should struggle.
var OFFSETS = [0, 0.2, 0.35, 0.5, 0.7, 0.85, 1.0, 1.15];
var byOffset = {};

G.POCKETS.forEach(function (p, pi) {
  var tx = -p.oy, ty = p.ox;
  OFFSETS.forEach(function (f) {
    [1, -1].forEach(function (sgn) {
      SPEEDS.forEach(function (sp) {
        var pl = loadPool();
        pl.rack();
        var st = pl.state();
        st.balls.length = 0;
        var off = G.mouthOf(p) * f * sgn;
        var startX = p.x - p.ox * 24 + tx * off;
        var startY = p.y - p.oy * 24 + ty * off;
        var b = pl.makeBall(1, startX, startY);
        b.vx = p.ox * sp; b.vy = p.oy * sp;       // straight down the bisector
        st.balls.push(b);
        pl.settle(120);

        var after = pl.state();
        var key = f.toFixed(2);
        byOffset[key] = byOffset[key] || { shots: 0, potted: 0 };
        byOffset[key].shots++;
        if (!after.balls.length) byOffset[key].potted++;
        after.balls.forEach(function (q) {
          if (q.x < -R || q.x > W + R || q.y < -R || q.y > H + R) {
            escapes++;
            if (escapes === 1) {
              console.log('  FAIL  escaped: pocket ' + pi + ' offset ' + f +
                          ' sgn ' + sgn + ' speed ' + sp +
                          ' -> (' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ')');
            }
          }
          if (q.vx || q.vy) unsettled++;
        });
      });
    });
  });
});
ok(escapes === 0, escapes + ' shots left the table');
ok(unsettled === 0, unsettled + ' balls were still moving after settling');

console.log('  pot rate by lateral offset (fraction of mouth half-width):');
var totalShots = 0, totalPot = 0;
OFFSETS.forEach(function (f) {
  var r = byOffset[f.toFixed(2)];
  totalShots += r.shots; totalPot += r.potted;
  var pct = Math.round(100 * r.potted / r.shots);
  console.log('    ' + f.toFixed(2) + '  ' + String(pct).padStart(3) + '%  ' +
              '#'.repeat(Math.round(pct / 4)));
});
console.log('  overall ' + Math.round(100 * totalPot / totalShots) + '% of ' +
            totalShots + ' shots');
// Dead-centre must be reliable, and well off-centre must not be.
ok(byOffset['0.00'].potted === byOffset['0.00'].shots, 'dead centre always drops');
ok(byOffset['1.15'].potted < byOffset['1.15'].shots * 0.5,
   'a ball entering past the nose is usually refused');

group('a ball aimed dead at a mouth always drops');
// Straight down the middle of each mouth: this must pot every time, at any speed.
var missed = 0;
G.POCKETS.forEach(function (p) {
  SPEEDS.forEach(function (sp) {
    var pl = loadPool();
    pl.rack();
    var st = pl.state();
    st.balls.length = 0;
    var sx = Math.min(W - R, Math.max(R, p.x - p.ox * 22));
    var sy = Math.min(H - R, Math.max(R, p.y - p.oy * 22));
    var b = pl.makeBall(1, sx, sy);
    var dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1;
    b.vx = sp * dx / d; b.vy = sp * dy / d;
    st.balls.push(b);
    pl.settle(120);
    if (pl.state().balls.length !== 0) missed++;
  });
});
ok(missed === 0, missed + ' dead-centre shots failed to drop');

group('the sink');
var pl = loadPool();
pl.rack();
var st = pl.state();
st.balls.length = 0;
// Straight up the middle into the near side pocket. Aiming off-centre just
// bounces off the cushion outside the mouth, which is the cushion working.
var b = pl.makeBall(7, W / 2, 20);
b.vx = 0; b.vy = -60;
st.balls.push(b);
var sawSinking = 0, sawShrink = false, t = 0;
while (t < 3) {
  pl.advance(1 / 240); t += 1 / 240;
  var s = pl.state();
  if (s.sinking.length) {
    sawSinking++;
    var q = s.sinking[0].sinkT / G.SINK_TIME;
    if (q > 0.2 && q < 0.9) sawShrink = true;
  }
  if (!s.busy) break;
}
ok(sawSinking > 10, 'the ball spent ' + sawSinking + ' ticks visibly dropping');
ok(sawShrink, 'the drop passes through its middle rather than jumping');
ok(pl.state().sinking.length === 0, 'the sink list drains');
ok(pl.state().potted.length === 1, 'and it counted as potted');

group('a scratch does not respot until the cue has finished dropping');
pl = loadPool();
pl.rack();
st = pl.state();
st.balls.length = 0;
var cue = pl.makeBall(0, W / 2, 20);
cue.vx = 0; cue.vy = -60;
st.balls.push(cue);
var doubled = 0;
t = 0;
while (t < 3) {
  pl.advance(1 / 240); t += 1 / 240;
  var s2 = pl.state();
  var cues = s2.balls.filter(function (x) { return x.n === 0; }).length +
             s2.sinking.filter(function (x) { return x.n === 0; }).length;
  if (cues > 1) doubled++;
  if (!s2.busy) break;
}
ok(doubled === 0, 'never two cue balls at once (' + doubled + ' ticks with two)');
// The respot itself lives in the frame loop's settle branch, which advance()
// alone never reaches; settle() is the same branch, so drain through it.
pl.settle(2);
var fin = pl.state();
ok(fin.balls.filter(function (x) { return x.n === 0; }).length === 1,
   'the cue is back on the table afterwards');

group('the end card');
/* Driven by potting the last ball with the rest already down, rather than by
   sinking fifteen in a row: what is under test is the trigger condition, and the
   potting path is covered above. */
function potOneWith(alreadyPotted, useCue) {
  var pl = loadPool();
  pl.rack();
  var st = pl.state();
  st.balls.length = 0;
  for (var i = 0; i < alreadyPotted; i++) st.potted.push(i + 1);
  var p = G.POCKETS[4];                       // near side pocket, straight in
  var b = pl.makeBall(useCue ? 0 : 7, p.x, p.y - p.oy * 20);
  b.vx = p.ox * 90; b.vy = p.oy * 90;
  st.balls.push(b);
  pl.settle(120);
  return pl.state();
}

var N = pool.RACK_COUNT;
ok(N === 15, 'a rack is ' + N + ' object balls');

var s1 = potOneWith(N - 1, false);
ok(s1.potted.length === N, 'potting the last one makes ' + N);
ok(s1.cleared === true, 'and the end card fires');

var s2 = potOneWith(N - 2, false);
ok(s2.potted.length === N - 1, 'one short leaves ' + (N - 1));
ok(s2.cleared === false, 'and the end card stays down');

// The cue ball is respotted, never counted — it can't be the fifteenth.
var s3 = potOneWith(N - 1, true);
ok(s3.potted.length === N - 1, 'a scratch does not add to the potted count');
ok(s3.cleared === false, 'so scratching on the last ball does not fire the card');
ok(s3.balls.filter(function (x) { return x.n === 0; }).length === 1, 'cue is respotted');

// Re-racking puts it away.
var pl2 = loadPool();
pl2.rack();
var st2 = pl2.state();
for (var k = 0; k < N; k++) st2.potted.push(k + 1);
pl2.settle(1);
ok(pl2.state().cleared === true, 'card is up with a full rack potted');
pl2.rack();
ok(pl2.state().cleared === false, 're-racking puts the card away');

T.report();
