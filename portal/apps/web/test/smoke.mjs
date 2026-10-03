import { createHmac } from "node:crypto";

// INTEGRATION: the portal is served under basePath /portal, so every path in
// this suite needs that prefix. Overridable so the suite can also be run
// through the main site's proxy: SMOKE_WEB=http://127.0.0.1:4040/portal
const WEB = process.env.SMOKE_WEB ?? "http://127.0.0.1:3000/portal";
/** Next emits ABSOLUTE Location headers and hrefs that include basePath, so
 *  every expected redirect target has to carry it too. Derived from WEB so
 *  the suite passes against a bare :3000 or through the site's proxy. */
const BASE = new URL(WEB).pathname.replace(/\/$/, "");
const P = (path) => BASE + path;
const { totpCode } = await import("../../api/dist/crypto/totp.js");
const { startMockPaystack } = await import("../../api/test/mock-paystack.mjs");

// must match the API server's PAYSTACK_SECRET (see run instructions)
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET ?? "sk_test_dev_secret";
const hmacSha512 = (body) => createHmac("sha512", PAYSTACK_SECRET).update(body).digest("hex");

// Paystack Initialize mock — the API server must run with
// PAYSTACK_API_BASE=http://127.0.0.1:9311 (see apps/api/loadtest/README or run docs)
const paystackMock = await startMockPaystack(9311);
process.on("exit", () => paystackMock.close());

function jar() { const m = new Map(); return {
  header: () => [...m].map(([k,v]) => `${k}=${v}`).join("; "),
  feed(setCookies = []) { for (const sc of setCookies) { const [kv] = sc.split(";"); const i = kv.indexOf("="); m.set(kv.slice(0,i), kv.slice(i+1)); } },
  get: (n) => m.get(n),
};}

async function call(j, path, opts = {}) {
  const headers = { ...(opts.headers||{}) };
  if (j.header()) headers.cookie = j.header();
  if (opts.body) headers["content-type"] = "application/json";
  const csrf = j.get("csrf"); if (csrf) headers["x-csrf"] = csrf;
  const res = await fetch(WEB + path, { ...opts, headers, redirect: "manual" });
  j.feed(res.headers.getSetCookie?.() ?? []);
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  const hdrs = {}; for (const [k, v] of res.headers) hdrs[k] = v;
  return { status: res.status, body, location: res.headers.get("location"), headers: hdrs };
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? (pass++, console.log("PASS", name)) : (fail++, console.log("FAIL", name, extra)); };

// 1. anon root redirects to /login
const j0 = jar();
const root = await call(j0, "", {});
ok("GET / anon -> 307 /login", root.status === 307 && root.location === P("/login"), `${root.status} ${root.location}`);
const loginPage = await call(j0, "/login", {});
ok("GET /login renders with school identity", loginPage.status === 200 && String(loginPage.body).includes("School Portal"), `status ${loginPage.status}`);
// phase 6: the demo-seed hint card is gone from the login page
ok("GET /login shows NO demo seeds card", !String(loginPage.body).includes("Demo seeds"));
// phase 6: guardian verification landing page exists and gates anon visitors
const verifyAnon = await call(j0, "/parent/verify?token=abc", {});
ok("GET /parent/verify anon -> /login", verifyAnon.status === 307 && verifyAnon.location?.startsWith(P("/login")), `${verifyAnon.status} ${verifyAnon.location}`);

