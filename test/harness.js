/*
 * Test harness for assets/js/pool.js.
 *
 * pool.js is a browser IIFE with no module boundary, so testing it means giving
 * it a DOM to attach to. This stubs a minimal one plus a recording 2d context,
 * then evaluates the real shipped file and hands back the debug surface it
 * exposes on window.__pool.
 *
 * The recorder keeps enough of canvas' semantics — clip stack, fill rules, and
 * point-in-path for the shapes pool.js actually draws — to answer "what colour
 * ended up at this pixel?". That is what lets the ball texture mapping be
 * checked against ground truth instead of eyeballed.
 *
 * Not a test file itself. See roll.test.js and pockets.test.js.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, '..', 'assets', 'js', 'pool.js');

// ---------------------------------------------------------------- assertions

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL  ' + msg); }
}
function near(a, b, tol, msg) {
  ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' +-' + tol + ')');
}
function group(name) { console.log('\n' + name); }

// ---------------------------------------------------------------- geometry

// Point-in-path for the shapes pool.js draws. Each subpath becomes a predicate.

function circleAt(cx, cy, r) {
  return function (x, y) {
    var dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
}

// arc(cx,cy,r,a0,a1) followed by closePath: the circular segment cut off by the
// chord between the arc's endpoints, on the arc's side.
function segmentAt(cx, cy, r, a0, a1) {
  var mid = (a0 + a1) / 2;
  var mx = Math.cos(mid), my = Math.sin(mid);          // outward, toward the arc
  var half = (a1 - a0) / 2;
  var d = r * Math.cos(half);                          // centre to the chord
  return function (x, y) {
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r) return false;
    return dx * mx + dy * my >= d;
  };
}

function ellipseAt(cx, cy, rx, ry, rot) {
  var c = Math.cos(rot), s = Math.sin(rot);
  return function (x, y) {
    var dx = x - cx, dy = y - cy;
    var a = (dx * c + dy * s) / (rx || 1e-12);
    var b = (-dx * s + dy * c) / (ry || 1e-12);
    if (rx === 0 || ry === 0) return false;
    return a * a + b * b <= 1;
  };
}

function rectAt(x0, y0, w, h) {
  return function (x, y) {
    return x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  };
}

// ---------------------------------------------------------------- recorder

function Path() { this.subpaths = []; }
Path.prototype.arc = function (cx, cy, r, a0, a1) {
  var full = Math.abs((a1 - a0) - 2 * Math.PI) < 1e-9;
  this.subpaths.push(full ? circleAt(cx, cy, r) : segmentAt(cx, cy, r, a0, a1));
};
Path.prototype.ellipse = function (cx, cy, rx, ry, rot) {
  if (rx < 0 || ry < 0) throw new Error('negative ellipse radius: ' + rx + ',' + ry);
  this.subpaths.push(ellipseAt(cx, cy, rx, ry, rot));
};
Path.prototype.rect = function (x, y, w, h) { this.subpaths.push(rectAt(x, y, w, h)); };
Path.prototype.moveTo = function () {};
Path.prototype.lineTo = function () {};
Path.prototype.closePath = function () {};
Path.prototype.addPath = function (p) {
  this.subpaths = this.subpaths.concat(p.subpaths);
};
Path.prototype.test = function (rule, x, y) {
  var n = 0;
  for (var i = 0; i < this.subpaths.length; i++) if (this.subpaths[i](x, y)) n++;
  return rule === 'evenodd' ? (n % 2) === 1 : n > 0;
};

function Ctx() {
  this.fillStyle = '#000';
  this.font = '';
  this.textAlign = '';
  this.textBaseline = '';
  this.lineWidth = 1;
  this.strokeStyle = '#000';
  this.path = new Path();
  this.clips = [];            // stack of predicates, intersected
  this.stack = [];
  this.fills = [];            // ordered [{ style, region }]
}
Ctx.prototype._clipNow = function () {
  var clips = this.clips.slice();
  return function (x, y) {
    for (var i = 0; i < clips.length; i++) if (!clips[i](x, y)) return false;
    return true;
  };
};
Ctx.prototype.save = function () {
  this.stack.push({ clips: this.clips.slice(), fillStyle: this.fillStyle });
};
Ctx.prototype.restore = function () {
  var s = this.stack.pop();
  if (s) { this.clips = s.clips; this.fillStyle = s.fillStyle; }
};
Ctx.prototype.beginPath = function () { this.path = new Path(); };
Ctx.prototype.closePath = function () {};
Ctx.prototype.moveTo = function () {};
Ctx.prototype.lineTo = function () {};
Ctx.prototype.arc = function (cx, cy, r, a0, a1) { this.path.arc(cx, cy, r, a0, a1); };
Ctx.prototype.arcTo = function () {};
Ctx.prototype.ellipse = function (cx, cy, rx, ry, rot, a0, a1) {
  this.path.ellipse(cx, cy, rx, ry, rot, a0, a1);
};
Ctx.prototype.rect = function (x, y, w, h) { this.path.rect(x, y, w, h); };
Ctx.prototype.clip = function (arg, rule) {
  var p = arg instanceof Path ? arg : this.path;
  var r = arg instanceof Path ? rule : arg;
  var self = p;
  var fr = r || 'nonzero';
  this.clips.push(function (x, y) { return self.test(fr, x, y); });
};
Ctx.prototype.fill = function (arg, rule) {
  var p = arg instanceof Path ? arg : this.path;
  var r = arg instanceof Path ? rule : arg;
  var fr = r || 'nonzero';
  var clip = this._clipNow();
  this.fills.push({
    style: this.fillStyle,
    region: function (x, y) { return clip(x, y) && p.test(fr, x, y); }
  });
};
Ctx.prototype.fillRect = function (x, y, w, h) {
  var p = new Path();
  p.rect(x, y, w, h);
  var clip = this._clipNow();
  this.fills.push({
    style: this.fillStyle,
    region: function (px, py) { return clip(px, py) && p.test('nonzero', px, py); }
  });
};
Ctx.prototype.stroke = function () {};
Ctx.prototype.fillText = function () {};
Ctx.prototype.setLineDash = function () {};
Ctx.prototype.setTransform = function () {};
Ctx.prototype.translate = function () {};
Ctx.prototype.rotate = function () {};
Ctx.prototype.scale = function () {};
Ctx.prototype.transform = function () {};
Ctx.prototype.clearRect = function () {};
Ctx.prototype.createLinearGradient = function () { return grad(); };
Ctx.prototype.createRadialGradient = function () { return grad(); };
function grad() {
  var g = { __gradient: true, addColorStop: function () {} };
  return g;
}
// Topmost solid fill covering (x, y). Gradients (shading, vignette) are skipped:
// they are lighting, not texture.
Ctx.prototype.colorAt = function (x, y) {
  for (var i = this.fills.length - 1; i >= 0; i--) {
    var f = this.fills[i];
    if (f.style && f.style.__gradient) continue;
    if (typeof f.style === 'string' && f.style.indexOf('rgba') === 0) continue;
    if (f.region(x, y)) return f.style;
  }
  return null;
};

// ---------------------------------------------------------------- DOM stub

var ctx = new Ctx();

function elem(extra) {
  var e = {
    style: { setProperty: function () {} },
    classList: {
      set: {},
      add: function () { for (var i = 0; i < arguments.length; i++) this.set[arguments[i]] = 1; },
      remove: function () { for (var i = 0; i < arguments.length; i++) delete this.set[arguments[i]]; },
      contains: function (c) { return !!this.set[c]; }
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    removeAttribute: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 1100, height: 600 }; },
    querySelector: function () { return null; },
    clientWidth: 1100,
    clientHeight: 600
  };
  for (var k in extra) e[k] = extra[k];
  return e;
}

var canvas = elem({
  getContext: function () { return ctx; },
  width: 0, height: 0,
  style: { setProperty: function () {} },
  setPointerCapture: function () {}
});
var stage = elem({ clientWidth: 1100, clientHeight: 600 });
var curtainEl = elem({});
var statusEl = elem({ textContent: '' });

var root = elem({
  querySelector: function (sel) {
    if (sel === '.pool-canvas') return canvas;
    if (sel === '.pool-stage') return stage;
    if (sel === '.pool-status') return statusEl;
    if (sel === '.pool-rerack') return elem({});
    if (sel === '.pool-back') return elem({});
    if (sel === '.pool-curtain') return curtainEl;
    if (sel === '.pool-again') return elem({});
    return null;
  }
});
var hint = elem({});

global.window = {
  matchMedia: function () { return { matches: false }; },
  addEventListener: function () {},
  requestAnimationFrame: function () { return 0; },
  cancelAnimationFrame: function () {},
  devicePixelRatio: 2,
  innerHeight: 800,
  scrollY: 0,
  scrollTo: function () {},
  getComputedStyle: function () { return { display: 'flex' }; }
};
global.document = {
  getElementById: function (id) {
    if (id === 'pool') return root;
    if (id === 'pool-hint') return hint;
    return null;
  },
  addEventListener: function () {},
  documentElement: { scrollHeight: 2000 }
};
global.IntersectionObserver = function () { return { observe: function () {} }; };
global.Path2D = Path;
global.performance = { now: function () { return 0; } };
global.requestAnimationFrame = window.requestAnimationFrame;

// ---------------------------------------------------------------- load

/* Evaluate the real pool.js against the stub and return its debug surface, plus
   the recording context it drew into. A fresh context per call: the pocket suite
   loads the file hundreds of times and must not inherit another run's fills.
   `canvas.getContext` closes over the variable rather than the value, so
   reassigning it here is enough for the new one to be picked up. */
function loadPool() {
  ctx = new Ctx();
  new Function(fs.readFileSync(SRC, 'utf8')).call(global);
  var pool = global.window.__pool;
  if (!pool) throw new Error('pool.js did not expose window.__pool');
  return { pool: pool, ctx: ctx };
}

function report() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

module.exports = {
  Path: Path,
  Ctx: Ctx,
  loadPool: loadPool,
  ok: ok,
  near: near,
  group: group,
  report: report,
  failures: function () { return fail; }
};
