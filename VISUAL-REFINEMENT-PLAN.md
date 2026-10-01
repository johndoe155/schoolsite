# Visual Refinement Plan — BIC Unified Site
**Read-only audit · no code altered · awaiting approval**

> ## Amendment 1 — Phase 6 typeface reinstatement (supersedes the font table below)
> The Inter / Cormorant Garamond / Fraunces stack was retired as too
> template-generic. The site now runs on **4 families with strict roles**:
>
> | Role | Family | Notes |
> |---|---|---|
> | `--font-ui` (chrome) | **Montserrat** 300–800 + italics | nav, menus, buttons, kickers, labels, wordmarks, forms UI |
> | `--font-body` (prose) | **Quicksand** 300–700 | body copy, article text, inputs, long-form |
> | `--font-display` (editorial) | **Libre Baskerville** 400/700 + italic | all headings, quotes, serif moments — never synthesize 500/600 |
> | `--font-statement` (hero) | **Abril Fatface** 400 only | hero headline + footer tagline — weight pinned to 400 |
>
> Small-caps kickers/wordmark labels (`--font-sc`, `--bic-font-sc`) now resolve
> to Montserrat. `academies.html` was re-skinned onto the same system in
> Phase 6b (see CHANGES.md) — its IBM Plex Mono ledger layer was folded into
> Montserrat, and its hero now sets Abril Fatface.
> Canonical link: `family=Abril+Fatface&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,300..800;1,300..800&family=Quicksand:wght@300..700&display=swap`

---

## Audit snapshot (measured, not vibes)

| Dimension | Current state |
|---|---|
| Font families loaded | **14** (Abril Fatface, Cormorant Garamond/SC/Infant, DM Sans, Fraunces, IBM Plex Mono, Inter, Josefin Sans, Libre Baskerville, Montserrat, Playfair Display, Poppins, Quicksand, Raleway) |
| Unique hex colors | **114** + 42 unique `rgba()` bases |
| Unique `border-radius` values | **31** (2px → 999px, four different radius token systems) |
| Unique `box-shadow` values | **51** |
| Button variants defined | **10+** (`.btn-primary` ×2, `.btn`, `.btn-ghost`, `.btn-gold`, `.btn-submit`, `.btn-designed`, `.btn-outline-dark`, `.btn-close`…) |
| Container max-widths | 1100 / 1120 / 1180 / 1400px + three different CSS vars |
| Section padding | ad-hoc (`28px 32px 48px`, `13px`, `clamp(48px,8vw,88px) 0 40px`…) |
| Grid gaps | mostly 6–14px, off the 8px grid |
| Nav bar height | 80px on home, 68px on all other pages |
| Footer CSS | same ~3.7 KB block copy-pasted into contact/news/library (news has drifted), programs has a *different* 20-rule footer system, home has a third |
| Inline `style=` attributes | 90 site-wide (48 in `index.html` alone), incl. inline `font-family` overrides for 5 different families |

---

## 1. Font System Blueprint

### Proposal: strict 2-font system

| Role | Family | Why |
|---|---|---|
| **Body / UI** | **Inter** (variable, 300–700) | Already the working font on home, admin and academies; excellent screen legibility; one variable file covers all weights |
| **Display / Headings** | **Cormorant Garamond** (variable, 300–700 + italics) | The "silent luxury" identity already carried by contact, programs, news and library; elegant, institutional character. Small-caps kickers currently set in Cormorant SC become Cormorant Garamond with `font-variant-caps: small-caps` (same superfamily, zero extra download) |

**Dropped:** Abril Fatface, Cormorant SC/Infant (separate imports), DM Sans, Josefin Sans, Libre Baskerville, Montserrat, Playfair Display, Poppins, Quicksand, Raleway.

**Exception (deliberate):** `academies.html` is a self-contained build with its own designed system (Fraunces + Inter + IBM Plex Mono "ledger" layer). **Recommendation: leave it untouched** — retyping it would mean rebuilding the bundle and it already shares Inter with the site. Say the word if you'd rather I re-skin it too.

### Single import (replaces all 14-family `<link>` tags)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300..700;1,300..600&family=Inter:wght@300..700&display=swap" rel="stylesheet">
```

### Type scale for `tokens.css` (fluid, responsive)

```css
/* — Typography — */
--font-body:    'Inter', system-ui, sans-serif;
--font-display: 'Cormorant Garamond', Georgia, serif;

