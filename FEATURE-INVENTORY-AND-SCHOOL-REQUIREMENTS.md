# Bodija International College — Website & Portal

## Complete feature inventory · and what we need from the school

**Prepared:** 3 October 2026
**What this is:** a plain-language inventory of everything the website and the school portal do today, followed by the exact list of things only the school can supply before it can go live to staff, pupils and parents.

**How to read it**

| Part | Contents | Who should read it |
| --- | --- | --- |
| **Part 1** | Every feature of the public website, page by page | Leadership, office, admissions |
| **Part 2** | Every feature of the portal, by role | Leadership, head teacher, bursar, IT |
| **Part 3** | What runs underneath (security, data, backups, testing) | Whoever signs off on going live |
| **Part 4** | **What we need from you — the action list** | Everyone above |
| **Part 5** | What is deliberately not built yet | Leadership (so nothing is a surprise) |
| **Part 6** | Suggested sequence and running order | Leadership |

Two things worth saying up front:

1. **Nothing in this document is a plan.** Everything in Parts 1–3 is built, tested and running. The test numbers are in Part 3.
2. **Nothing is paid for, and nothing is on the internet yet.** The system currently runs on the development machine. Part 4 is what changes that.

---

# Part 1 — The public website

Ten pages, one design system, one server. Every page shares the same navigation, the same footer, the same address and the same reply promise — those facts now live in one file rather than being re-typed per page, so a correction to one appears on all of them.

## 1.1 Pages

| Page | Address | What it does |
| --- | --- | --- |
| **Home** | `/` | Hero video, "A Legacy of Excellence", the three programmes, the Chairman's message, the photo gallery, an enquiry form |
| **Our Programs** | `/programs.html` | The three programme tracks in detail, plus a per-programme enquiry form |
| **Updates** | `/news.html` | News articles with search, categories, pagination and a featured story. Also carries the staff content panel (§1.3) |
| **Digital Library** | `/library.html` | Curriculum resources — search, filters, an in-page PDF reader. Also carries the staff upload panel (§1.4) |
| **BIMA · BIFA** | `/academies.html` | The two academies — media arts and football — with enrolment details, fees, bank details and contact |
| **Get In Touch** | `/contact.html` | Enquiry form, opening hours, social links, a map that opens directions |
| **Privacy Notice** | `/privacy.html` | What the website collects, why, for how long, and how to exercise your rights |
| **Unsubscribed** | `/newsletter-unsubscribed.html` | The page a person lands on after unsubscribing from the newsletter |
| **Staff gallery admin** | `/admin.html` | The photo gallery manager (§1.5) |
| **Page not found** | any bad address | A branded 404 with a way back, instead of the browser's default |

## 1.2 Home page, in detail

- **Hero** — a background video with a still-image poster for slow connections, an overlay, a headline and two call-to-action buttons. The video is chosen for the device (a lighter file on phones) and respects a visitor's "reduce motion" setting.
- **A Legacy of Excellence** — the school's story, with supporting panels for Modern Labs and Library & Research.
- **Our Programs** — the three tracks, each linking to the full description on the Programs page.
- **The Chairman's message** — the Founding Chairman's message and pull-quote.
- **Life at BIC** — the photo gallery, drawn from the albums managed in the staff panel.
- **Start Your Journey** — the enquiry form: name, email, message, a consent checkbox linking to the Privacy Notice, and a sending state.
- **Footer (on every page)** — logo, motto, address, phone, email, opening hours, social links, a link to the Portal sign-in and a link to the Privacy Notice.

## 1.3 News / Updates

**For visitors**

- A featured lead story at the top.
- Full-text search across headlines, standfirsts and body text.
- Category filters, generated from the categories actually in use.
- Pagination with page counter.
- Articles open in a reader view (a modal overlay, addressable by link so a single article can be shared).
- Social sharing and a "back to top".
- Newsletter sign-up box.

**For staff, in the same page behind a password**

- Sign in / sign out (separate staff password, session-based).
- Compose an article: title, standfirst/excerpt, category, body, and a publish date.
- **Drag-and-drop image upload** with a preview, a remove button, a 5 MB limit and an image-type check.
- Publish, and delete an existing article.
- Choose which story is the featured lead.
- **Newsletter panel** — see §1.6.

## 1.4 Digital Library

**For visitors**

- Search by title, subject or year.
- Filter by resource type and by subject.
- Filter chips showing what is currently applied, with clear-all.
- Result count and an empty state that explains itself.
- Pagination.
- **An in-page PDF reader** — the file opens in the page, with page navigation, zoom in / zoom out, scroll-through-pages, and a download button. No separate PDF application needed.
- Card thumbnails.

**For staff, behind a passcode**

- Upload a PDF with its title, subject, year and type.
- Sign in is rate-limited: five wrong attempts locks the panel for a minute.

## 1.5 Photo gallery & its admin panel

- Seven curated albums (**Moments, The Helm, Alumni, Discovery, Horizons, Foundations, Sports**) holding 121 photographs, already loaded.
- The public gallery groups photos into albums with titles and subtitles.
- **Staff panel** (`/admin.html`, separate password): create, edit and delete an album; upload images by drag-and-drop with a progress bar; re-upload or remove individual images; set the cover image; reorder; search albums; and live counts of albums, images and unsaved changes.

## 1.6 Newsletter

