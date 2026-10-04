# Portal UI/UX audit and overhaul plan

**Scope.** The school **portal** — `portal/apps/web`, the Next.js 16 app served
under `/portal` for staff, pupils and guardians. (The marketing site has its
own audit, `POLISH-AUDIT.md`.)

**How this audit was made.** Every claim below was read out of the running
code — `app/**/*.tsx`, `components/shell.tsx`, `app/globals.css`,
`lib/session.ts` — not from a generic checklist. Where a number is quoted
(tables, destinations, hardcoded colours) it was counted in the repository. The
"legacy portal" pain points are the industry-standard ones, but each is marked
**present / partial / absent** for *this* portal, with the file and line as the
witness.

**Roles in play:** `super_admin`, `school_admin`, `registrar`, `auditor`,
`counselor` (all mapped to the admin area), `teacher`, `teacher_assistant`,
`student`, `parent` — nine role codes across four navigation areas
(`shell.tsx` `ROLE_AREA`).

---

## Phase 1 — UX audit and pain-point analysis

### 1.1 The pain points legacy school portals share

1. **Everything is a list.** A portal is read as "the place the timetable
   lives", so teams put every entity in a table and every table on its own
   page. Density is celebrated; priority is absent. Staff learn to *navigate*
   instead of being told what needs doing.
2. **Navigation by org chart.** Menu trees mirror the school's departments
   (Academics → Sections → Students → …), not the tasks ("mark the register",
   "chase this fee").
3. **Mobile is a shrunken desktop.** Portals are designed on a 1440px monitor,
   then squeezed onto the phone a teacher actually holds in the corridor.
4. **No answer to "where am I?"** Deep detail routes (`/admin/users/[id]`,
   `/parent/[childId]`) with no breadcrumb, no title change, no focus move.
5. **Silent systems.** Loading is a bare word, empty is a shrug, failures are a
   red string somewhere near the top of the page.
6. **Search does not exist.** In a 30-destination admin console, the only way
   to reach "transport" is to remember it is the ninth tab.
7. **One theme for all hours.** No dark mode on surfaces staff use at 6am and
   after dinner; no respect for the OS setting.
8. **Jargon as labels** and codes as names (`school_admin`, `sourceType`).

### 1.2 What that looks like in this portal today

