/*
 * Intro photo sizing.
 *
 * The photo beside the intro has to be exactly as tall as the heading-plus-bio
 * column next to it. Its aspect ratio is fixed (the source is 3648x4706 — 5%
 * trimmed off the top and 9% off the bottom, nothing else cropped), so matching
 * the height fixes the width too.
 *
 * That can't be expressed in CSS, because the dependency is circular: a wider
 * photo leaves a narrower text column, which wraps to more lines, which is
 * taller, which asks for a wider photo. Flexbox resolves main-axis widths
 * before cross-axis heights, so aspect-ratio alone can't close the loop.
 * Iterating to a fixed point here can.
 */
(function () {
  'use strict';

  var intro = document.querySelector('.intro');
  if (!intro) return;
  var text = intro.querySelector('.intro-text');
  var photo = intro.querySelector('.intro-photo');
  if (!text || !photo) return;

  var RATIO = 3648 / 4706;     // width / height of the trimmed source
  var MIN = 120;
  var MAX = 340;

  // Below $on-palm the CSS stacks the layout; leave the width alone there.
  function stacked() {
    return window.getComputedStyle(intro).display !== 'flex';
  }

  function fit() {
    if (stacked()) {
      photo.style.width = '';
      return;
    }

    /* Usually settles in two or three passes. A width that straddles a line
       break can instead oscillate between two values, so remember what has been
       tried and, on repeat, take the smaller of the pair — that one is
       guaranteed to fit the row rather than overflow it. */
    var seen = {};
    var w = Math.round(photo.getBoundingClientRect().width) || 210;

    for (var i = 0; i < 12; i++) {
      photo.style.width = w + 'px';
      var next = Math.round(text.getBoundingClientRect().height * RATIO);
      next = Math.max(MIN, Math.min(MAX, next));

      if (next === w) return;                      // fixed point
      if (seen[next]) {                            // two-cycle
        photo.style.width = Math.min(next, w) + 'px';
        return;
      }
      seen[next] = 1;
      w = next;
    }
  }

  fit();

  // Computer Modern loads after first paint and changes the text height, so the
  // answer computed against the fallback serif is wrong until the swap lands.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit);
  }

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(fit, 120);
  });

  /* Catches reflows that don't come with a window resize. Guarded on the
     container's width: fit() changes the photo's width and therefore the row's
     height, so re-running on every height change would loop forever. */
  if ('ResizeObserver' in window) {
    var lastW = 0;
    new ResizeObserver(function (entries) {
      var w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      fit();
    }).observe(intro);
  }
})();