The school can now collect email addresses **and write to them** — previously addresses could only be collected and exported.

- **Subscribe** — a form on the News page and the Contact page, with duplicate handling and a confirmation message.
- **The subscriber list** is visible to staff.
- **Send a campaign, from the admin panel:**
  - See how many people will receive it **before** sending anything.
  - **Send yourself a test first** — it arrives marked `[TEST]`.
  - A two-step confirm: nothing goes out until the recipient count has been shown and confirmed.
  - Delivery runs in batches with visible progress, and reports which addresses failed and why.
  - **Campaign history** — every send, with its subject, date and result.
  - A stopped campaign **resumes where it stopped** rather than re-mailing people who already received it.
- **Unsubscribe** is a real one-click link in every email (the technical standard Gmail and Yahoo require). It works without signing in, and it is signed so that a tampered link changes nothing.
- **Honest refusal:** if the school's mail server is not configured, the send screen says so and sends nothing — it never pretends to have delivered.

## 1.7 Enquiry and contact forms

- Home page form and Contact page form; the Programs page has a programme-specific form.
- Fields: name, email, subject/programme interest, preferred visit date (Contact page), message.
- Consent checkbox with a working link to the Privacy Notice.
- Sending states, success messages and error messages — the visitor is never left guessing.
- **Spam and abuse protection:** the forms are rate-limited to 5 submissions per 15 minutes per visitor.
- Messages are emailed to the school address; the reply promise shown to the visitor is **"We reply within 2–3 business days."**

## 1.8 Consistency, accessibility and search-friendliness

- **One address everywhere:** 1-5 Osuntokun Avenue, Off Tunde Lakanmi Street, Crescent, Oyo.
- **One reply promise everywhere:** 2–3 business days.
- **The academies session window rolls forward on its own** — it reads "Next Session: April 2 – 19, 2027" and updates itself each spring instead of advertising a date that has passed.
- Keyboard-navigable menus with focus handling, escape-to-close and a screen-reader-friendly structure; the BIMA/BIFA page reduces or disables motion for visitors who ask for that.
- Mobile-first throughout; the layout adapts to phone, tablet and desktop.
- Every page carries a page title and a search-engine description; staff pages are barred from search engines via `robots.txt`.

## 1.9 Security on the public site

- **Content Security Policy with a per-request nonce** — inline scripts can only run if the server itself issued them for that page load.
- `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Permissions-Policy` on every response, including 404s and API replies.
- HTTPS enforced with HSTS when the site runs behind TLS.
- Session cookies are `HttpOnly`, `SameSite`, and `Secure` in production, with signed cookies and a long random secret.
- Separate passwords for the news panel, the gallery panel and the library panel, so a person who manages one does not automatically control the others.
- Rate limits on every password prompt and every public form.
- In production, **the server refuses to start** if any of the default passwords are still in place or the session secret is missing or weak.

---

# Part 2 — The school portal

A private, sign-in-only system for staff, pupils and parents. It is reached at `/portal` from the school's own website, so there is one address and one login for everything.

**Scale:** 47 screens, 159 API endpoints, 49 database tables, 9 roles.

## 2.1 Who can do what

| Role | Sees |
| --- | --- |
| **Super administrator** | Everything, including school settings and role assignment |
| **School administrator** | Everything operational |
| **Registrar** | Pupil records, classes, enrolments, timetable |
| **Counselor** | Read-only access to attendance and marks |
| **Teacher** | Their classes: attendance, marks, homework, materials, messages |
| **Teaching assistant** | Attendance and marks for their classes, and their timetable |
| **Pupil** | Their own timetable, marks, attendance, homework, fees, report card |
| **Parent / guardian** | Their own children only: marks, attendance, homework, fees, messages, report card |
| **Auditor** | Read-only across records plus the activity log |

Permissions are enforced in **three independent layers** — the role's capability list, the code path, and the database itself. The database layer (row-level security) means that even if a screen or a check were wrong, one family's data cannot be served to another family.

## 2.2 Signing in, and account security

- School email and password.
- **Two-factor authentication (authenticator app)** for staff, with a QR code or a manual key; recovery codes if the phone is lost.
- **Two-factor rollout screen** for the office: see who has enrolled and who has not, and issue enrolment codes for everyone outstanding **in one action**, with a **printable sheet** for handing out at a staff meeting.
- **Microsoft and Google sign-in** are supported (optional — see Part 4 for whether the school wants them switched on).
- **Password reset** by emailed one-time link, and a forced change on first sign-in when an account was created with a temporary password.
- **Lockout** after repeated wrong passwords, plus rate limits.
- **Session management:** sign out, and role switching for people who hold more than one role.
- A **grace window** for two-factor rollout: staff who have not enrolled can still work during a dated window, while those who have enrolled still step up. The window closes itself and the readiness screen refuses to go green until nobody depends on it.

## 2.3 Administrator screens