// 2. teacher login through BFF
const jt = jar();
const login = await call(jt, "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "t1@school.example", password: "Passw0rd!" }) });
ok("teacher login via BFF", login.status === 201 && login.body.mfaRequired === true && jt.get("sid"), JSON.stringify(login.body));

// 3. teacher gated until MFA: /teacher must redirect to /mfa
const gated = await call(jt, "/teacher", {});
ok("teacher gated -> /mfa", gated.status === 307 && gated.location === P("/mfa"), `${gated.status} ${gated.location}`);

// 4. enroll + verify TOTP (controlled flow: admin-issued token, dev endpoint)
const devTok = await call(jt, "/api/v1/health/dev-enroll-tokens", {});
ok("dev enroll tokens available (SEED_DEMO)", devTok.status === 200 && !!devTok.body.tokens?.["t1@school.example"], `status ${devTok.status}`);
const noTok = await call(jt, "/api/v1/auth/mfa/totp/enroll", { method: "POST" });
ok("enroll WITHOUT token refused", noTok.status === 403 && noTok.body.code === "enroll_token_required", JSON.stringify(noTok.body).slice(0,100));
const enroll = await call(jt, "/api/v1/auth/mfa/totp/enroll", { method: "POST", body: JSON.stringify({ token: devTok.body.tokens["t1@school.example"] }) });
ok("totp enroll (with token)", enroll.status === 201 && !!enroll.body.secret, JSON.stringify(enroll.body).slice(0,80));
const code = totpCode(enroll.body.secret);
const verify = await call(jt, "/api/v1/auth/mfa/totp/verify", { method: "POST", body: JSON.stringify({ code }) });
ok("totp verify", verify.status === 201 && verify.body.mfaVerified === true, JSON.stringify(verify.body));
const totpReplay = await call(jt, "/api/v1/auth/mfa/totp/verify", { method: "POST", body: JSON.stringify({ code }) });
ok("totp REPLAY refused", totpReplay.status === 401 && totpReplay.body.code === "totp_replayed", JSON.stringify(totpReplay.body).slice(0,100));

// 5. teacher pages
const teacherHome = await call(jt, "/teacher", {});
ok("GET /teacher shows section", teacherHome.status === 200 && String(teacherHome.body).includes("MTH-101 A"), `status ${teacherHome.status}`);
const sectionId = teacherHome.body.match(/attendance\/([0-9a-f-]{36})/)?.[1];
ok("section link found", !!sectionId, String(teacherHome.body).slice(0,200));
const date = new Date().toISOString().slice(0,10);
const attPage = await call(jt, `/teacher/attendance/${sectionId}?date=${date}`, {});
ok("attendance register renders roster", attPage.status === 200 && String(attPage.body).includes("Sola Student"), `status ${attPage.status}`);
const gbPage = await call(jt, `/teacher/gradebook/${sectionId}`, {});
ok("gradebook renders", gbPage.status === 200 && String(gbPage.body).includes("Record a grade"));

// 6. mutating call through BFF needs x-csrf + idempotency key: save attendance
const roster = await call(jt, `/api/v1/sections/${sectionId}/roster`, {});
const recs = roster.body.data.map((s) => ({ student_user_id: s.studentUserId, status: "present" }));
const saveKey = crypto.randomUUID();
const save = await call(jt, `/api/v1/sections/${sectionId}/attendance`, { method: "POST", headers: { "idempotency-key": saveKey }, body: JSON.stringify({ date, records: recs }) });
ok("attendance save via BFF", save.status === 201 && save.body.written === recs.length, JSON.stringify(save.body).slice(0,120));
const replay = await call(jt, `/api/v1/sections/${sectionId}/attendance`, { method: "POST", headers: { "idempotency-key": saveKey }, body: JSON.stringify({ date, records: recs }) });
ok("idempotent replay same result", replay.status === 201 && replay.body.written === recs.length);
const noKey = await call(jt, `/api/v1/sections/${sectionId}/attendance`, { method: "POST", body: JSON.stringify({ date, records: recs }) });
ok("missing idempotency key 400", noKey.status === 400, `status ${noKey.status}`);

// 7. student + parent + admin
const js = jar();
await call(js, "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "s1@school.example", password: "Passw0rd!" }) });
const stuRoot = await call(js, "", {});
ok("student / -> /student", stuRoot.status === 307 && stuRoot.location === P("/student"), `${stuRoot.status} ${stuRoot.location}`);
const stuPage = await call(js, "/student", {});
ok("student dashboard (no MFA gate)", stuPage.status === 200 && String(stuPage.body).includes("Latest released grades"));
const stuBlocked = await call(js, "/admin", {});
ok("student /admin bounced", stuBlocked.status === 307 && stuBlocked.location === P("/student"), `${stuBlocked.status} ${stuBlocked.location}`);

const jp = jar();
await call(jp, "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "p1@school.example", password: "Passw0rd!" }) });
const parPage = await call(jp, "/parent", {});
const childHref = String(parPage.body).match(new RegExp(`href="${BASE}/parent/([0-9a-f-]{36})"`))?.[1];
ok("parent sees child card", parPage.status === 200 && !!childHref, `status ${parPage.status}`);
const childPage = await call(jp, `/parent/${childHref}`, {});
ok("parent child page renders", childPage.status === 200 && String(childPage.body).includes("STU-0001"), `status ${childPage.status}`);
const parMut = await call(jp, `/api/v1/sections/${sectionId}/attendance`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ date, records: recs }) });
ok("parent mutation refused", parMut.status === 403 && parMut.body.code === "parent_read_only", JSON.stringify(parMut.body).slice(0,100));