| # | Heuristic / criterion | Finding in this codebase | Verdict |
|---|---|---|---|
| 1 | **Mobile: navigation fits the screen** (Nielsen #7 flexibility; WCAG 2.5.5 target size) | `.tabbar` is a fixed bottom bar and every destination is a flex item: admin renders **14 tabs** in it. At 360px each label gets ~25px (`globals.css` `.tabbar a { flex: 1 }`; `shell.tsx` `TABS.admin`). A two-word label wraps or clips. | **Present — severe** |
| 2 | **Mobile: chrome fits the screen** | `.topbar` holds "← Website", brand, role select, display name and three buttons (`Emails`, `Password`, `Sign out`) in one non-wrapping flex row (`shell.tsx` render). | **Present** |
| 3 | **Global search / jump-to** (Nielsen #7; 3.2.3 consistent navigation) | 34 route destinations exist; there is no search of any kind. Navigation is the tab strip plus links inside pages. | **Absent** |
| 4 | **Recognition over recall** (Nielsen #6) | Users must remember which tab holds Transport / Retention / Activity log. Tab labels are also inconsistent nouns ("Overview", "Users", "Students", "Academics", "Email" for notifications). | **Partial** |
| 5 | **Where am I?** (WCAG 2.4.8 Location) | `aria-current` is never set on the active tab — only a CSS class `.on` (`shell.tsx`). No breadcrumb on any of the 12 detail routes. `document.title` stays `"School Portal"` on every page (root `metadata` is the only title, `app/layout.tsx`). | **Present** |
| 6 | **Focus management on route change** (WCAG 2.4.3) | Client-side navigation leaves focus on the link that was activated; nothing focuses the new `<h1>`, nothing announces the change. | **Absent** |
| 7 | **Status messages** (WCAG 4.1.3) | Errors/successes are inline `.alert` elements — good — but they are not announced when they appear outside a form flow, and one is styled with a class that does not exist: `shell.tsx` renders `className="alert error"` while `globals.css` defines `.alert.err`. The role-switch failure message therefore renders **unstyled**. | **Present (1 real bug)** |
| 8 | **Data on small screens** (WCAG 1.4.10 reflow) | 47 `<table>` elements across 29 files (e.g. grades, fees, attendance, audit, users). None is wrapped in a scroll container, so wide tables either squash or push the page horizontally. | **Present — severe** |
| 9 | **Loading feedback** (Nielsen #1 visibility of status) | `Loading…` as plain text in 15 places (`app/**/*.tsx`); no skeletons, no `aria-busy`, no progress affordance for slow registers on school Wi-Fi. | **Present** |
| 10 | **Empty states** (Nielsen #1; 3.3.3) | Empty lists are `<div className="muted">No sections assigned yet.</div>` — no explanation, no next action. 20+ instances. | **Present** |
| 11 | **Error prevention & recovery** (Nielsen #5, #9; WCAG 3.3.1/3.3.3) | Forms rely on `required` + server errors; labels exist, but error text is not tied to inputs (`aria-describedby`/`aria-invalid` absent) and inputs have no error styling. | **Partial** |
| 12 | **Colour semantics** (WCAG 1.4.3, 1.4.11) | Attendance chips are tinted from semantic tokens (`color-mix`) — good — but status is also carried by colour alone inside those chips only because the word is printed inside them. Elsewhere the parent dashboard hardcodes `#b45309` for "link pending" (`app/parent/page.tsx`). | **Partial** |
| 13 | **Dark mode / time of day** (WCAG 1.4.3 in context) | No dark theme, no `prefers-color-scheme` handling, `themeColor` is a single indigo. Teachers take registers before sunrise. | **Absent** |
| 14 | **Visual hierarchy / scannability** (Nielsen #8 aesthetic-minimalist) | `.card` is the only surface; every card has the same weight, so a dashboard reads as a stack of equals. `h1`/`h2` are the only styled headings — `h3`–`h6` inherit browser defaults and there is no eyebrow/section pattern. | **Present** |
| 15 | **Typography discipline** (legibility; text spacing 1.4.12) | The token stacks name webfonts (Montserrat/Quicksand/Libre Baskerville) that the portal's strict `font-src 'self'` CSP never loads, so the browser falls through to Trebuchet/Verdana/Georgia — inconsistent across OSes and not a deliberate pairing. | **Partial — improvable** |
| 16 | **Motion** (WCAG 2.3.3) | `prefers-reduced-motion` already zeroes transitions — a genuine strength. | **Handled** |
| 17 | **Keyboard access** (WCAG 2.1.1, 2.4.7) | Skip link, `:focus-visible` ring, native controls — a strength. Missing: focus trap for future overlays, keyboard access to a palette (none exists). | **Handled / N/A** |
| 18 | **Print** (real school workflow) | Report cards, receipts and statements print as A4 sheets with chrome removed (`@media print` block). Strong, keep. | **Handled** |
| 19 | **Trust at first sight** (login = the whole first impression) | Login is a left-aligned `h1` + form on a bare page (`app/login/page.tsx`); no brand surface, no "what is this", no password-manager hints. | **Partial** |
| 20 | **PWA/offline** | Manifest, icons, register queueing (`lib/offline.ts`) exist — ahead of most school portals. The UI around them (queued-register banner) is text-only. | **Handled** |

### 1.3 The heuristic set used for grading

- **Nielsen's 10 usability heuristics**, with #1 (visibility of status), #6
  (recognition over recall), #7 (flexibility/efficiency) and #8 (minimalist
  design) weighted highest for a daily-use portal.
- **WCAG 2.1 AA**, specifically: 1.4.3 contrast (text), 1.4.11 non-text
  contrast (controls/state), 1.4.10 reflow (320px, no horizontal page scroll),
  1.4.12 text spacing, 2.1.1 keyboard, 2.4.3 focus order, 2.4.7 focus visible,
  2.4.8 location, 3.3.1/3.3.3 error identification and suggestion, 4.1.3 status
  messages, plus 2.5.5 target size (44×44px) as a house rule.
- **The "5-minute staffroom test."** Can a teacher mark a register, note an
  absence and check tomorrow's room **one-handed, on school Wi-Fi, in under
  five minutes, at 7:40am**? This is the portal's primary user story and every
  recommendation is measured against it.
- **Data-density rules for phones:** one decision per screen; numbers right,
  labels left; detail on demand (expandable rows) instead of 9-column tables.

---

## Phase 2 — "High-end" design system and UI direction

The palette and spacing **tokens already exist** (`app/tokens.css`, synced from
the site by `npm run tokens:sync`) and every rule in `globals.css` is scoped
`body.portal-root`. The direction below extends that system rather than
replacing it, because the tokens are the thing that keeps the portal and the
marketing site visually one school.

### 2.1 Typography — deliberate system stacks, not accidental fallbacks

The portal may not load webfonts (strict `font-src 'self'` CSP on pages that
hold pupil data — a good constraint, kept). So the "font stack" **is** the
design, and it should name the best faces on each OS instead of stopping at
Georgia:

```css
--portal-font-ui:      ui-sans-serif, system-ui, -apple-system, "Segoe UI Variable Text",
                       "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--portal-font-display: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino,
                       "Book Antiqua", Georgia, serif;
--portal-font-num:     ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", monospace;
```

- **Roles.** UI/controls/labels/tables → `--portal-font-ui` at
  `--font-ui` weights; page titles, `h1`, report-card headings, the portal
  wordmark → `--portal-font-display`; money, marks and counters →
  `--font-num` **with `font-variant-numeric: tabular-nums`** so columns of
  numbers line up — the single cheapest "premium" change in a portal full of
  figures.
- **Scale** (already tokenised; used consistently rather than invented per
  page): `--fs-h2` page title → `--fs-h3` (clamp), section `h2` → `--fs-h5`,
  body → `--fs-body`, meta → `--fs-small`, labels/eyebrows → `--fs-micro` +
  `--tracking-caps` + uppercase.
- **Rhythm of a page, always the same:**
  `eyebrow → h1 → lede → primary action row → content`. Implemented as a
  `.page-head` block so every new page gets it for free.
- **Measure and wrapping:** body copy `max-width: 68ch`; headings
  `text-wrap: balance`; paragraphs `text-wrap: pretty`; line-height 1.5 body /
  1.15 headings. Text stays reflowable at 320px with 200% zoom (1.4.10).

### 2.2 Spacing — one 8px grid, three rhythms

`--space-1..8` (4/8/16/24/32/48/64/96) already exists. The rules:

- **In-component:** 8–16px (`.row`, chips, input padding).
- **Between blocks:** 24–32px (`--space-4/5`). Cards never sit closer than
  `--space-3`.
- **Between sections:** 48–64px (`--space-6/7`).
- New helpers: `.stack` (uniform vertical rhythm), `.grid.cards`
  (`repeat(auto-fit, minmax(260px, 1fr))` — cards find their own columns
  instead of `cols2`/`cols3` guesses), `.toolbar` (sticky action row).
- Container widens from 960px to **1100px on ≥1200px screens only**, so dense
  tables get room without stretching prose lines.

### 2.3 Colour — trustworthy, academic, modern

Keep the school's existing story: **parchment paper, deep indigo, antique
gold.** What the system adds is a *semantic* layer so no page invents a colour
again, plus a dark theme.

| Role | Light | Dark | Use |
|---|---|---|---|
| Background | `--color-paper` `#F3EFE5` | `#111014` | page |
| Surface | `--color-surface` `#FDFAF5` | `#1A191D` | cards, sheets |
| Surface-2 | `--color-surface-2` `#F7F3EA` | `#222026` | recessed/table headers |
| Ink | `--color-ink` `#18140F` | `#F2EFE9` | body text |
| Muted | `--color-ink-60` | `rgba(242,239,233,.66)` | meta |
| Brand | `--color-brand` `#05014A` | `#8E9BFF` (tint lifted for contrast) | actions, links |
| Accent | `--color-accent` `#B07D3F` | `#D3A860` | focus-of-attention, gold rule |
| Success | `#2E7D4F` | `#5FBF85` | present, paid |
| Warning | `#B45309` | `#E0A94B` | late, partial, pending |
| Danger | `#9E3030` | `#F08A8A` | absent, overdue |
| Info | `#0F1F6A` | `#9DB2FF` | excused, neutral notice |

Every pair above is verified against its surface for WCAG AA (contrast ratios
computed in `scripts/check-contrast.mjs`, added in this pass — text ≥4.5:1,
large text and UI ≥3:1).

Status is **never colour alone**: chips carry the word, alerts carry an icon
slot, and the attendance chips keep their text label (WCAG 1.4.1).

### 2.4 Component styling

- **Cards.** `--radius-md` (12px), 1px `--line`, `--e1` shadow, `--space-4`
  padding. Hover lifts nothing (this is data, not a gallery); interactive
  cards get a 1px accent border on hover/focus.
- **Buttons.** Three weights only: `.btn` (indigo fill), `.btn.ghost`
  (outline), `.btn.quiet` (text) + `.btn.small`. States: hover darkens one
  step; `:active` translates 1px; `:disabled` 45% + `not-allowed`; `.btn[aria-busy]`
  shows a spinner and keeps its measured width (no layout jump); focus ring is
  the 3px `--color-focus` outline, offset 2px — visible on both themes.
- **Inputs.** 44px min height, white/surface fill, 1px line, brand focus ring;
  `.field` wrapper with label, `.hint` (muted, `--fs-micro`) and `.err-text`;
  error state = danger border + `aria-invalid="true"` + `aria-describedby`
  pointing at the message. Password/email/one-time-code inputs get the right
  `autocomplete` and `inputmode`.
- **Glass surfaces.** Used **once**: the sticky topbar gets
  `backdrop-filter: blur(12px)` + rgba surface + a hairline bottom border. In a
  data portal, blur everywhere costs legibility; one glass element reads
  premium, ten read muddy.
- **Empty states.** `.empty` block: icon, one-sentence explanation, one
  primary action. Never a bare "No X".
- **Skeletons.** `.skeleton` shimmer (respecting `prefers-reduced-motion`),
  shaped like the content they replace (3 rows of text, or a card block), with
  `aria-busy="true"` on the region and a polite "Loading" for screen readers.
- **Motion budget.** 120–200ms, `--ease-out`, transform/opacity only.
  Everything collapses under `prefers-reduced-motion` (already enforced).

---

## Phase 4 — Modern features and micro-interactions

Five, all implementable in this stack (Next 16 App Router, server components
for data, tiny client islands; no new dependencies):

1. **Command palette — `⌘K` / `Ctrl+K`.** One input over: every destination the
   account is permitted to reach, recent pages (localStorage), and actions
   (toggle theme, switch role, sign out, account pages, print sheets). Full
   ARIA combobox pattern (`role="dialog"` + `aria-modal`, listbox with
   `aria-activedescendant`, ↑↓/Home/End/Enter, Esc restores focus). This is the
   single biggest usability win in the audit: it removes the "remember the
   ninth tab" problem and gives phones a navigation surface that cannot
   overflow.
2. **Dark mode, done properly.** `prefers-color-scheme` decides on first visit
   (pure CSS, so there is **no flash** and no inline script that the CSP would
   block); the toggle writes a cookie so the server renders the right theme
   thereafter; `color-scheme` is set so native controls and scrollbars follow.
3. **Thumb-first mobile navigation.** The bottom bar shows the four most-used
   destinations for the signed-in area plus **More**, which opens the palette
   full-screen. The remaining tabs stay in the same bar on ≥768px, exactly as
   today. Topbar collapses to brand + search + account menu.
4. **"Where am I" as a feature.** On every client-side navigation: focus moves
   to the page `<h1>` (no scroll jump), `document.title` becomes
   `<page> · <school>`, and a polite live region announces the page — so screen
   reader users and keyboard users both land, and browser history/tabs become
   readable (WCAG 2.4.2, 2.4.3, 4.1.3).
5. **Personalised "Next" strip on dashboards.** For each area, one band at the
   top of the dashboard built from data the page **already fetches** (no new
   endpoints, no extra latency): teacher → "Mark today's register" with the
   section chips; student → next exam countdown + unread-absent count; parent →
   each child's pending verification; admin → the console's own quick actions.
   This is the "tell me what to do" layer the portal has never had.

Deliberately **not** in this pass (needs API work, not CSS): server-side search
across students/invoices (needs a search endpoint + permission model),
notification centre with read state, and per-widget drag/drop ordering.

---

## Implementation in this pass

Everything above is implemented in the same commit as this document:
design-system v2 in `app/globals.css`, `components/command-palette.tsx`,
`components/account-menu.tsx`, `components/theme-controls.tsx` (cookie write),
`components/route-announcer.tsx`, `components/empty-state.tsx`,
`components/skeleton.tsx`, a rewritten `components/shell.tsx`, dashboard
"Next" strips, login polish, `scripts/check-contrast.mjs`, and the WCAG fixes
(`aria-current`, error-class bug, table reflow, per-page titles). Verification
and the exact contrast ratios are recorded at the end of the file.

---

## Verification (as built)

Recorded on the commit that implements the overhaul, from the repository itself.

**Type and build**

| Command | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run build` (`next build`) | ✓ exit 0 — 45 routes compiled, all dynamic (the root layout reads the theme cookie) |
| `node scripts/check-contrast.mjs` | ✓ 19/19 pairs meet WCAG 2.1 AA (table below) |

**Contrast, read from the shipped CSS** (`app/tokens.css` for light, the palette
block in `app/globals.css` for dark; transparent values are composited before
measuring):

```
light --color-ink on --color-surface          17.60:1  (AA text 4.5)  PASS
light --color-ink-60 on --color-surface        4.72:1  (AA text 4.5)  PASS
light --color-warning on --color-surface       4.82:1  (AA text 4.5)  PASS
light --color-danger on --color-surface        6.91:1  (AA text 4.5)  PASS
light --color-accent on --color-surface        3.45:1  (AA non-text 3) PASS
light --color-brand on --color-surface        18.18:1  (AA text 4.5)  PASS
light --color-cream on --color-brand          16.48:1  (AA text 4.5)  PASS
dark  --ink on --card                         15.24:1  (AA text 4.5)  PASS
dark  --muted on --card                        7.63:1  (AA text 4.5)  PASS
dark  --warn / --bad / --ok on --card   9.07 / 8.30 / 9.54:1  PASS
dark  --accent on --card                       7.95:1  (AA non-text 3) PASS
dark  --brand on --card                        8.88:1  (AA text 4.5)  PASS
dark  --brand-ink on --brand                   9.45:1  (AA text 4.5)  PASS
```

The gate found one real gap while being written: the dark palette had no
`--accent`, so gold accents kept the light value on dark surfaces. Dark now
defines `--accent: #D3A860` (the value in the Phase 2 table), which measures
7.95:1 — brighter gold that also clears AA.

**Server-rendered behaviour** (checked against `next start` on a local port —
no browser was available in this environment):

- `GET /portal/login` → `<html lang="en">`, `<title>Sign in · School Portal</title>`
- same request with `Cookie: portal_theme=dark` → `<html lang="en" data-theme="dark">`:
  the theme is decided **server-side from the cookie**, and a first visit with
  no cookie is decided by `prefers-color-scheme` in CSS. No inline script, no flash.
- `/portal/forgot`, `/portal/reset`, `/portal/legal/terms` → titles
  “Reset password · School Portal”, “Choose a new password · School Portal”,
  “Terms of use · School Portal” (root-layout template + per-page `metadata.title`).
- `/portal/student` without a session → 307 to `/portal/login`.

`npm run smoke -w @portal/web` was **not** runnable here: it imports
`apps/api/dist/…`, and the API has not been built in this checkout (it also
needs a live database). That suite is the API-level end-to-end test; the web
build, the type-check and the contrast gate are the checks that belong to this
change and all three pass.

## Deviations from the plan text (explicit, so nothing reads as silently dropped)

1. **`components/account-menu.tsx` does not exist as its own file.** The
   account menu is implemented inside the rewritten `components/shell.tsx`
   using a native `<details>` disclosure — it is the same feature (collapse the
   topbar’s Emails/Password/Sign out into one menu), placed where the session
   data already lives. The native element means it opens with a keyboard and
   without JavaScript; click-away and Escape were added on top.
2. **The “Next” strip shows the data each dashboard actually has**, rather than
   inventing metrics: teacher → “Take register: <first section>” plus the
   timetable; student → next exam, unpaid invoice, attendance rate; parent →
   links pending verification; admin → people count, section count, a jump to
   reports. No new endpoints were added, so no page got slower.
3. **Per-area mobile tabs are chosen, not just truncated.** Phone bottom bars
   show four destinations per signed-in area (admin: Overview, Students, Fees,
   Timetable; others are their full list, which is already ≤4) plus **More** →
   command palette. Everything else stays in the desktop pill bar and in the
   palette on phones.
4. **One page has no `metadata` export, on purpose.** `app/offline-register`
   is a client component, and Next cannot take a `metadata` export from one.
   Its title comes from the same `lib/nav.ts` table through `<RouteAnnouncer>`,
   so it still reads "Offline register · <school>" after navigation.
5. **Deferred features are unchanged** from the note above: server-side search
   endpoints, a notification centre with read state, and widget re-ordering
   need API work beyond this pass and are not half-built here.
