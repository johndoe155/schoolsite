import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { createDb } = require("../dist/db/client.js");
const { runMigrations } = require("../dist/db/migrate.js");
const { seed } = require("../dist/seed.js");
const { createApp } = require("../dist/app.factory.js");
const { totpCode } = require("../dist/crypto/totp.js");
const { withActor, SERVICE } = require("../dist/db/actor.js");
const { issueEnrollToken } = require("../dist/auth/enroll-token.js");
const { users, courseSections, timetablePeriods, timetableSlots, auditLog } =
  require("../dist/db/schema.js");
const { eq } = require("drizzle-orm");
const request = require("supertest");

process.env.COOKIE_SECURE = "false";

/**
 * The portal could record attendance, grades and fees but nothing said WHEN
 * anything happened. These tests cover the four things that make a timetable a
 * timetable rather than a list: the week renders with breaks kept and free
 * periods empty, a backwards period is refused, a teacher cannot be in two
 * rooms at once, and writing it is audited and permission-gated.
 */

let app, server, db;
const jars = {};

function cookiesOf(res) {
  const out = {};
  for (const c of res.headers["set-cookie"] ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}
function auth(name) { return { Cookie: `sid=${jars[name].sid}; csrf=${jars[name].csrf}`, "x-csrf": jars[name].csrf }; }

async function loginAs(name, email, password = "Passw0rd!") {
  const res = await request(server).post("/api/v1/auth/login").send({ email, password });
  if (res.status === 201) jars[name] = { ...cookiesOf(res) };
  return res;
}
async function staffLogin(name, email) {
  await loginAs(name, email);
  const [u] = await withActor(db, SERVICE, async (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1));
  const token = await issueEnrollToken(db, u.id, null);
  const enroll = await request(server).post("/api/v1/auth/mfa/totp/enroll").set(auth(name)).send({ token });
  assert.equal(enroll.status, 201, JSON.stringify(enroll.body));
  const verify = await request(server).post("/api/v1/auth/mfa/totp/verify").set(auth(name))
    .send({ code: totpCode(enroll.body.secret) });
  assert.equal(verify.status, 201, JSON.stringify(verify.body));
  return u.id;
}

before(async () => {
  const made = createDb();
  db = made.db;
  await runMigrations(made.runner);
  await seed(db);
  app = await createApp(db);
  server = app.getHttpServer();
  await staffLogin("admin", "admin@school.example");
});
after(async () => { await app?.close(); });

const MONDAY = 1;

/** A term and two sections from the dev seed. */
async function fixture() {
  const secs = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(courseSections).limit(2));
  assert.ok(secs.length >= 2, `seed needs 2 sections, has ${secs.length}`);
  return { termId: secs[0].termId, a: secs[0], b: secs[1] };
}