| Screen | What the office can do |
| --- | --- |
| **Admin console** | The overview: classes, counts and the way in to everything else |
| **Students** | Create a pupil; edit details; search; per-pupil page; **guardians** panel (link, confirm, revoke) |
| **User directory** | Every account — staff, pupils, parents. Invite by email; resend or revoke an invite; assign and remove roles; lock and unlock; reset or reissue two-factor; **offboarding preview** (what the person still holds before you deactivate them); deactivate and reactivate; export a person's data |
| **Two-factor rollout** | Coverage by role, bulk enrolment codes, printable sheet |
| **Course sections** | Create classes; assign and remove teachers; add pupils to a class; per-class roster |
| **Academics** | Academic years (create, set current); terms; **grading scale** (bands, letters, points, exam vs coursework weights); **end-of-year rollover** (below) |
| **Timetable** | The weekly grid per class; the bell schedule (periods, breaks, start times); teacher assignment per slot; clash detection |
| **Fees** | Invoices (create, list, filter); **fee templates** with bulk generation for a term; record a cash or bank-transfer payment; reconciliation report |
| **Transport** | Bus routes and stops; assign pupils to a route |
| **Bulk import** | CSV import for pupils, staff, classes, enrolments and parents/guardians (below) |
| **Reports / Readiness** | The go-live checklist and the reconciliation report |
| **Email & notifications** | The outbox: what was sent, what failed, why, and a retry button |
| **Data retention** | The retention windows in force, when the purge last ran and what it removed; run a purge on demand |
| **Erasure requests** | The right-to-erasure process: find a person, preview exactly what would be deleted, carry it out with a recorded reason |
| **Activity log** | Every write, with who did what and before/after values — and a **verify** button that re-computes the tamper-evident chain and reports any row that has been altered; filter by action; export to CSV |
| **School settings** | Name, logo, brand colours, contact email, **Data Protection Officer email**, address, phone, timezone, currency, mail sender, and the DPIA reference |
| **System status** | A live panel on the console showing the state of the platform |

### Bulk import — the roster on-ramp

The school's existing spreadsheets come in as CSVs, in this order: **pupils → staff → classes → enrolments → parents & guardian links**.

- **Dry run first** — the import reports every problem row (bad email address, weak password, grade out of range, duplicate admission number) and writes nothing.
- **Re-running is safe** — duplicates are skipped, so a corrected file can simply be uploaded again.
- **Large files run as a background job** with a progress bar, a per-row error report you can download, a cancel button, and a credentials list for any account created without email delivery.
- **Passwords are optional.** Leave the password column blank and each person is emailed a link to choose their own — no plaintext passwords in a spreadsheet. Parent accounts are created automatically from the email address in the pupils' file.

### End-of-year rollover

Moving every pupil up a year is the single largest write the system performs, so it is built as a scheduled procedure rather than a button:

- Preview the whole move — including **which pupils graduate** and **who repeats, leaves or transfers** — before anything is written.
- Blockers stop the run; warnings inform it.
- The whole rollover is **one transaction**: it either completes or leaves the school exactly where it was.
- If it was wrong, **Undo** puts every pupil back.

## 2.4 Teacher screens

| Screen | What the teacher can do |
| --- | --- |
| **My sections** | Every class they teach, with quick links to take the register, enter marks or set work |
| **Daily register** | Mark the whole class on one screen — **present, late, absent or excused** — with a running count per status; add a note; **finalize** the register, after which it is locked against edits |
| **Offline register** | Take a register **with no internet connection** (below) |
| **Gradebook** | Enter marks **for the whole class at once** — name the piece of work once, type down the column, one save. Existing marks for the same work prefill so corrections are edits rather than retyping; blank rows are skipped rather than saved as zero; marks above the maximum are flagged before saving. A single-mark form sits below it. A **release** step publishes the marks to pupils and parents |
| **Classwork** | Set homework (title, instructions, due date, a file or a link); post class materials (a resource file or link); see who has handed in; delete |
| **Messages** | Start a conversation with a parent or pupil; reply; close a thread. Attachments supported |
| **My timetable** | Their own week |

### Offline register — the classroom with no signal

Built for the teacher standing in a classroom where the phone has no bars:

- The register is marked up **on the phone, offline**.
- The page itself is stored on the device in advance, so it opens without a connection.
- **The class list is read back out of the device's own storage**, so the teacher still sees the children's names and can still mark them — it is not merely a "saved for later" form.
- Marks are held on the device and sent automatically when the connection returns.
- The same register cannot be submitted twice — each one carries a stable identifier, so a retry after a dropped connection does not duplicate anything.
- **If the server refuses a register** (the class was finalised elsewhere, a pupil has left, the session ended), the screen says exactly that and names the date — it never disguises a refusal as "waiting for connection", so nothing is silently lost.
- **Signing out wipes the device** — important on a shared staffroom phone.

## 2.5 Pupil screens

| Screen | What the pupil can do |
| --- | --- |
| **Dashboard** | Latest released marks, upcoming exams, and their school transport |
| **My timetable** | Their week |
| **My grades** | All released marks by subject, plus **their report card** |
| **Homework** | Homework set across their classes, and class materials to download; **hand in** an answer — typed, or as a photo or file, with an upload progress bar |
| **Fees** | Their invoices, what is outstanding, and pay online (if the school enables it) |
| **Print report card** | A printable report card (below) |

## 2.6 Parent / guardian screens

| Screen | What the parent can do |
| --- | --- |
| **My children** | One card per child — a **"Today" panel** with today's lessons and any absence, homework due, and fee status |
| **Child page** | Released marks by subject, attendance record, timetable, homework, fees — and the child's **report card** |
| **Messages** | Read threads about their child, **reply to them**, and **start a new conversation with any teacher who teaches that child**. Also receives the teacher's reply |
| **Fees** | Invoices, outstanding balance, and **pay online**; a printable statement |
| **Guardian link verification** | Confirming, themselves, that they are the parent of a given child — by emailed one-time link, or by the office confirming it in person |

