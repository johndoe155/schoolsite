# Visual Refinement — polish audit and completion

**Question answered:** every UI/UX polish in `VISUAL-REFINEMENT-PLAN.md` §3
(items 1–19), as amended by Amendment 1 (type system) and Amendment 2
(footer), plus the four Phase 10 owner notes in `CHANGES.md:537` — is it
actually in the code, or only on the list?

**Method.** Read-only audit of the shipped files first, then fixes, then
re-verification. There is no browser in this environment, so the checks are
code-level and DOM-level rather than pixel-level: a jsdom cascade harness
(`npm run verify:polish`, 23 assertions over the 7 styled pages), a
custom-property integrity sweep over every page and its scripts, `tokens:check`,
`audit:site`, and HTTP smoke over the running server. The one thing that is
*not* claimed anywhere below is a visual screenshot comparison.

**Result: 19/19 items satisfied, 21 defects fixed in this pass** — every item
that was already complete is listed with its evidence; every item that was not
complete states what was wrong and what changed. Nothing was dropped silently;
where the plan text conflicts with a later amendment, the amendment wins and
the note says so.

---

## Verdict per item

| # | Plan requirement | Verdict |
|---|---|---|
| 1 | Nav height unified (80px home vs 68px elsewhere) | ✅ already satisfied |
| 2 | Three footer implementations → one | ✅ already satisfied (mechanism per Amendment 2) |
| 3 | 10+ button variants → 3 shared classes | ✅ completed this pass |
| 4 | Card standard on programs / news / library cards | ✅ completed this pass |
| 5 | index.html: purge 48 inline styles | ✅ satisfied (6 remain, all stagger tokens) |
| 6 | index.html: 8 font links → one | ✅ already satisfied (4 families per Amendment 1) |
| 7 | Arbitrary values → tokens / consistent scale | ✅ completed this pass |
| 8 | Two `tailwind.config` blocks → one | ✅ already satisfied (build-time configs) |
| 9 | Shared footer + hero CTA pair as `.btn-*` | ✅ hero CTA pair completed this pass |
| 10 | contact: 11 font links → one, dead families gone | ✅ already satisfied |
| 11 | contact: page-local `--lux-*` remapped **and deleted** | ✅ completed this pass |
| 12 | programs: unprefixed token set remapped **and deleted** | ✅ completed this pass |
| 13 | programs: divergent `footer-*` → shared footer | ✅ already satisfied |
| 14 | programs: 16 inline styles normalised | ✅ completed this pass |
| 15 | news: `#08103A` / `#FAF8F4` drift → tokens | ✅ completed this pass |
| 16 | news: 11 font links → one, shared footer | ✅ already satisfied |
| 17 | library: font purge + token remap + padding snap | ✅ completed this pass |
| 18 | admin: 8 font links → one, purge unused families | ✅ completed this pass |
| 19 | academies left untouched (re-skinned Phase 6b/8) | ✅ satisfied (self-contained, exempt) |

### Evidence, item by item

1. **Nav height** — `tokens.css:101` `--nav-height: 68px` with the comment
   “one header height everywhere”; `nav.css:159` is the only consumer and the
   only height declaration. All pages share `nav.css`. No 80px override left.
2. **Footer** — one source: `layout.js` `footerHtml()` is injected at
   `[data-bic-footer]`, which is present on all ten pages with per-page themes
   (`warm`, `navy`, `academies`, default landing). `footer.css` is the only
   footer stylesheet; the old divergent class systems are gone.
3. **Buttons** — `components.css` defines exactly three shared classes.
   This pass retired the programs page's local `.btn` / `.btn-gold` /
   `.btn-outline-dark` (and a dead `.btn-close`-style `.btn-submit` in
   `home.css`), moving its buttons onto the shared pair with the page's
   dark-context colours scoped as a re-theme rather than a new variant. One
   documented exception remains: news' `.btn-close`, an overlay **dialog
   control**, not a page CTA.
