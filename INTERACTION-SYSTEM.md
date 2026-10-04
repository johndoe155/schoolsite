# The Interactive Layer — how every button, field and clickable surface in this project works

Status: implemented, verified. Applies to the static site (`public/`) and the
portal (`portal/apps/web`).

---

## 1. What was asked, and what was found

The brief was to make every clickable element feel expensive: generous
on-grid padding, refined type, layered diffused shadows, translucent edges,
sophisticated palettes, restrained glass, spring physics, a magnetic pull on
primary actions, and elegant focus states — without breaking anything
unrelated, with 44×44 hit areas and WCAG AA contrast.

The audit that preceded the work found the site was further from that than it
looked:

| Found | Consequence |
| --- | --- |
| Three button systems: `.btn-primary/.btn-secondary/.btn-ghost` in `components.css`, a second set in `home.css` scoped to `#home`, and a third in `academies.html`'s inline styles | The same visual idea was implemented three times, with three sets of easing curves and three shadow scales |
| Buttons built from a colour, a radius and nothing else | No resting edge, no depth; `:hover` was the first time a control looked like a control |
| `transition: all 0.3s` inside `@media (min-width: 1024px) { *:not(#heroOverlay) { … } }` | An ID in the selector meant this out-ranked **every** per-element transition in the project, including the focus ring's — so the ring could not animate, and `fill`/`stroke`/`opacity` transitioned everywhere on desktop |
| Two shadow layers at up to 16% alpha | Elevation read as a grey smear on the parchment background |
| `.pg-btn`, `.chip`, `.btn-send`, `.form-submit`, `.lux-btn-send`, `.adm-btn`, `.thumbnail-btn` each with their own padding, radius and easing | Nothing lined up; two of them had no resting state at all |
| Fields: 4 different treatments, some with no height at all | Placeholders at 3.1:1 contrast (a WCAG AA failure), inconsistent tap heights |
| No animation library anywhere | The brief's "favour Framer Motion or GSAP" had no library to favour |

---

## 2. The system

### 2.1 Tokens — `public/assets/css/tokens.css` (vendored into the portal)

**Geometry, on a strict 4pt grid.**

```
--ctl-h-sm: 44px   --ctl-px-sm: 20px     the touch floor, and the smallest plate
--ctl-h-md: 48px   --ctl-px-md: 26px     the default
--ctl-h-lg: 56px   --ctl-px-lg: 34px     hero CTAs and form submits
```

Vertical padding is **not** used: a control is a flex box with `min-height`,
so the label is centred by the box rather than by line-height arithmetic. That
is what keeps the optical centre equal to the geometric centre at every font
size and family. Inline padding is the only free dimension — which is also
what keeps the plate ratio identical across variants.

The brief suggested the golden ratio or a 4pt grid. The grid wins where they
disagree: the inline:block padding ratio is ≈1.7, the closest the 4pt grid
allows to φ (1.618), and a 4px rhythm is worth more than an 0.08 rounding
error. **φ is used exactly where nothing needs to snap**: the radius of the
magnetic field is `1.618 × the control's longest side` (§2.3).

**Elevation — four levels, three layers each.** Every level stacks a 1–4px
contact shadow (describes the edge), a mid ambient spread, and a wide
low-alpha bloom. All layers stay at or under 12% alpha:

```
--shadow-1: 0 1px 2px …, 0 2px 6px …, 0 8px 20px …      (24,20,15 at 4/4/3%)
--shadow-lift: 0 2px 4px …, 0 12px 28px …, 0 32px 64px … (hover, out-ranks --shadow-4)
--shadow-press: 0 1px 2px …, inset 0 2px 5px …           (pressed: cast shadow collapses)
```

**Tactile edges.** A hairline of light along the top and a hairline of shade
around the shape, both just visible: `--edge-light`, `--edge-dark`,
`--edge-gold`, `--edge-brand`, `--edge-cream`, `--edge-inset`. They are
composited *in front of* the elevation, so the highlight looks like part of
the material rather than part of the light.