const ja = jar();
await call(ja, "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@school.example", password: "Passw0rd!" }) });
const enA = await call(ja, "/api/v1/auth/mfa/totp/enroll", { method: "POST", body: JSON.stringify({ token: devTok.body.tokens["admin@school.example"] }) });
await call(ja, "/api/v1/auth/mfa/totp/verify", { method: "POST", body: JSON.stringify({ code: totpCode(enA.body.secret) }) });
const adminPage = await call(ja, "/admin", {});
ok("admin console renders", adminPage.status === 200 && String(adminPage.body).includes("User directory"), `status ${adminPage.status}`);
const usersPage = await call(ja, "/admin/users", {});
ok("admin users table", usersPage.status === 200 && String(usersPage.body).includes("admin@school.example"), `status ${usersPage.status}`);

/* ── Phase 5.3 surfaces ── */

// login page advertises SSO
ok("login offers SSO", String(loginPage.body).includes("auth/sso/google/start") && String(loginPage.body).includes("auth/sso/entra/start"));

// teacher messaging through the BFF
const tmsgPage = await call(jt, "/teacher/messages", {});
ok("teacher messages page renders", tmsgPage.status === 200 && String(tmsgPage.body).includes("New thread with a parent"), `status ${tmsgPage.status}`);
const rosterForThread = await call(jt, `/api/v1/sections/${sectionId}/roster`, {});
const threadStudent = rosterForThread.body.data[0].studentUserId;
const thread = await call(jt, "/api/v1/threads", { method: "POST", body: JSON.stringify({ student_user_id: threadStudent, subject: "Smoke thread" }) });
ok("thread created via BFF", thread.status === 201 && !!thread.body.id, JSON.stringify(thread.body).slice(0, 100));
const postMsg = await call(jt, `/api/v1/threads/${thread.body.id}/messages`, { method: "POST", body: JSON.stringify({ body_text: "Hello from smoke" }) });
ok("message posted via BFF", postMsg.status === 201 && postMsg.body.senderName === "Tayo Teacher", JSON.stringify(postMsg.body).slice(0, 100));
const threadPage = await call(jt, `/teacher/messages/${thread.body.id}`, {});
ok("teacher thread view renders", threadPage.status === 200 && String(threadPage.body).includes("Smoke thread"), `status ${threadPage.status}`);

// parent sees the thread read-only
const pmsgPage = await call(jp, "/parent/messages", {});
ok("parent messages inbox shows thread", pmsgPage.status === 200 && String(pmsgPage.body).includes("Smoke thread"), `status ${pmsgPage.status}`);
const pthreadPage = await call(jp, `/parent/messages/${thread.body.id}`, {});
ok("parent thread read-only banner", pthreadPage.status === 200 && String(pthreadPage.body).includes("Read-only view") && String(pthreadPage.body).includes("Hello from smoke"), `status ${pthreadPage.status}`);