**Guardian links are the whole basis of parent access.** Until a link is verified, a parent sees that the child is *Link pending* and can see **no** data about them — that is enforced beneath the screens, not by hiding buttons. A parent's reply is only possible on a thread about their own child, and they still cannot change any other record.

## 2.7 Printable documents

Both are real documents, produced by the browser's own print/Save-as-PDF, so nothing new has to be installed and there is no separate PDF service to maintain:

- **Report card** — school header and logo, pupil name and admission number, per-subject marks with letter grades and points, attendance, the overall average, a teacher's remark area and signature lines. Marks are computed through the school's own grading scale and weights, and the scale in force is stored with each card so an old card keeps its original grades.
- **Fee statement / receipts** — one receipt per payment (including cash and bank transfers recorded at the office) with amount, date, method, reference and the outstanding balance.
- Both use a dedicated print stylesheet: the app's menus and buttons are removed, margins are set for A4, and the result is something you would hand to a parent.
- Access is checked on every request: a guardian cannot open another family's child's document even by editing the address, and a pupil can only open their own.

## 2.8 Messages

Messages are a private staff ↔ family channel about a specific pupil. They are **not** visible to pupils.

- A teacher or the office opens a thread about a pupil; the thread shows who it is about.
- Parents and guardians **reply**, and can **start a thread with their child's teacher**.
- Threads can be closed by the teaching side; a closed thread refuses new replies rather than silently accepting them.
- **Attachments** are supported.
- Email notification goes to the other party, with a per-category opt-out.
- Both sides have an inbox and a thread view.

## 2.9 Fees and online payments

- **Invoice** a pupil, or a whole class/year from a **fee template** — one invoice per pupil, and re-running never double-charges.
- **Record a cash or bank-transfer payment** at the office — completes immediately and produces a receipt.
- **Online card payment** through Paystack: the parent is taken to a secure checkout and returned to a page that tells them whether the school has the money. The charge is raised in the school's own currency.
- **The webhook is signature-verified and idempotent** — a replayed notification cannot credit an invoice twice.
- Payment status is visible to the parent, and the bursar has a reconciliation report.
- **Online payment is optional.** A school that takes only cash and transfers can leave it switched off; the readiness screen downgrades it to a note rather than a blocker.

## 2.10 Exams, transport and timetable

- **Exams** — schedule an exam on a class (subject, date, duration, room); pupils and parents see their upcoming exams.
- **Transport** — create bus routes and stops; assign pupils to a route; pupils and parents see their own route, stop and pickup details.
- **Timetable** — an admin week grid per class with a bell-schedule editor (periods, breaks, start times); **clashes are refused** rather than warned about; teachers get "My timetable"; pupils and parents get theirs, and the parent's child page shows today's lessons.

## 2.11 Communications the system sends by itself

Twelve branded email templates, all carrying the school's name and colours:

| Trigger | Who receives it |
| --- | --- |
| Invitation to the portal | New staff, pupils, parents |
| Password reset | Anyone who requests one |
| Two-factor enrolment | Staff being enrolled |
| Guardian link verification | Parent confirming a child |
| Access ended | Offboarded staff |
| **Absence recorded** | Parent/guardian, the moment a teacher marks an absence |
| **New marks published** | Parent/guardian/pupil when a teacher releases marks |
| **New message from staff** | Parent/guardian |
| **A family has replied** | The teacher who opened the thread |
| **Homework and class materials set** | Parent/guardian and pupil |
| **Daily summary** | Parent/guardian — one email at the end of a day rather than several |

**Fees are not emailed.** There is deliberately no automatic "your fees are due"
message, because the school has not decided its reminder policy. Invoices are
visible to parents in the portal, and the bursar works from the invoices and
reconciliation screens. An automatic fee reminder is a small piece of work once
the school decides how often it should go and what it should say (see Part 5).

- **Per-category preferences** at `/account/notifications` — a parent can switch off notifications they do not want. The screen only offers the categories that can actually reach the person reading it (a teacher is not shown "absence alerts").
- **One-click unsubscribe** that satisfies the bulk-mail rules — and works.
- **Retries with backoff** (six attempts over about seventeen hours) for temporary failures; permanent failures (a wrong address, a rejected sender) go straight to the dead-letter list rather than being retried and damaging the school's mail reputation.
- **The outbox screen** shows queued depth, failures and the last error per message, with a retry button. With plain email there is no bounce webhook, so this screen is the school's visibility into mail that did not arrive.

## 2.12 Compliance, data protection and the audit trail

- **Privacy Policy, Terms of Service and Data Retention Policy** are published inside the portal and are consistent with what the software actually does — including where it does *not* yet do something.
- **A stated retention schedule in force and enforced automatically** (table below), with a nightly purge that the school can see and run manually.
- **Right to erasure** implemented as a real procedure: preview everything that would be removed for a named person, record the reason, carry it out, and keep a log that an erasure happened without keeping the erased data.
- **Append-only activity log with a tamper-evident hash chain** and a verify button.
- **Personal data encrypted at rest** in the database, with blind indexes so the data can still be searched without being readable by someone with only database access.
- Users can **export their own data**.