**Motion.** `--dur-hover: 320ms` (the brief's ≥300ms floor), `--dur-press:
130ms`, `--dur-release: 460ms`; `--ease-out-lux: cubic-bezier(.16,1,.3,1)`
and `--ease-spring: cubic-bezier(.34,1.46,.64,1)`. Press is faster than
release deliberately — that asymmetry is what reads as "sprung" rather than
"switched".

**Focus.** `--ring-w: 2px`, `--ring-offset: 3px`, `--ring-color:
var(--color-accent-bright)`, `--ring-glow: 0 0 12px 2px rgba(176,125,63,.38)`.

### 2.2 The control layer — `components.css`

One `.btn` base plate, then variants that only re-point custom properties:

```css
.btn                 /* geometry, type, motion, elevation, ring */
.btn--primary        /* indigo  */
.btn--secondary      /* gold    */
.btn--ghost          /* hairline plate, transparent until hover */
.btn--outline        /* hairline plate, white until hover */
.btn--danger         /* semantic red */
.btn--quiet          /* text-only action, same hit box and ring */
.btn--sm / --lg / --block / --icon / --compact
```

The customisation API — a variant sets these, everything else follows:

| Property | Meaning |
| --- | --- |
| `--ctl-h`, `--ctl-px` | plate geometry |
| `--ctl-bg`, `--ctl-bg-hover` | surfaces |
| `--ctl-fg`, `--ctl-fg-hover` | label |
| `--ctl-bd`, `--ctl-bd-hover` | border |
| `--ctl-edge`, `--ctl-shadow`, `--ctl-shadow-hover` | the two-part shadow |

`.btn-primary`, `.btn-secondary` and `.btn-ghost` still work — they are now
spellings of the variants above (`--ctl-bg: var(--color-brand)`), not a second
implementation, so all ~150 existing call sites improve without being touched.

**Pressed state.** The cast shadow collapses into an inner one and the plate
travels 1px with a scale of `.97`. The earlier pass had learned that a
`scale()` on the hero glass button makes browsers drop `backdrop-filter`
mid-press, so the glass variant re-asserts its blur on `:active` — the effect
never appears to vanish.

### 2.3 Pointer physics — `public/assets/js/luxe.js` + vendored GSAP

GSAP 3.13 is vendored at `public/assets/vendor/gsap.min.js` (72 KB, nonce-safe,
self-hosted so the CSP stays `script-src 'self'`; licence at
`public/assets/vendor/GSAP-LICENSE.md`). It is loaded `defer` on every page,
followed by `luxe.js`.

* **Magnet.** The field is a circle of radius `1.618 × the control's longest
  side`, centred on it. The pull is **zero at the centre** — the plate is
  exactly where it was put — and grows to `TRAVEL = 6px` at the rim, capped
  there. The travel is a distance in pixels, *not* the cursor offset scaled up:
  scaling by the offset sent a 120px plate 35px across the page when the
  pointer was far away, because the offset grows while the field does not.
  `gsap.quickTo` keeps **one tween per axis for the whole session** and
  retargets it, so the follow is continuous rather than restarting per event,
  and the two axes can never fight over the same transform.
* **Press.** GSAP owns `transform` on a magnetised plate, so the plate cannot
  also be scaled by a CSS `:active` rule — an inline transform out-ranks a
  stylesheet one. What the press does is travel: `pointerdown` sinks the plate
  1px in 120ms and `pointerup` springs back through `elastic.out(1, 0.5)` from
  the resting lift. The compression the brief asks for is applied to the
  **label** instead — `.btn:active > span { transform: scale(var(--sc-press)) }`,
  one step behind the plate — and to the whole plate on every control GSAP
  never touches. The measured behaviour is asserted, not assumed: see §4.
* **It is opt-in and curated.** The selector is `.btn--magnet`, `[data-magnet]`
  and `.btn-primary`, minus anything inside `.bic-menu`, `#lightbox`, `.lb`,
  `[role="dialog"]` or `[data-luxe="off"]`. Between one and five controls per
  page carry it — usually the primary action and the header CTA. A page where
  everything moves is a page where nothing feels considered.
* **It never runs where it would be a bug.** Reduced-motion and coarse
  pointers (touch) opt out at load and follow a mid-session change of either
  setting; late-rendered controls (gallery, news, library, the academies
  bundle) are picked up by a debounced `MutationObserver`.
* **It degrades.** With GSAP missing or blocked, `luxe.js` sets
  `window.luxe.disabled` and returns before touching anything. The CSS
  fallback transitions — scoped `html:not(.luxe-gsap)` so they never fight the
  library — still give hover lift and press compression.

### 2.4 Focus — a pointer draws nothing, the keyboard gets a hairline

```css
/* 1. a click paints nothing */
:where(a, button, summary, [tabindex], [role="button"], input, select, textarea):focus {
  outline: none;
}
:-moz-focusring { outline: none; }          /* Firefox paints its own on click */

/* 2. the keyboard gets one 1px hairline, held 2px clear of the plate */
:where(a, button, summary, [tabindex], [role="button"], input, select, textarea):focus-visible {
  outline: var(--ring-w) solid var(--ring-color);   /* 1px */
  outline-offset: var(--ring-offset);               /* 2px */
  transition: outline-color 180ms var(--ease-out-lux),
              outline-offset 180ms var(--ease-out-lux);
}
```

This replaced a **2px ring with a 12px blurred halo at 38% alpha**, which is
what a "thick, low-opacity ring" is: the browser default wearing our colours.
What changed, and why:

* **Nothing on a click.** `:focus` is something the mouse puts elements into
  constantly — after clicking a button, a gallery card or a chip, it is not
  news to anyone, and it was the thing cheapening every interaction. Only
  `:focus-visible` (keyboard, and the browser's own judgement for text entry)
  draws anything.
* **A hairline, not a ring.** `--ring-w: 1px`, `--ring-offset: 2px`, in the
  same gold as the plates' own hairlines. A 1px line needs more contrast than
  a 2px one: `--color-accent-bright` is **4.6:1** on parchment and **5.6:1**
  on ebony, so it qualifies as a non-text contrast pair.
* **No glow at all.** The blurred halo was the "cheap" part; it is deleted
  everywhere, including the three page sheets that had restated it.
* **`:where()` keeps specificity at zero**, so no page rule is overridden and
  any page that genuinely needs its own focus treatment still wins.
* **The tap flash is off** at the root (`-webkit-tap-highlight-color`), because
  a translucent rectangle painted over a plate on touch is not a focus state,
  it is a rendering artefact.
* Fields are the exception that proves the rule, and they do not draw a ring
  at all — see §2.5.

**Why the first pass did not fix what was being reported.** The rules above
were already in place, and the ring was still there — because a *zero*
specificity reset loses to everything, and `home.css` carried two legacy rules
that no one had looked at:

```css
:focus     { outline: 3px solid rgba(99,102,241,0.12); }   /* fires on click */
a:focus    { outline: 3px solid rgba(252,211,77,0.18); }   /* fires on click */
```

A bare `:focus` has no keyboard condition, so those two painted a 3px
low-opacity outline on **every click** — on links, on gallery cards, on the
programme chips and on the enquiry fields — and at 0,1,0 and 0,1,1 they
out-ranked the reset. Deleted. The same sweep found seven more halos hiding
behind `:focus` / `:focus-within` in `contact.css`, `programs.css`,
`library.css`, `admin.css` and `news.css`; every one of them is either gone or
converted to the inner-hairline treatment, and §12 of the harness now fails the
build if a click-firing selector anywhere in any sheet draws a halo at all.

Two group-level rings needed a different tool, because `:focus-within` cannot
tell a click from the Tab key: `.lux-field-group` (contact) and `.search-row`
(news) now use `:has(:focus-visible)`, so the *animated line and the label
colour* remain the click affordance while the ring is reserved for the
keyboard. Where `:has()` is unsupported the ring is simply absent and the line
and label still carry focus — the colour change is driven by `:focus-within`,
which every engine in support has.

### 2.5 Text boxes

A zero-specificity baseline for any field a page has not styled:
`min-height: 48px`, a hairline border, `--edge-inset` (a resting inset, so the
field reads as recessed), a hover that warms the border, and a focus that
**lights from within**:

```css
:where(input, textarea, select):focus {
  border-color: var(--color-accent);
  background: var(--color-white);
  box-shadow: inset 0 0 0 1px var(--color-accent), inset 0 1px 2px rgba(24,20,15,.05);
  outline: none;
}
:where(input, textarea, select):focus-visible { outline: none; }
```

A field is a typing context, so `:focus-visible` matches it on a plain click —
which is exactly why clicking into a text box used to produce the ring this
page is about. The second 1px gold hairline sits *on* the plate rather than
around it, so the affordance survives a background made of glass or a
photograph, and the surface never animates under a cursor that is trying to
type. Pages that own their identity keep it: `contact.html` still uses an
animated underline (`.lux-field-line`) and moves its state to the field group —
one visible affordance, not two competing ones.

**Placeholders are text.** At `--color-ink-40` they measured **3.1:1** on the
paper background, an AA failure and, worse, on the first thing anyone reads in
an empty form. `--color-placeholder` is `rgba(24,20,15,.70)` — **6.4:1** — and
still reads as a hint because filled-in text is 100% ink. Dark surfaces use
`--color-placeholder-dark` (6.6:1 on the admin panel).

### 2.6 The hero CTA — depth without box-shadow

The pair on the landing hero is the only control on the site standing on a
photograph, so it gets a material of its own (`.btn-hero--gold` /
`.btn-hero--glass` in `components.css`), built the way metal is:

| Layer | Champagne | Glass |
| --- | --- | --- |
| body | 3-stop tonal gradient `#EFD79B → #E3BE67 → #CFA447` | 3-step white `10% → 4% → 1.5%` over `blur(14px) saturate(1.15)` |
| rim | `1px rgba(122,86,28,.30)` — the metal's own shade, not a grey border | `1px rgba(255,255,255,.22)` |
| inner hairline | `inset 0 0 0 2px rgba(255,255,255,.10)` — the 1px translucent inner border | `inset 0 0 0 1px rgba(255,255,255,.10)` |
| specular glint | `inset 0 1px 0 rgba(255,255,255,.55)` along the top edge | `inset 0 1px 0 rgba(255,255,255,.42)` |
| cast shadow | one 2px contact line at 10% | none — only a 1px outer rim |

The stacking is the point: because an inset spread paints *inside* the rim and
the earlier shadow layers paint on top, the champagne plate reads as
`warm rim → 1px translucent white → glint`, which is a machined bevel rather
than a coloured rectangle. **There is no bloom anywhere** — no layer with a
blur wider than 16px — and that is enforced, not just intended (§11.7).

* **Hover** is not a colour swap: the tonal gradient's top stop lifts, the
  rim warms, and the glint brightens — the *light* on the plate changes.
* **The sheen** is a `::after` pseudo-element, a skewed 32%-wide band at 40%
  white, that crosses the plate once over `--dur-sheen` (1100ms) on hover, at
  `--ease-out-lux`. On press it does not retract (`opacity: .65`), because a
  press that makes the effect disappear reads as a bug.
* **Motion weight**: hover at `--dur-hover` (320ms), press at `--dur-press`
  (130ms). Slow in, fast down, elastic back out — weighty but responsive.
* **The press keeps the glass**: `backdrop-filter` is re-asserted on
  `:active`, because a transformed element can lose its backdrop sample and
  the effect would vanish exactly when someone is looking at it.
* **Champagne, not yellow.** `#FACC15` is a 96%-saturation highlighter yellow;
  the hero is now `#E3BE67` with `#EFD79B` catching the top, and the ink label
  measures **8.2:1** on the darkest stop and **13.4:1** on the lightest, so the
  whole gradient clears AAA. The flat yellow is kept as
  `--color-brand-yellow` for the badges, timeline and admin chrome that were
  designed around it; the hero no longer references it.

### 2.7 The 44px hit floor

Controls whose *visual* size is legitimately smaller than the touch floor —
filter chips, pagination, admin row actions, thumbnail pickers, compact
buttons — get an invisible centred overlay that restores a 44×44 target
without changing the layout:

```css
.chip::after, .pg-btn::after, .adm-btn::after, .thumbnail-btn::after,
.btn--compact::after, .bic-nav__links a::after, .bic-adm-trigger::after,
.adm-logout-btn::after, .adm-staff-trigger::after {
  content: ""; position: absolute; left: 50%; top: 50%;
  width: 100%; height: 100%;
  min-width: var(--tap-min); min-height: var(--tap-min);   /* 44px, named once */
  transform: translate(-50%, -50%);
}
```

The number itself is a token (`--tap-min: 44px`), so a plate that borrows it
cannot drift below the floor on its own.

Everything else is genuinely 44px or taller: `.btn` (44/48/56 by size),
`.bic-nav__cta` (44), `.lux-btn-reset` (44), `.social-link` and
`.lux-social-link` (44, up from 38 and 42), `.pg-btn` and `.btn-close` (44),
`.thumbnail-btn` (44), `.lb__btn` (44).

### 2.8 What a page sheet may not do

A page sheet may still style its own controls — a footer link should read as a
link — but four things now belong to the system alone, and
`verify:interactions` §10 fails on any of them:

| Not allowed in a page sheet | Why |
| --- | --- |
| `transition: all` | it animates properties nobody asked it to, layout included |
| a hardcoded focus ring (`outline: 2px solid …`) | the ring is one definition, in `components.css` |
| a focus glow (`filter: drop-shadow(…)`, `--ring-glow`) | the halo is retired everywhere; the hairline is the whole affordance |
| a halo on a click-firing selector (`:focus`, `:focus-within`) | it appears on every mouse click — the defect this pass exists to remove |
| a `#home .btn-*` restatement of the hero pair | at that specificity it out-ranks `.btn-hero` and restores the old plates |
| a single-layer shadow above 20% alpha | it reads as a drawn edge, not diffused light |
| a sub-44px target with no overlay | the visual size may be small; the target may not |

The sweep that closed this phase removed **9** blanket transitions and their
harsh shadows, **8** page-local focus rings, **11** heavy single-layer
elevations, two legacy glows that survived the first pass (a teal `#10b981`
success halo and the yellow timeline halos), and it moved the staff panel's
plates — staff login, log out, row actions, the drop zone, the newsletter
actions — onto the same tokens as everything else.

Stylesheets are requested with `?v=4` (`luxe.js`, unchanged in this pass, stays
at `?v=3`): they are served `max-age=86400`, so a versioned URL is the only
thing that makes a deployment visible on the first reload.

### 2.9 Contrast

The gold plate's label was **white on `#B07D3F` = 3.6:1** — an AA failure for
a 14px label, and present in both the site and the portal. The label is now
ink (**5.1:1**), and hover goes *brighter* rather than darker (**6.9:1**),
which also reads better: light catching metal. Every other pair was already
compliant and was left alone.

---

## 3. The portal

Same system, two levers.

**One CSS layer covers all ~150 call sites.** `portal/apps/web/app/globals.css`
already had a `body.portal-root .btn` used by 56 files; it now carries the
layered elevation, the translucent edges, the 44px floor, the press physics
(`translateY(1px) scale(.97)`), the offset ring with its glow, reduced-motion
and forced-colours blocks — plus `.secondary`, `.outline`, `.quiet`, `.sm`,
`.lg`, `.block` so the component has something to resolve to.

**`components/button.tsx` is the canonical component** for new and migrated
code. It renders the same `btn` class (so the component and the existing
markup cannot drift apart) and adds what CSS cannot:

```tsx
<Button>Save</Button>
<Button variant="ghost" href="/x">Back</Button>
<Button variant="danger" busy>Deleting…</Button>
<Button variant="primary" magnet>Sign in</Button>
```

`whileHover={{ y: -1, scale: 1.02 }}`, `whileTap={{ scale: 0.97 }}`, a slow
heavily-damped magnet spring, `useMotionValue`/`useSpring` so the pointer never
re-renders React, `useReducedMotion()` to drop all of it, and `aria-busy`
announced rather than only styled. Two surfaces were migrated as the reference
implementation: `app/login/login-form.tsx` (magnet on the primary, ghost SSO
buttons) and `app/account/password/change-password-form.tsx`.

**Cost, stated plainly.** `framer-motion@14` adds a **123 KB** client chunk
(≈39 KB over the wire, compressed) to the routes that use `<Button>`. It is
code-split to those routes, and the checks below fail if it ever leaks into a
route that does not render a `<Button>`. If that cost is unwanted, the CSS
layer alone delivers every visual and interaction state — the component is an
enhancement, and deleting it degrades rather than breaks.

---

## 4. Verification

| Gate | Command | Result |
| --- | --- | --- |
| Site interactive layer | `npm run verify:interactions` | **142/142** |
| Site cascade (existing) | `npm run verify:polish` | 7 pages / 0 failures |
| Gallery viewer (existing) | `npm run verify:lightbox` | 55/55 |
| Design tokens in sync | `npm run tokens:check` | in sync |
| Portal controls | `npm run check:controls -w @portal/web` | **26/26** |
| Portal contrast (existing) | `npm run check:contrast -w @portal/web` | all pairs pass AA |
| Portal types | `tsc --noEmit` | clean |
| Portal build | `next build` | 33 pages, compiled |

`verify:interactions` is new and asserts, in jsdom against the real
stylesheets: the geometry is on the grid and every height is a multiple of 4;
the hero material is built from tones and hairlines with **no bloom**, and both
plates are ink-on-champagne at AAA across the gradient (§11);
every elevation is a 3-layer stack under 12% alpha; the edges are 1px
translucent; hover is ≥300ms ease-out and press is faster than release; the
fallback is scoped away once GSAP is live; the ring is offset, animated,
zero-specificity and survives forced colours; **every control on five real
pages reaches 44px, measured or bounded**; **16 contrast pairs pass AA in their
own context**; and `luxe.js` honours the magnet's guards, the opt-out, and
degrades silently without GSAP.

The physics are **measured, not matched** (assertions 8.14–8.21). The first
version of the magnet passed every source-level check and still left the plate
stranded 13px from home after `pointerleave`, so the harness now boots the real
script over the vendored GSAP, stops the ticker, drives the timeline with
`gsap.updateRoot(t)` and asserts the numbers:

| Event | Asserted |
| --- | --- |
| pointer at the centre | sideways pull `0`, lift `−2px` |
| pointer at the field rim | pull `> 0` and `≤ TRAVEL` |
| pointer an absurd distance away | total travel still `≤ TRAVEL` |
| `pointerleave` | back to `0, 0` |
| `pointerdown` | the plate sinks |
| `pointerup` | settles at the resting lift |
| any press | `scale` never appears in the inline transform — CSS owns it |

The two existing harnesses had to grow to keep up: `verify-polish` now
resolves custom properties **per element** (jsdom cascades them correctly but
cannot evaluate `var()`, and it takes a fallback over an unresolvable
property), and it normalises colours and evaluates leftover `calc()`.

---

## 5. Deliberate limits

* **No browser exists in this environment.** Every claim above is structural —
  computed styles, source invariants, behaviour in jsdom. The *look* of the
  new plates, shadows and springs has not been seen.
* **`:has()` carries two rings on its own.** The contact field group and the
  admin search row rely on `:has(:focus-visible)` to keep their ring
  keyboard-only. That is Baseline since December 2023; on an engine without it
  the ring does not draw and the line/label/border change is the focus cue —
  degraded, not broken.
* **`-webkit-tap-highlight-color` cannot be verified here.** jsdom drops the
  property entirely, so the harness asserts the declaration is present and
  inherited from the root rather than measuring it. It is a standard,
  universally supported declaration; the mobile browsers that paint the flash
  all honour it, but that is a claim from documentation, not from a test.
* **Two systems, not one.** `academies.html` is a self-contained page with its
  own inline styles and does not load `components.css`; it keeps its own
  palette (it still gains the pointer physics, since those do not depend on the
  stylesheet). Unifying it would mean rewriting a bundled page.
* **The portal keeps its own `.btn`** rather than importing the site's sheet.
  The two documents never share a page, and the portal has a stricter CSP and
  a `portal-root` scope; the *values* are shared through the token file, which
  `npm run tokens:check` keeps in sync.
* **`.adm-btn` stays visually small** (32px) with a 44px hit overlay. Making
  the plates genuinely 44px would cost the staff tables their density — this is
  a judgement call, not an oversight.
* **GSAP is not open-source in the MIT sense** — it ships under the "standard
  no-charge licence", which is free for a website like this but is worth a look
  if the project is ever resold as a template or competing tool.