// parent notification inbox (message_received)
const pInbox = await call(jp, "/api/v1/notifications", {});
ok("parent got message notification", pInbox.status === 200 && pInbox.body.data.some((n) => n.kind === "message_received"), `status ${pInbox.status}`);

// admin creates a user through the BFF
const newUser = await call(ja, "/api/v1/users", { method: "POST", body: JSON.stringify({ email: `smoke${Date.now()}@school.example`, display_name: "Smoke User", password: "Passw0rd!Policy1", roles: ["student"], grade_level: 10 }) });
ok("admin creates user via BFF", newUser.status === 201 && !!newUser.body.id, JSON.stringify(newUser.body).slice(0, 100));
const usersPage2 = await call(ja, "/admin/users", {});
ok("new user in directory page", usersPage2.status === 200 && String(usersPage2.body).includes("Smoke User"), `status ${usersPage2.status}`);

// admin sections page has create + enroll forms
const secPage = await call(ja, "/admin/sections", {});
ok("sections admin forms render", secPage.status === 200 && String(secPage.body).includes("Create section") && String(secPage.body).includes("Enroll a student"), `status ${secPage.status}`);

/* ── Phase 5.4 surfaces ── */

// resolve a term id (needed to create an invoice)
const termsRes = await call(ja, "/api/v1/terms", {});
const TERM_ID = termsRes.body?.data?.[0]?.id;
ok("terms endpoint reachable", !!TERM_ID, JSON.stringify(termsRes.body).slice(0, 120));

// fees: admin ledger + create invoice; family reads; student dashboard shows it
const feesPage = await call(ja, "/admin/fees", {});
ok("admin fees page renders", feesPage.status === 200 && String(feesPage.body).includes("New invoice") && String(feesPage.body).includes("First Term Tuition"), `status ${feesPage.status}`);
const newInv = await call(ja, "/api/v1/fees/invoices", { method: "POST", body: JSON.stringify({ student_user_id: threadStudent, term_id: TERM_ID, label: `Smoke Levy ${Date.now()}`, amount_kobo: 250000 }) });
ok("admin creates invoice via BFF", newInv.status === 201 && newInv.body.amountKobo === 250000, JSON.stringify(newInv.body).slice(0, 120));
const stuFees = await call(js, "/api/v1/fees/my", {});
ok("student reads own ledger", stuFees.status === 200 && stuFees.body.data.invoices.some((i) => i.id === newInv.body.id), `status ${stuFees.status}`);

// fees: initiate + Paystack webhook completes the loop (HMAC-SHA512)
const initPay = await call(ja, `/api/v1/fees/invoices/${newInv.body.id}/initiate`, { method: "POST" });
ok("payment initiated (real Initialize call)", initPay.status === 201 && !!initPay.body.reference
  && String(initPay.body.checkout_url).startsWith("https://checkout.mock-paystack.test/pay/")
  && !!initPay.body.access_code, JSON.stringify(initPay.body).slice(0, 160));
const whBody = JSON.stringify({ event: "charge.success", data: { reference: initPay.body.reference, amount: 250000, currency: "NGN" } });
const whSig = hmacSha512(whBody);
const wh = await fetch(`${WEB}/api/v1/webhooks/paystack`, {
  method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": whSig }, body: whBody,
});
const whJson = await wh.json();
ok("paystack webhook applies payment", wh.status === 201 && whJson.applied === true, `${wh.status} ${JSON.stringify(whJson)}`);
const stuFees2 = await call(js, "/api/v1/fees/my", {});
ok("invoice marked paid after webhook", stuFees2.body.data.invoices.find((i) => i.id === newInv.body.id).status === "paid");

// exams: teacher schedules; student dashboard shows upcoming exams
const examDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const newExam = await call(jt, `/api/v1/sections/${sectionId}/exams`, { method: "POST", body: JSON.stringify({ title: `Smoke Exam ${Date.now()}`, exam_date: examDate, max_score: "100" }) });
ok("teacher schedules exam via BFF", newExam.status === 201 && !!newExam.body.id, JSON.stringify(newExam.body).slice(0, 120));
const stuDash = await call(js, "/student", {});
ok("student dashboard shows exams + transport", stuDash.status === 200 && String(stuDash.body).includes("Upcoming exams") && String(stuDash.body).includes("School transport"), `status ${stuDash.status}`);