| Category | Kept for |
| --- | --- |
| Pupil academic records (marks, attendance, exams) | 5 years after graduation or withdrawal |
| Fee invoices and payments | 7 years |
| Staff accounts | Employment + 2 years |
| Pupil and parent accounts | Enrolment + 5 years |
| Messages | 3 years after the academic year ends |
| Notification emails | 90 days |
| Activity log | 7 years |
| Sessions | 30 days after expiry |
| Password reset / invitation links | 1 hour / 7 days to use; record cleared after 30 days |
| Imported roster files | 30 days |

## 2.13 The go-live readiness screen

`/admin/reports` runs the launch checklist **as software** rather than as a document, and shows the school a green/amber/red result with a "where to fix it" link on every line. It is the gate for switching the real domain on.

**Blocking — must be green before real pupils use it:**

| Check | Why it blocks |
| --- | --- |
| School name set | Otherwise every email, report card and page header says "School Portal" |
| **Data Protection Officer email set** | The privacy and retention pages tell people to contact the DPO; with no address, those rights cannot be exercised |
| Email sending configured | Without it, no invitation or password reset is ever delivered |
| A recent backup exists | A school's records are irreplaceable |
| Backups are copied off this machine | The failure that destroys the database would destroy its only copy too |
| Production secret set | Otherwise encryption keys are the ones published in the source code |
| No demo accounts | The demo password is published |
| A current academic year and its terms | Nothing to hang enrolments or reports on |
| Pupils on the roll | There is no portal without a roster |

**Worth fixing — will not stop the school working, but somebody will notice:**

| Check |
| --- |
| Impact assessment (DPIA) recorded |
| General contact address set |
| Staff two-factor coverage below 100% |
| A two-factor grace window still open |
| Only one administrator account |
| Grading scale not configured |
| Pupils not in any class / classes with no pupils |
| Pupils with no verified guardian |
| Restore never tested |
| Retention purge not running |
| Online payments configured, live keys, supported currency |
| Emailed links pointing at the right address |

Alongside it is the **reconciliation report**: head-counts per class, pupils with no guardian, pupils with no class, parents with no child linked, and pending guardian links — the list the office works down before it retires the old spreadsheet.

---

# Part 3 — What runs underneath

## 3.1 How it is put together

