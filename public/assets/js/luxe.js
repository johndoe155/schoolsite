/* ============================================================
   BIC — Interaction physics (luxe.js)

   The CSS in components.css gives every control its geometry, its
   surfaces and its state colours. This file adds the part CSS cannot do:
   motion that follows the pointer.

     · Magnetic pull   — a primary control leans toward the cursor while
                         it is inside a field of 1.618 × the control's own
                         longest side, and springs back on exit.
     · Press physics   — pointerdown compresses to .97, pointerup releases
                         through an overshoot, so the control feels sprung
                         rather than switched.

   Both are driven by GSAP (vendored at /assets/vendor/gsap.min.js). If
   GSAP is absent — blocked, stripped, or the page is opened from the file
   system — nothing here throws and the CSS fallback transitions in
   components.css take over (`html:not(.luxe-gsap)`).

   Deliberately NOT applied to: touch pointers, reduced-motion users, and
   any control inside a menu/dialog where a moving target would be a bug
   rather than a flourish. Overuse is the thing that makes this read as
   cheap, so the magnet is opt-in per control (`.btn--magnet` or
   `[data-magnet]`), never a global default.
   ============================================================ */
(function () {
  'use strict';

  var PHI = 1.618;          // the field radius, relative to the control's size
  var TRAVEL = 6;           // px — the most the control ever moves, at the rim
  var HOVER_LIFT = -2;      // px, the hover lift
  var PRESS_LIFT = 1;       // px, the press travel (CSS does the compression)

  var root = document.documentElement;
  var gsap = window.gsap;

  /* Exposed even when GSAP is missing: the verification harness reads
     `disabled` and the tunables to prove the guards, and page code can ask
     whether physics are live. */
  var api = {
    version: 1,
    gsap: !!gsap,
    disabled: true,
    reason: '',
    tunables: { PHI: PHI, TRAVEL: TRAVEL, HOVER_LIFT: HOVER_LIFT, PRESS_LIFT: PRESS_LIFT },
    controls: [],
    refresh: refresh
  };
  window.luxe = api;

  /* ── Why we might do nothing at all ─────────────────────────────────────── */
  if (!gsap) { api.reason = 'gsap-missing'; return; }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce && reduce.matches) { api.reason = 'reduced-motion'; return; }

  /* Coarse pointers (phones, tablets) have no hover, so a magnetic pull is
     unreachable by definition and a press transform fights the scroll. */
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');
  if (fine && !fine.matches) { api.reason = 'coarse-pointer'; return; }

  if (typeof window.requestAnimationFrame !== 'function') { api.reason = 'no-raf'; return; }

  api.disabled = false;
  root.classList.add('luxe-gsap');

  /* GSAP writes transforms as translate3d/scale on the element, so it owns
     the `transform` property outright from here on — which is exactly why
     the CSS fallback transforms are scoped to `html:not(.luxe-gsap)`. */
  function findControls(scope) {
    var sel = '.btn--magnet, [data-magnet], .btn-primary, .btn--primary';
    var nodes = (scope || document).querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // A moving target inside an overlay is a bug, not a flourish; and any
      // control can opt out entirely with data-luxe="off".
      if (el.closest('.bic-menu, #lightbox, .lb, [role="dialog"], [data-luxe="off"]')) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      out.push(el);
    }
    return out;
  }

  /* ── Magnetic pull ────────────────────────────────────────────────────────
     One tween per property, for the whole life of the control. GSAP owns
     `transform` on these elements, so nothing else may write it: the CSS
     fallback is scoped `html:not(.luxe-gsap)` for exactly that reason, and
     this function never uses `gsap.to(..., overwrite)` on a property a
     `quickTo` already owns — that combination kills the quickTo's tween
     (GSAP warns "not eligible for reset") and leaves the control stranded
     mid-pull, which is the bug this shape exists to prevent.

     quickTo retargets a single persistent tween, so:
       · following the pointer is continuous rather than restarting per event;
       · returning to rest is just another retarget, with a softer tune. */
  function magnetise(el) {
    if (el.__luxe) return;
    el.__luxe = true;

    function follower(props) {
      const fn = gsap.quickTo(el, props.prop, { duration: props.duration, ease: props.ease });
      let current = props.duration + '|' + props.ease;
      /* Retune only when the tune actually changes: invalidating on every
         pointermove would reset the tween's start values every frame. */
      fn.tuned = function (duration, ease) {
        const key = duration + '|' + ease;
        if (key === current) return fn;
        current = key;
        const tween = fn.tween;
        if (tween) {
          tween.vars.duration = duration;
          tween.vars.ease = ease;
          tween.invalidate();
        }
        return fn;
      };
      return fn;
    }

    const xTo = follower({ prop: 'x', duration: 0.45, ease: 'power3.out' });
    const yTo = follower({ prop: 'y', duration: 0.45, ease: 'power3.out' });
    let pressed = false;

    function onMove(e) {
      const r = el.getBoundingClientRect();
      /* The field is a circle of radius PHI × the control's longest side,
         centred on it. Two properties matter and both are enforced here:

           · the pull is ZERO at the centre (the control sits exactly where it
             was put) and grows to TRAVEL at the rim, so the movement reads as
             the control leaning toward the pointer rather than fleeing it;
           · the travel is BOUNDED by TRAVEL in px, not proportional to the
             distance to the cursor. Scaling by the raw offset — which is what
             the first version did — sends a 120px-wide control 35px across the
             page when the pointer is a few hundred pixels away, because the
             offset grows while the field does not. */
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const radius = Math.max(r.width, r.height) * PHI;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const influence = Math.min(1, dist / radius);   // 0 at the centre, 1 at the rim
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : 0;
      xTo.tuned(0.45, 'power3.out')(nx * influence * TRAVEL);
      yTo.tuned(0.32, 'power3.out')(HOVER_LIFT + ny * influence * TRAVEL);
    }

    function onEnter(e) {
      yTo.tuned(0.32, 'power3.out')(HOVER_LIFT);
      onMove(e);
    }


    function onLeave() {
      /* Home again, through an elastic settle — the control drifts back
         rather than snapping. Duration and ease are retuned first, so the
         return trip is the soft one and the follow stays crisp. */
      xTo.tuned(0.9, 'elastic.out(1, 0.55)')(0);
      yTo.tuned(0.9, 'elastic.out(1, 0.55)')(0);
      pressed = false;
    }

    /* The press. GSAP owns `transform` on a magnetised control, so the plate
       cannot also be scaled by a CSS `:active` rule — the inline transform
       wins and the CSS rule would be dead weight. What a press does here is
       travel: the plate sinks 1px under the pointer and springs back through
       an elastic release, while CSS collapses the cast shadow and compresses
       the *label* (`.btn:active > span`), which GSAP does not touch. The
       compression the brief asks for is there; it is just not applied to the
       one property the pointer tween already owns. */
    function onDown() {
      pressed = true;
      yTo.tuned(0.12, 'power2.out')(PRESS_LIFT);
    }

    function onUp() {
      pressed = false;
      yTo.tuned(0.5, 'elastic.out(1, 0.5)')(HOVER_LIFT);
    }

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.__luxeOff = function () {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    void pressed;
  }

  function refresh(scope) {
    if (api.disabled) return 0;
    var found = findControls(scope);
    for (var i = 0; i < found.length; i++) magnetise(found[i]);
    api.controls = found;
    return found.length;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { refresh(); });
  } else {
    refresh();
  }

  /* Several surfaces render their controls after load: the gallery grid, the
     news list, the library grid, the academies bundle. Rather than asking
     each of them to call in, watch for new nodes and pick the buttons up as
     they appear. Debounced — a list render is dozens of mutations and one
     re-scan is enough. */
  if (window.MutationObserver && document.body) {
    var pending = 0;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () {
        pending = 0;
        refresh();
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    api.observer = observer;
  }

  /* If the user changes their mind mid-session (or plugs in a mouse), follow
     the setting instead of holding the one we started with. */
  function onPrefChange() {
    var nowReduce = reduce && reduce.matches;
    var nowCoarse = fine && !fine.matches;
    if (nowReduce || nowCoarse) {
      api.disabled = true;
      api.reason = nowReduce ? 'reduced-motion' : 'coarse-pointer';
      root.classList.remove('luxe-gsap');
      for (var i = 0; i < api.controls.length; i++) {
        var el = api.controls[i];
        if (el.__luxeOff) { el.__luxeOff(); el.__luxe = false; }
        gsap.set(el, { clearProps: 'transform' });
      }
      api.controls = [];
    } else if (api.disabled && api.reason !== 'gsap-missing' && api.reason !== 'no-raf') {
      api.disabled = false;
      api.reason = '';
      root.classList.add('luxe-gsap');
      refresh();
    }
  }
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', onPrefChange);
  if (fine && fine.addEventListener) fine.addEventListener('change', onPrefChange);
})();