// transport: admin page renders; parent child page shows assignment
const transportPage = await call(ja, "/admin/transport", {});
ok("admin transport page renders", transportPage.status === 200 && String(transportPage.body).includes("New route") && String(transportPage.body).includes("Route A"), `status ${transportPage.status}`);
const childPage2 = await call(jp, `/parent/${threadStudent}`, {});
ok("parent child page shows fees/exams/transport", childPage2.status === 200
  && String(childPage2.body).includes("Fees")
  && String(childPage2.body).includes("Upcoming exams")
  && String(childPage2.body).includes("Route A"), `status ${childPage2.status}`);

// ── production-hardening checks (2026-10-01 review) ─────────────────────────
const health = await call(jar(), "/api/v1/health", {});
ok("health endpoint (public)", health.status === 200 && health.body.status === "ok" && health.body.db === "up", JSON.stringify(health.body).slice(0, 120));

// forgot-password: always 202-style ok, never enumerates
const forgot = await call(jar(), "/api/v1/auth/password/forgot", { method: "POST", body: JSON.stringify({ email: "s1@school.example" }) });
ok("forgot-password accepted", forgot.status === 201 && forgot.body.ok === true, JSON.stringify(forgot.body).slice(0, 100));
const forgotNope = await call(jar(), "/api/v1/auth/password/forgot", { method: "POST", body: JSON.stringify({ email: "nobody@nowhere.example" }) });
ok("forgot-password no enumeration", forgotNope.status === 201 && forgotNope.body.ok === true, JSON.stringify(forgotNope.body).slice(0, 100));
const badReset = await call(jar(), "/api/v1/auth/password/reset", { method: "POST", body: JSON.stringify({ token: "x".repeat(24), password: "Str0ng!Passw0rd99" }) });
ok("reset with bogus token refused", badReset.status === 401 && badReset.body.code === "reset_token_invalid", JSON.stringify(badReset.body).slice(0, 100));