--fs-display: clamp(2.75rem, 1.8rem + 4.5vw, 4.75rem);  /* hero titles */
--fs-h1:      clamp(2.25rem, 1.6rem + 3vw, 3.5rem);
--fs-h2:      clamp(1.875rem, 1.4rem + 2vw, 2.5rem);
--fs-h3:      clamp(1.5rem, 1.25rem + 1vw, 1.75rem);
--fs-h4:      1.25rem;
--fs-h5:      1.125rem;
--fs-h6:      1rem;
--fs-body-lg: 1.125rem;
--fs-body:    1rem;
--fs-small:   0.875rem;
--fs-caption: 0.8125rem;
--fs-micro:   0.75rem;   /* kickers, badges, button labels */

--lh-display: 1.05;  --lh-heading: 1.15;  --lh-body: 1.65;  --lh-ui: 1.4;
--tracking-display: -0.02em;
--tracking-heading: -0.01em;
--tracking-caps:    0.16em;   /* kickers / eyebrows / button labels */
--tracking-mono:    0.02em;

--weight-light: 300; --weight-regular: 400; --weight-medium: 500;
--weight-semibold: 600; --weight-bold: 700;
```

Enforced via base rules on `h1–h6, p, small, .kicker, .btn` so per-page overrides become unnecessary (and get purged).

---

## 2. Design Tokens Refactor — proposed consolidated `tokens.css`

Three color roles only: **dominant neutrals** (ink/parchment), **primary brand** (indigo), **accent** (gold + one yellow for home hero CTAs). Semantic states included so nothing needs a hard-coded hex.

```css
:root {
  /* ── Neutrals (dominant) ─────────────────────────────── */
  --color-paper:      #F3EFE5;   /* page background — was 8 near-identical creams */
  --color-surface:    #FDFAF5;   /* cards, form surfaces */
  --color-surface-2:  #F7F3EA;   /* recessed panels */
  --color-cream:      #F4EFE2;   /* dark-section text base */
  --color-border:     #E4DCCB;   /* hairline borders */
  --color-ink:        #18140F;   /* body text */
  --color-ink-soft:   rgba(24,20,15,.62);
  --color-ink-faint:  rgba(24,20,15,.38);
  --color-ebony:      #141210;   /* dark sections/footers */
  --color-ebony-2:    #1E1A14;
  --color-ebony-text: rgba(230,218,196,.64);
  --color-white:      #FFFFFF;

  /* ── Primary brand ───────────────────────────────────── */
  --color-brand:        #05014A;  /* indigo — main interactive/branding */
  --color-brand-strong: #0F1F6A;  /* hover */
  --color-brand-tint:   rgba(5,1,74,.08);
  --color-brand-yellow: #FACC15;  /* home-page CTA/highlight only */

  /* ── Accent ──────────────────────────────────────────── */
  --color-accent:        #B07D3F;  /* antique gold — highlights, badges */
  --color-accent-strong: #96682F;  /* hover */
  --color-accent-soft:   rgba(176,125,63,.10);
  --color-accent-border: rgba(176,125,63,.25);

  /* ── Semantic states ─────────────────────────────────── */
  --color-success: #2E7D4F;
  --color-danger:  #9E3030;
  --color-warning: #B45309;
  --color-focus:   var(--color-accent);

  /* ── Typography (see §1) ─────────────────────────────── */
  /* …scale as above… */

  /* ── Spacing — strict 8px grid (4px half-step) ───────── */
  --space-1: 4px;  --space-2: 8px;  --space-3: 16px; --space-4: 24px;
  --space-5: 32px; --space-6: 48px; --space-7: 64px; --space-8: 96px;
  --section-pad: clamp(64px, 8vw, 128px);          /* every <section> */
  --container-max: 1120px;                          /* one width everywhere */
  --container-max-wide: 1280px;                     /* gallery grids only */
  --gutter: clamp(20px, 4vw, 56px);

  /* ── Radii — 5 stops max ─────────────────────────────── */
  --radius-xs: 4px; --radius-sm: 8px; --radius-md: 12px;
  --radius-lg: 20px; --radius-pill: 999px;

  /* ── Elevation — 4 levels ────────────────────────────── */
  --shadow-0: none;
  --shadow-1: 0 1px 2px rgba(24,20,15,.06), 0 1px 3px rgba(24,20,15,.08);
  --shadow-2: 0 4px 12px rgba(24,20,15,.08), 0 2px 4px rgba(24,20,15,.05);
  --shadow-3: 0 12px 32px rgba(24,20,15,.12), 0 4px 8px rgba(24,20,15,.06);
  --shadow-4: 0 24px 48px rgba(24,20,15,.16), 0 8px 16px rgba(24,20,15,.08);

  /* ── Motion ──────────────────────────────────────────── */
  --dur-fast: 200ms; --dur-mid: 360ms;
  --ease-out: cubic-bezier(.22,.9,.37,1);

  /* menu z-index/timing tokens unchanged (already central) */
}
```

Legacy aliases (`--bic-*`, `--lux-*`, unprefixed) get remapped to these tokens in one pass, then deleted — pages keep working while all color decisions move into this file.

---

## 3. Page-by-Page Visual Discrepancy List

**Site-wide**
1. Nav height mismatch: 80px home vs 68px everywhere else → unify at 68px (or 72px — your call).
2. Footer exists in **three implementations** → extract one `footer.css`; markup already near-identical on contact/news/library (news copy drifted), programs uses a divergent class system, home uses Tailwind. Plan: shared footer CSS + `layout.js`-injected footer markup with per-page labels, matching pixel-for-pixel.
3. 10+ button variants → 3 shared classes in a new `components.css`: `.btn-primary` (gold fill / ink text), `.btn-secondary` (outline), `.btn-ghost` (text only); unified padding (`--space-2` × `--space-4`), radius `--radius-pill`, 200ms transitions.
4. Card standard: `background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-1→2 on hover)` applied to programs/news/library cards.

**index.html (home)**
5. Purge 48 inline `style=` attributes — incl. inline `font-family: Montserrat / Josefin Sans / Playfair Display / Cormorant SC / Quicksand` overrides.
6. 8 font `<link>` tags → the single 2-family import.
7. Tailwind arbitrary values (`bg-[#05014a]`, `[#D6D3D1]`, `text-[…]`, `py-[…]`) mapped to tokens / consistent scale.
8. Two Tailwind `tailwind.config` blocks and duplicated font config → one.
9. Home footer rebuilt on the shared footer component; hero CTA pair becomes `.btn-primary/.btn-secondary`.

**contact.html**
10. 11 font links → single import; dead families (Libre Baskerville, Raleway, Poppins…) removed.
11. Page-local `--lux-*` token set remapped to central tokens and deleted.

**programs.html**
12. Its own unprefixed token set (`--ink`, `--parchment`, `--gold`…) duplicates the central one with slightly different values → remap + delete.
13. Divergent `footer-*` class system → shared footer.
14. 16 inline `style=` attributes (mostly transition-delay and bg images) normalized.

**news.html**
15. Palette drift: navy ink `#08103A` + parchment `#FAF8F4` instead of the site ink/parchment → remap to central tokens.
16. 11 font links → single import; footer CSS drifted from contact/library → replaced by shared footer.

**library.html**
17. Same 11-font purge + token remap; Tailwind utility padding on the main container snapped to the 8px grid (`py-8/12` → `--space-6/7`).

**admin.html**
18. 8 font links for a utility panel → single import; keep Tailwind, purge unused family configs.

**academies.html**
19. *(recommended)* untouched — self-contained designed experience; already shares Inter.

---

## Execution order (after approval)

1. New `tokens.css` (full rewrite) + `components.css` (buttons/cards/kickers) + base typography rules.
2. Font links consolidated on all 6 pages (+ alias remapping so nothing breaks mid-flight).
3. Shared nav height + footer extraction (`footer.css` + `layout.js` footer injection).
4. Page passes: purge inline styles, dead tokens, radius/shadow/gap normalization, 8px-grid snap.
5. Re-run the validation suite (HTTP, link check, jsdom menu tests) + visual spot-checks per page.

**Est. blast radius:** CSS-heavy, markup-light. No API or data changes.