- **One address for everything.** The website and the portal sit behind a single school web address: the website at the top level, the portal at `/portal`. One certificate, one login, and the portal's session cookie stays first-party (which is what makes it secure).
- **The portal is not reachable from the internet except through the website** — the API and app processes are internal only.
- **Database:** PostgreSQL with row-level security; 49 tables; 21 tracked schema migrations.
- **Email:** any standard SMTP provider (Microsoft 365, Google Workspace, Postmark, Amazon SES, Resend, Mailgun, SendGrid, or the school's own server).
- **Payments:** Paystack.
- **Files** (homework attachments, class materials) are stored outside the web root and served only through an access-checked endpoint, with a document-only file-type allowlist and a 25 MB limit. An executable file is refused outright.

## 3.2 Security built in

| Protection | What it means in practice |
| --- | --- |
| Role-based permissions | A person can only reach what their role allows |
| Row-level security in the database | Even a coding mistake cannot serve one family another family's data |
| Two-factor authentication | Required for staff; admins are never exempt |
| Encrypted personal data at rest | Names, contact details and similar fields are unreadable to someone with only database access |
| Encrypted backups | Every backup is AES-256 encrypted before it leaves the machine |
| CSRF protection | A form submitted from another website cannot act as a signed-in user |
| Rate limiting | Every password prompt and public form |
| Content Security Policy | Blocks injected scripts on the public site and the portal |
| Security headers + HTTPS/HSTS | Standard hardening on every response |
| Tamper-evident activity log | Any altered record is detectable |
| Idempotency keys | A retried payment, register or import cannot be applied twice |
| Health endpoint | One address that reports database, mail, outbox and backup state |

## 3.3 Backups and recovery

- **Nightly encrypted backup** of the database, plus a separate encrypted archive of the website's own content (news posts, library catalogue, gallery, uploads) — so the site content survives too, not just the database.
- **Copied off the machine** to cloud storage (Cloudflare R2, Amazon S3 or Backblaze B2).
- **35-day retention**, pruned automatically.
- **A restore is tested every week** into a throwaway database. An untested backup is an assumption, not a backup.
- **Recovery targets:** no more than 24 hours of data loss; about 2 hours to restore. If 24 hours is too much, the school can switch on point-in-time recovery — that is a paid hosting option (see Part 4).
- **Silent failure is visible:** if backups stop, the health check warns within a day rather than everyone assuming they are fine.

## 3.4 Testing and automated checks

Every change is checked automatically before it can be released:

| Check | Result today |
| --- | --- |
| Portal API test suite | **300 tests, all passing** |
| Web browser-level checks through the public address | **108 checks, all passing** |
| Marketing site route, header and copy checks | Passing |
| Database migrations, applied twice on real PostgreSQL | Passing |
| Backup + restore drill in a clean environment | Passing |
| Container images build, boot and refuse unsafe defaults | Passing |
| Dependency security audit | 0 known vulnerabilities in the portal; 6 advisories in the website's build tooling with no fix published (`npm audit` output is reported loudly rather than hidden) |
| Load test | Passing |

The suite also **pins the school's own wording**: if a page ever again carries the misspelled address, the old city, or the wrong reply promise, the build fails.

---

# Part 4 — What we need from the school

This is the answer to "what is needed to be fully ready". It is grouped by kind, and each line says who can do it and whether it blocks launch.

## A. Decisions only the school can make

| # | Decision | Options / what we need | Blocks launch? |
| --- | --- | --- | --- |
| A1 | **The school's web address** | The domain to use, e.g. `bodijainternationalcollege.com` (and `.ng` if wanted). If it is not yet registered, we need the school to buy it, or authority to | **Yes** |
| A2 | **Who owns the hosting bill and the logins** | One named person holds the hosting, domain, email and cloud-storage accounts. These must be in the school's name, not an individual's | **Yes** |
| A3 | **Email for the school** | Currently the website publishes a **personal Gmail address** (`bicbis95@gmail.com`). Decide the proper address (`info@`, `admissions@`, `office@`) and whether the school uses Microsoft 365, Google Workspace, or a mail provider | **Yes** |
| A4 | **Online fee payment — on or off** | Paystack requires a business account and settlement bank account. If the school will only take cash and transfers, we switch it off and the readiness screen stops asking | No (but decide before launch) |
| A5 | **Microsoft / Google sign-in for staff — on or off** | Supported and ready. Requires an app registration in the school's tenant with us as redirect. Only useful if staff have Microsoft or Google accounts | No |
| A6 | **Two-factor for staff: enforce from day one, or a grace window?** | Recommended: a dated grace window (e.g. 3 weeks) while the rollout happens, closing itself | No |
| A7 | **Whether to publish an Admissions page** | There is currently **no admissions page** (no requirements, deadlines or how-to-apply), **no term dates**, **no fee/levy page**, **no staff directory**, **no policies page** (safeguarding, anti-bullying, uniform), **no FAQ**. These are content the school must decide whether to publish (see B3) | No |
| A8 | **Analytics — on or off, and which** | There is currently **no analytics of any kind**, so the school cannot see enquiry volumes or popular pages. Needs a decision and an account | No |

## B. Content we need

| # | What | Status today | Who supplies it |
| --- | --- | --- | --- |
| B1 | **News posts** | **The Updates page is empty — zero articles.** The page and the staff publishing panel are finished and working; there is simply nothing published | School |
| B2 | **Digital Library resources** | **Zero PDFs uploaded.** The library, search, filters and in-page reader are finished; the catalogue is empty | School (curriculum lead) |
| B3 | **The missing pages listed in A7** | Not written | School |
| B4 | **The Chairman's message on the home page** | **The text currently on the site is garbled** — one sentence reads *"…through careful selection of subjects in the Child Protection Unit, but the creativity in you is what defines your future."* It reads as a paragraph that was edited and lost its meaning. We need the final wording | School |
| B5 | **Photo gallery** | ✅ Already loaded — 7 albums, 121 photos. The school should review them and confirm which are appropriate to publish | School (light touch) |
| B6 | **Photographs of staff, facilities and pupils** | Some are in place. Any additional photos needed for the pages in B3. **Note:** published photographs of pupils require the school's own consent process | School |
| B7 | **The official school logo** | In place, but used as the browser tab icon at full size (see C7/H3) | School (high-resolution original if it exists) |
| B8 | **Policies the site should publish** | Safeguarding / child protection, anti-bullying, uniform, attendance — these are normal and expected on a school website | School + board |

## C. Accounts, credentials and access

| # | What | Notes | Blocks launch? |
| --- | --- | --- | --- |
| C1 | **Domain + DNS access** | We need to point the address at the hosting, and add the mail records (SPF, DKIM, DMARC) below | **Yes** |
| C2 | **Hosting** | A small server is enough (2 vCPU / 4 GB) or a managed platform. Someone must own the account and the card | **Yes** |
| C3 | **Mail sending (SMTP)** | Either the school's existing mail account with SMTP enabled, or a sending service. **The exact DNS records must be published**, or every password reset and absence alert lands in parents' spam — which parents will read as "the portal is broken" | **Yes** |
| C4 | **Cloud storage for backups** | A bucket on Cloudflare R2, Amazon S3 or Backblaze B2, with its keys | **Yes** |
| C5 | **Backup encryption key custody** | A long random key generated once. **Losing it means losing every backup.** It must be stored in the school's password manager, separately from the backups themselves | **Yes** |
| C6 | **Paystack live keys + verified settlement account** | Only if A4 is "on". A test key takes a payment and moves no money — the readiness screen fails on a test key in production | If payments on |
| C7 | **Google Search Console / analytics account** | Only if A8 is "on". For Search Console the school must be able to verify ownership of the domain | No |
| C8 | **A password manager for the school** | Needed for C5 and for the day-to-day operator credentials. Free options are adequate | **Yes (recommended)** |

## D. Data we need (the roster)

| # | File | Columns | Notes |
| --- | --- | --- | --- |
| D1 | **Pupils** | email, display name, admission number, grade level | Leave the password column **blank** — each pupil is emailed a link to set their own |
| D2 | **Staff** | email, display name, role | Roles: teacher, teaching assistant, registrar, school administrator, counselor |
| D3 | **Classes** | course code, course title, class name, term | |
| D4 | **Enrolments** | pupil admission number, course code, class name, term | Which pupil is in which class |
| D5 | **Parents & guardian links** | pupil admission number, parent email, relationship, parent name | Parent accounts are created automatically; the link needs verifying |
| D6 | **Fee structure for the current term** | Fee name, amount, which year groups, due date | Needed for invoices |
| D7 | **Grading scale** | The school's bands — letter, minimum percentage, points — and exam vs coursework weighting | Without it, report cards show raw percentages with no letter grades |
| D8 | **Timetable** | The bell schedule (period times and breaks) and which subject/teacher is in each slot | |
| D9 | **Transport** | Routes, stops and which pupils ride which route | Only if the school runs buses |
| D10 | **Academic calendar** | The current academic year and its terms, with dates | |

**The import runs as a dry run first** and reports every problem row before anything is written. A corrected file can simply be uploaded again.

## E. Legal and compliance

| # | What | Why |
| --- | --- | --- |
| E1 | **A lawyer's review of the three legal documents** | The Privacy Policy, Terms of Service and Data Retention Policy are written, published in the portal, and consistent with what the software does. They are **templates and must be reviewed for the school's circumstances** before the school relies on them |
| E2 | **Name a Data Protection Officer, and give us the email address** | The privacy and retention pages tell people to contact the DPO. **The launch gate blocks until this address exists**, because until then those pages describe rights nobody can exercise |
| E3 | **A data protection impact assessment (DPIA)** | Processing a whole school's pupil records normally requires one. Record the reference number and date and it will be shown on the legal pages |
| E4 | **The pupil-photography consent process** | The site publishes 121 school photographs. The school must be satisfied its own consent records cover them |
| E5 | **Under-13 / age data** | The portal currently holds **no date of birth and no guardian-consent record**, so it cannot identify under-13s. The legal pages say so plainly rather than pretending otherwise. If the school wants a consent gate for younger pupils, that is a change to request |
| E6 | **A refund policy for fees** | The Terms of Service mention refunds; there is **no refund flow in the software**. Decide the policy and how refunds will be handled (most schools do it at the bursary) |
| E7 | **Approval of the public Privacy Notice** | The website's own notice (`/privacy.html`) is drafted; it should be reviewed alongside E1 |

## F. People and process

| # | What | Why it matters |
| --- | --- | --- |
| F1 | **A named first-line support person at the school** | Someone the office and teachers call first. Already-technical questions reach them, not the developers |
| F2 | **A named data/office owner** | The person who runs the roster imports, fixes guardian links and works the reconciliation report |
| F3 | **Someone who holds the operator credentials** | With C5 and C8 — and a deputy, so the school is never locked out by one person's phone |
| F4 | **A training plan** | Teachers need a short session (taking the register, the offline register, entering marks, homework) and the office needs one (students, guardians, fees, imports, readiness). We can supply a one-page cheat sheet per role |
| F5 | **An escalation contact** | Who is called if the site is down at 8am on Monday, and who is allowed to approve a restore |
| F6 | **A cut-over and rollback decision** | When the school stops using its old spreadsheet. The reconciliation report must be clean first |
| F7 | **Sign-off on the readiness screen** | The launch gate must be green — it already blocks on the missing DPO address, an open two-factor grace window, failed backups and demo accounts |

## G. Corrections and confirmations we need from the school

These are places where the site currently **contradicts itself** or where published details need a ruling. Each one is a real visitor-facing inconsistency, not a technical nicety.

| # | What we found | What we need |
| --- | --- | --- |
| G1 | **Two different phone numbers.** The main site publishes **+234 816 606 1632**; the BIMA/BIFA academies page publishes **0803 086 1619** | Confirm whether the academies genuinely have a separate line, or whether one is out of date |
| G2 | **Two different email addresses.** The main site and footer publish **bicbis95@gmail.com** (a personal Gmail); the academies page publishes **bimacad2024@gmail.com** | Confirm both, and see A3 about replacing the Gmail with a school address |
| G3 | **A bank account number is published on the academies page** — GTBank, "Bodija International College", account 0028908200 | **Confirm this account is still correct and still belongs to the school.** A wrong account number on a public page is how fees get paid to a stranger |
| G4 | **Social media links** — facebook.com/bicbisbodija, instagram.com/bic_bis, x.com/bic_bis | Confirm all three are still active and correct |
| G5 | **Opening hours** — currently "Mon–Fri, 08:00 – 16:00" | Confirm |
| G6 | **The map location** | Updated to the correct address; please confirm it points at the right place |
| G7 | **BIMA/BIFA session dates** — currently "April 2 – 19" each year, which now rolls forward automatically | Confirm that window is still the school's annual pattern |
| G8 | **The reply promise** — "We reply within 2–3 business days", now used on every form | Confirm this is the promise the school can keep |
| G9 | **The three programme tracks** (Science & Technology, Arts & Creative Inquiry, Business & Commerce) | Confirm the names and descriptions are current |
| G10 | **Fees shown on the academies page** | Confirm the amounts are current |
| G11 | **The school motto "Success through Labor"** and the wordmark "Bodija Int'l College" | Confirm both renderings are correct |

## H. Optional — recommended before the school is fully proud of it

None of these stop the portal working. They are the difference between "the site is live" and "the site is finished".

| # | Item | Why it matters |
| --- | --- | --- |
| H1 | **SEO** — sitemap, Open Graph/Twitter cards, structured data, canonical URLs | Today there is **no sitemap, no social preview card and no structured data**, so a Google search or a WhatsApp share of the school's address shows a bare link instead of a title, description and image. The school's name, address, phone and programmes are invisible to Google's rich results |
| H2 | **Analytics** | See A8 |
| H3 | **Page weight on Nigerian mobile data** | The homepage hero video is ~6.9 MB with a 1.6 MB poster — about 8.5 MB before the page is useful, on a phone, on metered data. The gallery is ~18 MB of unresized photographs. Recommended: lighter/shorter hero media from the school, image resizing on upload, and modern image formats |
| H4 | **Accessibility audit** | No formal WCAG audit has been run, and several pages have no "skip to content" link. A public school site should have one written down |
| H5 | **Host hardening** | Firewall, SSH keys only, fail2ban, unattended security updates, container memory limits and log rotation. Currently the machine this runs on has none of that configured, and unbounded logs can fill the disk and take the site down |
| H6 | **Monitoring and alerting** | There is a health address and it reports real problems, but nobody is paged when it goes red. Recommended: a free uptime monitor on the health address, alerting to a named person |
| H7 | **SMS / WhatsApp alerts** | Not built. In this market, absence and fee reminders often need SMS or WhatsApp rather than email. This is a real project, not a setting — but a "copy this message" or click-to-WhatsApp share from the admin screens would cover most of the need quickly |
| H8 | **Staging environment and deploy automation** | Today "deploy" means updating the live machine. A staging copy and a rollback procedure are recommended before the school depends on this daily |
| H9 | **Point-in-time recovery** | Nightly backups mean up to 24 hours of lost marks or payments. A managed database with PITR reduces that to minutes, at a cost |
| H10 | **End-user guides** | There is engineering documentation but no teacher-facing or office-facing manual yet |

---

# Part 5 — What is deliberately not built

So that nothing on this list is a surprise:

| Not built | Status |
| --- | --- |
| SMS and WhatsApp notifications | Not built (H7) |
| Web push notifications to phones | Removed on purpose. A half-built version that reported "sent" for notifications nobody received was deleted rather than left in |
| Admissions / term dates / fees / policies / FAQ / site search pages | Content does not exist yet (A7, B3) |
| Passkey (WebAuthn) sign-in | Not built; authenticator-app two-factor is |
| Live in-page updates (no refresh needed) | Not built; the portal refreshes and sends a daily summary instead |
| A student-messaging channel (pupil ↔ teacher) | Not built. Messages are staff ↔ family; pupils can read about themselves but the channel is not theirs |
| Refund flow for fees | Not built (E6) |
| Automatic fee-due reminder emails | Not built — the policy has not been decided yet |
| Server-rendered PDF files | Not built by design — the browser's print / Save-as-PDF produces the report card and receipts, which avoids adding a PDF service to maintain |
| Under-13 consent gate | Not built (E5) |
| Native mobile apps | Not built. The portal is a mobile web app and installs to a phone's home screen with an app icon and works offline for the register |

---

# Part 6 — Suggested order of work

**Stage 1 — the school decides (no technical work needed)**
A1–A8, G1–G11. Most of these are questions, and they unblock everything else.

**Stage 2 — the school obtains (days to weeks, depending on providers)**
Domain (C1), hosting (C2), mail sending with DNS records (C3), backup storage (C4), the backup key in a password manager (C5), Paystack if wanted (C6).

**Stage 3 — legal and people (runs in parallel)**
Lawyer review (E1), DPO named and address supplied (E2), DPIA recorded (E3), support and data owners named (F1–F3), training scheduled (F4).

**Stage 4 — data and content (the biggest single effort)**
Roster CSVs (D1–D6), grading scale (D7), timetable (D8), calendar (D10) — then news posts (B1) and library resources (B2), which are never "finished" and can start small.

**Stage 5 — build and rehearse**
Deploy to the real hosting, import the roster as a dry run, walk the go-live readiness screen, take and restore a test backup, and check the outbox for bounced mail.

**Stage 6 — cut over**
Only with the readiness screen green and reconciliation clean. Flip the domain, retrain staff, and stop using the old spreadsheet from a named date.

## The short version — blocking items, one page

| | Item | Owner |
| --- | --- | --- |
| 1 | Web address (domain) | School leadership |
| 2 | Hosting account, in the school's name | School leadership |
| 3 | School email address (replace the personal Gmail) | School leadership |
| 4 | Mail sending account + SPF/DKIM/DMARC records published | IT / mail provider |
| 5 | Backup storage bucket + keys | IT |
| 6 | Backup encryption key, stored in a password manager | School leadership |
| 7 | Data Protection Officer named + email address | School leadership |
| 8 | Lawyer's review of the three legal documents | School leadership |
| 9 | The roster — pupils, staff, classes, enrolments, parents | Office / registrar |
| 10 | The current academic year and its terms | Office |
| 11 | Grading scale | Academic lead |
| 12 | Fee structure for the current term | Bursar |
| 13 | A named support person and a data owner | School leadership |
| 14 | Confirmation of the address, phones, emails and bank account (G1–G11) | School leadership |
| 15 | Sign-off on the readiness screen | School leadership |
| 16 | Paystack live keys — only if taking card payments | Bursar |

*Everything else in Part 4 is recommended rather than required, and is marked as such.*