// invite flow: admin issues invite; invitee sets own password; then can log in
const invEmail = `invite${Date.now()}@school.example`;
const inv = await call(ja, "/api/v1/invites", { method: "POST", body: JSON.stringify({ email: invEmail, display_name: "Invited Teacher", roles: ["teacher"] }) });
ok("admin issues invite", inv.status === 201 && !!inv.body.inviteToken, JSON.stringify(inv.body).slice(0, 140));
const accept = await call(jar(), "/api/v1/auth/invite/accept", { method: "POST", body: JSON.stringify({ token: inv.body.inviteToken, password: "Invitee!Pass123" }) });
ok("invitee accepts + sets password", accept.status === 201 && accept.body.ok === true, JSON.stringify(accept.body).slice(0, 120));
const invLogin = await call(jar(), "/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: invEmail, password: "Invitee!Pass123" }) });
ok("invited user can log in", invLogin.status === 201 && invLogin.body.roles.includes("teacher"), JSON.stringify(invLogin.body).slice(0, 140));

// ── email preferences: the page every List-Unsubscribe header points at ──
// This 404'd. The header went out on every absence alert, grade notice,
// message notification and digest, and the URL it named did not exist.
const prefsPage = await call(jp, "/account/notifications", {});
ok("GET /account/notifications renders (was a 404)",
  prefsPage.status === 200 && String(prefsPage.body).includes("Email preferences"),
  `status ${prefsPage.status}`);
const prefsGet = await call(jp, "/api/v1/account/notifications", {});
// Named, not counted: phase 8 added `assignment_posted`, and a bare
// `length === 4` failed for the right reason (the API had one more category)
// while telling you nothing about which one was missing.
const PREF_KINDS = ["absence_recorded", "grade_released", "message_received", "assignment_posted", "daily_digest"];
ok("preferences list every opt-outable category",
  prefsGet.status === 200
    && PREF_KINDS.every((k) => prefsGet.body.data?.some((p) => p.kind === k))
    && prefsGet.body.data.every((p) => p.enabled),
  JSON.stringify(prefsGet.body).slice(0, 200));
const prefsPut = await call(jp, "/api/v1/account/notifications", { method: "PUT", body: JSON.stringify({ daily_digest: false }) });
ok("a parent may switch their own emails off (the one parent write)",
  prefsPut.status === 200 && prefsPut.body.data?.find((p) => p.kind === "daily_digest")?.enabled === false,
  JSON.stringify(prefsPut.body).slice(0, 160));

// one-click unsubscribe: no session, no CSRF token — exactly what Gmail sends
const unsubBad = await call(jar(), "/api/v1/notifications/unsubscribe?t=rubbish", { method: "POST" });
ok("one-click unsubscribe answers 2xx even for a bad token",
  unsubBad.status === 201 && unsubBad.body.unsubscribed === false,
  `${unsubBad.status} ${JSON.stringify(unsubBad.body).slice(0, 100)}`);

// ── payment return page: where Paystack now sends the payer back to ──
const payReturn = await call(jp, "/fees/return?reference=psk_nope", {});
ok("GET /fees/return renders for a signed-in payer",
  payReturn.status === 200 && String(payReturn.body).includes("Payment"),
  `status ${payReturn.status}`);


/* ══════════════════════════════════════════════════════════════════════════
   Phase 8 — the three gaps: timetable people can see, homework + files, and
   the offline shell. Everything here goes through the same origin the browser
   uses, because every one of these was reported as "the API exists but there
   is nothing to click".
   ══════════════════════════════════════════════════════════════════════════ */

/** Multipart upload with the viewer's cookies + CSRF, like the browser does. */
async function upload(j, filename, type, body) {
  const fd = new FormData();
  fd.set("file", new Blob([body], { type }), filename);
  const headers = { cookie: j.header() };
  const csrf = j.get("csrf");
  if (csrf) headers["x-csrf"] = csrf;
  const res = await fetch(`${WEB}/api/v1/files`, { method: "POST", headers, body: fd });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: Object.fromEntries(res.headers) };
}

// 1. the admin builds the week: bell schedule, then a lesson in it
const DOW = new Date().getDay();
const bells = await call(ja, `/api/v1/timetable/terms/${TERM_ID}/periods`, { method: "POST", body: JSON.stringify([
  { weekday: DOW, period_index: 1, starts_at: "08:00", ends_at: "08:45", label: "Period 1" },
  { weekday: DOW, period_index: 2, starts_at: "08:45", ends_at: "09:00", is_break: true, label: "Break" },
]) });
ok("admin saves the bell schedule", bells.status === 201 && bells.body.count === 2, JSON.stringify(bells.body).slice(0, 140));

const grid = await call(ja, `/api/v1/timetable/terms/${TERM_ID}`, {});
const slotPeriod = grid.body.periods?.find((x) => x.periodIndex === 1);
ok("term grid returns periods + sections + slots", grid.status === 200
  && !!slotPeriod && Array.isArray(grid.body.sections) && Array.isArray(grid.body.slots),
  JSON.stringify(grid.body).slice(0, 140));

const teacherList = await call(ja, "/api/v1/timetable/teachers", {});
const t1Id = teacherList.body?.find?.((t) => t.name === "Tayo Teacher")?.id;
ok("GET /timetable/teachers lists staff who can be timetabled", teacherList.status === 200 && !!t1Id, JSON.stringify(teacherList.body).slice(0, 140));

const placed = await call(ja, "/api/v1/timetable/slots", { method: "POST", body: JSON.stringify({
  period_id: slotPeriod.id, section_id: sectionId, teacher_user_id: t1Id, room: "Room 7" }) });
ok("admin places a lesson in the grid", placed.status === 201, JSON.stringify(placed.body).slice(0, 140));