4. **Card standard** — `.project-card` and `.sidebar-card` (programs) now use
   the standard exactly: `--color-surface` + `--color-border` +
   `--radius-lg` + `--shadow-1`, hover `--shadow-2`. `.hero-card` (news) takes
   the standard materials but keeps `--shadow-3`, because it is the page's
   hero panel, not a grid card (noted in the CSS).
5. **index inline styles** — 48 → 6. All six remaining are `style="--delay:…"`
   stagger tokens, which is the same pattern the reveal system documents. No
   inline `font-family`, colour or size overrides remain.
6. Six / eight / eleven font links are all one combined Google-Fonts request
   per page; the families are the four Amendment 1 roles.
7. **Arbitrary values** — `bg-[#D6D3D1]` gone (About band → `--color-paper`),
   the inline `#4a4580` / `#0f172a` / gradient values gone, the library
   reader's six dark hexes renamed into the `lux.reader-*` palette, and
   `home.css`'s three page-local `:root` blocks (13 hardcoded values deleted)
   replaced with central tokens. Remaining arbitrary classes are structural
   (`h-[100dvh]`, `z-[60]`, `tracking-[0.2em]`), not colour/type drift.
8. Zero `tailwind.config` blocks remain in any page; each page's theme lives in
   `build/tailwind/*.config.js` and is compiled at build time.
9. **Hero CTAs** — the designed gold pill + glass ghost now live in
   `home.css` scoped to `#home`, so the enquiry form's submit button keeps the
   brand-indigo pill instead of inheriting the hero treatment. (The inline
   `text/tailwindcss` block that held these styles has not been compiled since
   the Play CDN was removed — that was the root cause of the grey ghost.)
10.–11. **contact** — one font link; the `--lux-*` block is deleted and all 89
   references resolved to central tokens (`var(--lux-ink)` → `var(--color-ink)`
   and so on). `--lux-surface-hover`, which no file ever defined, was voiding
   the library card hover and is fixed.
12.–14. **programs** — both local `:root` blocks deleted (including a dead
   mobile-menu timing override whose tokens nothing consumed), 84+ references
   remapped; inline styles 15 → 8, all `--delay`; the three background images,
   padding, margin, type and display switches moved to `programs.css` classes.
15.–16. **news** — `#08103A`/`#FAF8F4` appear nowhere; the 23-value alias
   shim is deleted and 149 references remapped; `--radius-xl`, which was never
   defined (square hero panel and article media), now resolves to
   `--radius-lg`; 49 hardcoded family strings are tokens.
17. **library** — one font link; `--lux-surface-hover` fixed; the main
   container's utility padding and the inline nav-offset are now
   `.lib-main` with `--space-*` and `--nav-height` (identical pixels:
   16/24/32px inline, 32/48px block, 100px top offset).
18. **admin** — one font link; the unused `display` and `brand` families were
   purged from the admin build config (the generated sheet no longer carries
   dead `.font-display` / `.font-brand` rules); `admin.css` family strings are
   tokens.
19. **academies** — deliberately self-contained (inline compiled bundle, own
   `:root`); it loads the shared tokens, nav and footer per Amendments 1–2, so
   it is exempt by design and was not touched.

## Amendments

- **Amendment 1 — four type families with strict roles:** satisfied.
  `--font-ui` Montserrat, `--font-body` Quicksand, `--font-display` Libre
  Baskerville, `--font-statement` Abril Fatface in `tokens.css`; every page
  loads one combined Google-Fonts request; the last hardcoded family strings
  (news 49, home 6, admin 3) are now tokens.
- **Amendment 2 — landing footer:** satisfied. Single footer source, deep
  indigo classes, Abril Fatface statement (`var(--font-statement)`), four
  socials; Phases 7/8 per-page theming via `data-bic-footer-theme`.