async function setMondaySchedule(termId) {
  const res = await request(server)
    .post(`/api/v1/timetable/terms/${termId}/periods`).set(auth("admin"))
    .send([
      { weekday: MONDAY, period_index: 1, starts_at: "08:00", ends_at: "08:45", label: "Period 1" },
      { weekday: MONDAY, period_index: 2, starts_at: "08:45", ends_at: "09:30" },
      { weekday: MONDAY, period_index: 3, starts_at: "09:30", ends_at: "10:00", is_break: true, label: "Break" },
    ]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function periodIds(termId) {
  return withActor(db, SERVICE, async (tx) =>
    tx.select().from(timetablePeriods).where(eq(timetablePeriods.termId, termId)));
}

test("defining the bell schedule persists the periods", async () => {
  const { termId } = await fixture();
  const body = await setMondaySchedule(termId);
  assert.equal(body.count, 3);
});

test("a period that ends before it starts is refused", async () => {
  const { termId } = await fixture();
  const res = await request(server).post(`/api/v1/timetable/terms/${termId}/periods`)
    .set(auth("admin"))
    .send([{ weekday: MONDAY, period_index: 1, starts_at: "09:00", ends_at: "08:00" }]);
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.match(JSON.stringify(res.body), /ends before it starts/i);
});

test("a malformed clock time is refused rather than coerced", async () => {
  const { termId } = await fixture();
  const res = await request(server).post(`/api/v1/timetable/terms/${termId}/periods`)
    .set(auth("admin"))
    .send([{ weekday: MONDAY, period_index: 1, starts_at: "8am", ends_at: "09:00" }]);
  assert.equal(res.status, 422, "starts_at must be validated as HH:MM");
});

test("a section's week keeps the break and leaves unscheduled periods free", async () => {
  const { termId, a } = await fixture();
  await setMondaySchedule(termId);
  const res = await request(server).get(`/api/v1/timetable/sections/${a.id}`).set(auth("admin"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const monday = res.body.week.Monday;
  assert.equal(monday.length, 3, "all three periods render");
  assert.equal(monday[0].startsAt.slice(0, 5), "08:00");
  assert.equal(monday[2].isBreak, true, "the break is rendered, not silently dropped");
  assert.equal(monday[0].course ?? null, null, "an unscheduled period reads as free, not as an error");
});

test("a teacher cannot be timetabled into two sections in the same period", async () => {
  const { termId, a, b } = await fixture();
  await setMondaySchedule(termId);
  const periods = await periodIds(termId);
  const p1 = periods.find((p) => p.periodIndex === 1);

  const first = await request(server).post("/api/v1/timetable/slots").set(auth("admin"))
    .send({ period_id: p1.id, section_id: a.id, teacher_user_id: null });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  // Give the slot a teacher, then try to put that teacher elsewhere in the
  // same period.
  const [teacher] = await withActor(db, SERVICE, async (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, "t1@school.example")).limit(1));
  await withActor(db, SERVICE, async (tx) => tx.update(timetableSlots)
    .set({ teacherUserId: teacher.id }).where(eq(timetableSlots.periodId, p1.id)));

  const clash = await request(server).post("/api/v1/timetable/slots").set(auth("admin"))
    .send({ period_id: p1.id, section_id: b.id, teacher_user_id: teacher.id });
  assert.equal(clash.status, 422, "the same teacher in two rooms must be refused");
  assert.equal(clash.body.code, "teacher_clash");
});

test("nothing can be timetabled into a break period", async () => {
  const { termId, a } = await fixture();
  await setMondaySchedule(termId);
  const periods = await periodIds(termId);
  const brk = periods.find((p) => p.isBreak);
  const res = await request(server).post("/api/v1/timetable/slots").set(auth("admin"))
    .send({ period_id: brk.id, section_id: a.id });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, "break_period");
});

test("/timetable/me returns a full seven-day shape for the signed-in user", async () => {
  const res = await request(server).get("/api/v1/timetable/me").set(auth("admin"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.userId);
  assert.deepEqual(Object.keys(res.body.week).sort(),
    ["Friday", "Monday", "Saturday", "Sunday", "Thursday", "Tuesday", "Wednesday"]);
});

test("a teacher can read a timetable but not write one", async () => {
  await staffLogin("t1", "t1@school.example");
  const read = await request(server).get("/api/v1/timetable/me").set(auth("t1"));
  assert.equal(read.status, 200, "teachers hold schedule:read");

  const { termId } = await fixture();
  const write = await request(server).post(`/api/v1/timetable/terms/${termId}/periods`)
    .set(auth("t1"))
    .send([{ weekday: MONDAY, period_index: 1, starts_at: "08:00", ends_at: "08:45" }]);
  assert.ok([401, 403].includes(write.status),
    `teachers must not set the bell schedule, got ${write.status}`);
});

test("setting the bell schedule is audited", async () => {
  const { termId } = await fixture();
  await setMondaySchedule(termId);
  const rows = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(auditLog).where(eq(auditLog.action, "timetable.periods_set")));
  assert.ok(rows.length > 0, "timetable writes must leave an audit trail");
});