const adminTt = await call(ja, "/admin/timetable", {});
ok("admin timetable page renders the lesson in the grid",
  adminTt.status === 200 && String(adminTt.body).includes("Room 7") && String(adminTt.body).includes("Bell schedule"),
  `status ${adminTt.status}`);

// the same lesson, seen by the people it concerns
const teacherTt = await call(jt, "/teacher/timetable", {});
ok("teacher timetable page renders (was API-only)", teacherTt.status === 200
  && String(teacherTt.body).includes("My timetable") && String(teacherTt.body).includes("Room 7"),
  `status ${teacherTt.status}`);

const studentTt = await call(js, "/student/timetable", {});
ok("pupil timetable page renders their week", studentTt.status === 200
  && String(studentTt.body).includes("My timetable") && String(studentTt.body).includes("Room 7"),
  `status ${studentTt.status}`);

const parentChild = await call(jp, `/parent/${threadStudent}`, {});
ok("parent child page shows today's lessons", parentChild.status === 200
  && String(parentChild.body).includes("Room 7") && String(parentChild.body).includes("Today — "),
  `status ${parentChild.status}`);

// and a pupil may not read somebody else's week
const otherWeek = await call(js, "/api/v1/timetable/students/00000000-0000-0000-0000-000000000001", {});
ok("pupil cannot read another pupil's week", otherWeek.status === 403, `${otherWeek.status}`);

// 2. homework + a shared file
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const up = await upload(jt, "worksheet.pdf", "application/pdf", pdf);
ok("teacher uploads a worksheet", up.status === 201 && up.body.filename === "worksheet.pdf" && up.body.bytes === pdf.length,
  JSON.stringify(up.body).slice(0, 160));

const badUp = await upload(jt, "payload.exe", "application/x-msdownload", Buffer.from("MZ"));
ok("a disallowed file type is refused", badUp.status === 400 || badUp.status === 415, `${badUp.status}`);

const hwTitle = `Smoke homework ${Date.now()}`;
const made = await call(jt, "/api/v1/assignments", { method: "POST", body: JSON.stringify({
  section_id: sectionId, title: hwTitle, instructions: "Questions 1–5.",
  due_at: new Date(Date.now() + 2 * 86400000).toISOString(), attachment_file_id: up.body.id }) });
ok("teacher sets homework with an attachment", made.status === 201 && made.body.attachmentFileId === up.body.id,
  JSON.stringify(made.body).slice(0, 160));

const stuWork = await call(js, "/api/v1/student/assignments", {});
ok("pupil sees the homework", stuWork.status === 200 && stuWork.body.data.some((a) => a.id === made.body.id),
  JSON.stringify(stuWork.body).slice(0, 140));

const dl = await call(js, `/api/v1/files/${up.body.id}`, {});
ok("pupil downloads the attachment", dl.status === 200, `${dl.status}`);

const dlAnon = await call(jar(), `/api/v1/files/${up.body.id}`, {});
ok("a stranger cannot download the attachment", dlAnon.status === 401 || dlAnon.status === 403, `${dlAnon.status}`);

const dlParent = await call(jp, `/api/v1/files/${up.body.id}`, {});
ok("guardian can download their child's worksheet", dlParent.status === 200, `${dlParent.status}`);

const handed = await call(js, `/api/v1/assignments/${made.body.id}/submissions`, { method: "POST",
  body: JSON.stringify({ body_text: "Finished all five." }) });
ok("pupil hands the work in", handed.status === 201 && handed.body.status === "submitted", JSON.stringify(handed.body).slice(0, 140));

const marks = await call(jt, `/api/v1/assignments/${made.body.id}/submissions`, {});
ok("teacher sees the hand-in against the roster", marks.status === 200
  && marks.body.data.some((r) => r.submission?.bodyText === "Finished all five."),
  JSON.stringify(marks.body).slice(0, 160));

const material = await call(jt, "/api/v1/materials", { method: "POST", body: JSON.stringify({
  section_id: sectionId, title: "Revision sheet", url: "https://example.org/fractions.pdf" }) });