## Phase 10 owner notes (`CHANGES.md:537`)

1. **Mask colour `#05014a`** — `nav.css:120`
   (`html.bic-transit--hero.bic-is-transitioning::after`), with the sibling
   themes beside it. ✅
2. **Nav-over-menu specificity** — `.bic-nav.bic-nav--open` at `nav.css:262`. ✅
3. **340ms panel delay on all pages** — one shared rule, `nav.css:330`
   (`transition-delay: 340ms`), so it cannot vary per page. The programs page's
   local 60ms override of `--panel-delay` was dead code and is deleted along
   with the token set. ✅
4. **Verification** — the “202 + 20 assertions / 6-page probe” line records the
   original pass; this pass adds `npm run verify:polish` (23 DOM/cascade
   assertions over 7 pages plus a per-page custom-property sweep) as the
   repeatable check going forward. ✅

## Defects found and fixed beyond the list

These were not on the polish list; they were found while proving it, and each
one was a visitor-visible fault:

- **The gallery lightbox was implemented twice** — once in `main.js` and again
  in `home.js` — and `index.html` loads both. Every click advanced two
  independent sets of state, so the counter and the visible image drifted
  apart; the two preloaders fought over the spinner, and a single failed
  preload latched it visible (the old `main.js` block set loader opacity as an
  inline style, which no stylesheet could override). The duplicate 89-line
  implementation is removed; `home.js` owns the lightbox on the home page.
- **Eleven orphaned `reveal opacity-0` elements on index.html** — two section
  headings, the About markers, the “Life at BIC” title, the contact heading and
  the enquiry **submit button** — could never animate in, because `.reveal` is
  defined only in the contact/news/programs stylesheets, which index does not
  load, and index's own scripts activate `.bic-reveal` instead. Converted to
  `.bic-reveal`, which the home-page observers already drive. (contact, news and
  programs were checked the same way and are correct.)
- **The library's JS-rendered content was never compiled.** The Tailwind build
  scanned only `library.html`, but the resource grid, skeleton and empty state
  are injected by `library.js` — so `bg-lux-surface`, `border-lux-border`,
  `animate-fade-up`, `aspect-[3/4]`, `group-hover:scale-110` and friends had no
  CSS at all. The build now scans each page's own scripts; `tw-library.css`
  grew 18.6 KB → 23.4 KB and the cards have their surface, border, badge and
  entrance animation.
- **Void CSS variables** (declared nowhere, silently rendering nothing):
  `--lux-surface-hover` (library card hover), `--radius-xl` (news hero panel +
  article media), `--menu-accent-soft` (mobile toggle hover), `--g-100` (form
  error text) and `--muted` (homepage footer text). The per-page sweep now
  reports **zero** unresolved references across all seven pages.
- **Tailwind media-query leak on the enquiry form.** The `≥1024px`
  `.btn-primary` / `.btn-secondary` rules in `home.css` were unscoped, so the
  contact form's submit button picked up the hero's yellow hover shadow. They
  are now `#home`-scoped like the rest of the hero styling.

## How to re-verify

```bash
npm run verify:polish   # 23 DOM/cascade assertions + per-page var integrity
npm run tokens:check    # tokens.css is still the single source of truth
npm run audit:site      # dependency advisories (unchanged by this pass)
npm run build:tailwind  # regenerates the three per-page sheets (deterministic)
```

Last run: `verify:polish` 7 pages / 0 failures · `tokens:check` in sync ·
`audit:site` unchanged · HTTP 200 on all ten pages · `node --check` clean on
every touched script. **Outstanding, and only a real browser can close it:** a
visual pass over the hero, the enquiry form, the programs cards and the library
reader at desktop and mobile widths.

## One content item for the school

The shared footer's fourth social icon (Dribbble) has **no `href`** — it renders
as a social button that goes nowhere. Supply the school's Dribbble (or
portfolio) URL, or say the word and the icon will be dropped.