ok("teacher posts a class material", material.status === 201, JSON.stringify(material.body).slice(0, 140));

const teacherCw = await call(jt, `/teacher/classwork/${sectionId}`, {});
ok("teacher classwork page renders the homework", teacherCw.status === 200
  && String(teacherCw.body).includes("Set homework") && String(teacherCw.body).includes(hwTitle),
  `status ${teacherCw.status}`);

const studentCw = await call(js, "/student/classwork", {});
ok("pupil classwork page renders their homework + materials", studentCw.status === 200
  && String(studentCw.body).includes(hwTitle) && String(studentCw.body).includes("Revision sheet"),
  `status ${studentCw.status}`);

const parentCw = await call(jp, `/parent/${threadStudent}`, {});
ok("parent child page shows homework status", parentCw.status === 200
  && String(parentCw.body).includes(hwTitle) && String(parentCw.body).includes("handed in"),
  `status ${parentCw.status}`);

// a teacher may not touch a class that is not theirs
const notMine = await call(jt, "/api/v1/materials", { method: "POST", body: JSON.stringify({
  section_id: "00000000-0000-0000-0000-000000000009", title: "Nope", url: "https://example.org/x" }) });
ok("teacher cannot post to a section they do not teach", notMine.status === 403 || notMine.status === 404, `${notMine.status}`);

// a message can now carry a file
const msgFile = await call(jt, `/api/v1/threads/${thread.body.id}/messages`, { method: "POST",
  body: JSON.stringify({ body_text: "See the attached slip.", attachment_file_id: up.body.id }) });
ok("message with an attachment accepted", msgFile.status === 201 && msgFile.body.attachmentFileId === up.body.id,
  JSON.stringify(msgFile.body).slice(0, 140));
const threadWithFile = await call(jp, `/parent/messages/${thread.body.id}`, {});
ok("guardian sees the attachment in the thread", threadWithFile.status === 200
  && String(threadWithFile.body).includes("worksheet.pdf"),
  `status ${threadWithFile.status}`);

// 3. the offline shell
const sw = await call(jar(), "/sw.js", {});
ok("service worker is served", sw.status === 200 && String(sw.body).includes("offline.html"),
  `status ${sw.status}`);
const manifest = await call(jar(), "/manifest.webmanifest", {});
// JSON.stringify, not String(): `call()` already parsed the body, and
// String({}) is "[object Object]" — an assertion that can never fail.
const manifestText = JSON.stringify(manifest.body);
ok("web manifest is served with the PNG icons Android requires",
  manifest.status === 200
    && manifestText.includes("School Portal")
    && manifestText.includes("standalone")
    && manifestText.includes("icon-192.png")
    && manifestText.includes("icon-512.png")
    && manifestText.includes("maskable"),
  `status ${manifest.status} ${manifestText.slice(0, 120)}`);
const offlinePage = await call(jar(), "/offline.html", {});
ok("offline fallback page is served", offlinePage.status === 200
  && String(offlinePage.body).includes("offline"), `status ${offlinePage.status}`);

// The point of precaching this one: with no signal, every other page needs the
// server. This one is static HTML + IndexedDB, so a teacher can still mark a
// register in a classroom with no bars.
const offReg = await call(jar(), "/offline-register", {});
ok("offline register page is served and precached by the worker",
  offReg.status === 200 && String(offReg.body).includes("Offline register")
    && String(sw.body).includes("/portal/offline-register"),
  `status ${offReg.status}`);
const icon192 = await call(jar(), "/icon-192.png", {});
ok("PWA icons are served", icon192.status === 200, `status ${icon192.status}`);

// security headers from helmet
const hdr = await call(jar(), "/api/v1/health", {});
ok("security headers present", !!hdr.headers?.["x-content-type-options"] && !!hdr.headers?.["content-security-policy"], JSON.stringify(Object.keys(hdr.headers ?? {})).slice(0, 160));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
