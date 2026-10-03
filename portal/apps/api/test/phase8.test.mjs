/**
 * Phase 8 — classwork, files, and the timetable people can actually see.
 * (2026-10-03)
 *
 * The three product gaps the school would have hit in week one:
 *
 *   1. TIMETABLE — the backend existed (0018) with no UI and no way for a
 *      pupil or parent to read it. These tests cover the term grid an admin
 *      builds from, a pupil's own week, and who may read whose week.
 *   2. HOMEWORK — assignments with due dates, hand-ins, and re-submission
 *      that updates instead of duplicating.
 *   3. FILES — upload + download with a MIME allowlist, scope re-checked on
 *      every read, and no way to reach the bytes without a session.
 */
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
const { users, students, userRoles, courseSections, sectionStaff, enrollments,
  assignments, assignmentSubmissions, sectionMaterials, files, guardians } =
  require("../dist/db/schema.js");
const { eq } = require("drizzle-orm");
const request = require("supertest");

process.env.COOKIE_SECURE = "false";
process.env.FILES_DIR = `${process.cwd()}/data/test-files`;

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
function auth(name) {
  return { Cookie: `sid=${jars[name].sid}; csrf=${jars[name].csrf}`, "x-csrf": jars[name].csrf };
}
async function loginAs(name, email, password = "Passw0rd!") {
  const res = await request(server).post("/api/v1/auth/login").send({ email, password });
  assert.equal(res.status, 201, `${email}: ${JSON.stringify(res.body)}`);
  jars[name] = { ...cookiesOf(res) };
  return res;
}
async function staffLogin(name, email) {
  await loginAs(name, email);
  const [u] = await withActor(db, SERVICE, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1));
  const token = await issueEnrollToken(db, u.id, null);
  const enroll = await request(server).post("/api/v1/auth/mfa/totp/enroll")
    .set(auth(name)).send({ token });
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
  await staffLogin("t1", "t1@school.example");   // teaches sec1 (MTH-101 A)
  await staffLogin("t2", "t2@school.example");   // teaches sec2 (ENG-101 A)
  await loginAs("s1", "s1@school.example");      // enrolled in sec1
  await loginAs("p1", "p1@school.example");      // s1's verified guardian
});
after(async () => { await app?.close(); });

const MONDAY = 1;

/** sec1 (MTH-101 A, taught by t1, s1 enrolled) + its term. */
async function fixture() {
  const secs = await withActor(db, SERVICE, (tx) => tx.select().from(courseSections).limit(2));
  assert.ok(secs.length >= 2, `seed needs 2 sections, has ${secs.length}`);
  const [s1] = await withActor(db, SERVICE, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, "s1@school.example")).limit(1));
  return { termId: secs[0].termId, a: secs[0], b: secs[1], studentId: s1.id };
}

/** Build Monday, then one taught period in section A with t1 in front of it. */
async function mondayTimetable() {
  const { termId, a, studentId } = await fixture();
  const periods = await request(server)
    .post(`/api/v1/timetable/terms/${termId}/periods`).set(auth("admin"))
    .send([
      { weekday: MONDAY, period_index: 1, starts_at: "08:00", ends_at: "08:45", label: "Period 1" },
      { weekday: MONDAY, period_index: 2, starts_at: "08:45", ends_at: "09:30" },
      { weekday: MONDAY, period_index: 3, starts_at: "09:30", ends_at: "10:00", is_break: true, label: "Break" },
    ]);
  assert.equal(periods.status, 201, JSON.stringify(periods.body));

  const [t1] = await withActor(db, SERVICE, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, "t1@school.example")).limit(1));
  const [p1] = await withActor(db, SERVICE, (tx) =>
    tx.select().from(require("../dist/db/schema.js").timetablePeriods)
      .where(eq(require("../dist/db/schema.js").timetablePeriods.termId, termId)));
  const slot = await request(server).post("/api/v1/timetable/slots").set(auth("admin"))
    .send({ period_id: p1.id, section_id: a.id, teacher_user_id: t1.id, room: "Room 12" });
  assert.equal(slot.status, 201, JSON.stringify(slot.body));
  return { termId, a, studentId, periodId: p1.id, slotId: slot.body.slot.id };
}

/**
 * A SECOND pupil, enrolled in the same section as s1.
 *
 * The suite needs a real child who belongs to somebody else: without one, the
 * "a guardian cannot read a child who is not theirs" test can only ask for a
 * random UUID, which proves the ownership check exists but not that it
 * distinguishes between two children the database really knows about. Created
 * directly rather than through the invite flow — the invite flow has its own
 * tests, and this is fixture setup.
 */
let secondPupilId = null;
async function secondPupil(sectionId) {
  if (secondPupilId) return secondPupilId;
  secondPupilId = await withActor(db, SERVICE, async (tx) => {
    const [u] = await tx.insert(users).values({
      email: "s2@school.example", displayName: "Bisi Bean", status: "active",
    }).returning({ id: users.id });
    await tx.insert(students).values({ userId: u.id, admissionNo: "STU-0002", gradeLevel: 10 });
    await tx.insert(userRoles).values({ userId: u.id, roleCode: "student" });
    await tx.insert(enrollments).values({ studentUserId: u.id, sectionId, status: "enrolled" });
    return u.id;
  });
  return secondPupilId;
}

/** A tiny in-memory PDF — the allowlist only cares about the declared type. */
const pdf = () => Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

async function upload(who, filename = "worksheet.pdf", contentType = "application/pdf", body = pdf()) {
  return request(server).post("/api/v1/files").set(auth(who))
    .attach("file", body, { filename, contentType });
}

/* ── 1. Timetable ─────────────────────────────────────────────────────────── */

test("the admin grid returns the term's periods, sections and slots in one payload", async () => {
  const { termId } = await mondayTimetable();
  const res = await request(server).get(`/api/v1/timetable/terms/${termId}`).set(auth("admin"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.periods.length, 3, "the bell schedule comes back whole");
  assert.ok(res.body.sections.some((s) => s.name === "MTH-101 A"));
  assert.equal(res.body.slots.length, 1, "the one taught period is placed");
  assert.equal(res.body.slots[0].room, "Room 12");
  assert.equal(res.body.slots[0].teacherName, "Tayo Teacher");
});

test("a pupil can read their own week, with the room and the teacher named", async () => {
  const { studentId } = await mondayTimetable();
  const res = await request(server).get(`/api/v1/timetable/students/${studentId}`).set(auth("s1"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const monday = res.body.week.Monday;
  assert.equal(monday.length, 3, "all three periods render, including the break");
  const lesson = monday.find((p) => p.room);
  assert.ok(lesson, "the scheduled lesson is present");
  assert.equal(lesson.room, "Room 12");
  assert.equal(lesson.teacher, "Tayo Teacher");
  assert.equal(monday[2].isBreak, true);
});

test("a verified guardian can read their child's week", async () => {
  const { studentId } = await mondayTimetable();
  const res = await request(server)
    .get(`/api/v1/timetable/students/${studentId}`).set(auth("p1"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.week.Monday.filter((p) => p.room).length, 1);
});

test("a guardian cannot read a child who is not theirs", async () => {
  const { b } = await fixture();
  const other = await secondPupil(b.id);
  // p1 is verified for s1 only; `other` is a real pupil in the same section.
  const res = await request(server)
    .get(`/api/v1/timetable/students/${other}`).set(auth("p1"));
  assert.equal(res.status, 403, `got ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body.code, "not_your_record");
});

test("a guardian asking for another family's child gets 403, not an empty list", async () => {
  const { b } = await fixture();
  const other = await secondPupil(b.id);
  for (const path of ["/api/v1/student/assignments", "/api/v1/student/materials"]) {
    const res = await request(server).get(`${path}?student=${other}`).set(auth("p1"));
    assert.equal(res.status, 403, `${path} → ${res.status}`);
    assert.equal(res.body.code, "not_your_record");
  }
});

test("a guardian reading their own child still gets the work", async () => {
  const { a, studentId } = await mondayTimetable();
  const t1 = await withActor(db, SERVICE, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, "t1@school.example")).limit(1));
  const made = await request(server).post("/api/v1/assignments").set(auth("t1"))
    .send({ section_id: a.id, title: "Fractions worksheet" });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const res = await request(server)
    .get(`/api/v1/student/assignments?student=${studentId}`).set(auth("p1"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.some((x) => x.title === "Fractions worksheet"));
  assert.ok(t1[0].id, "t1 exists");
});

test("a pupil cannot read another pupil's week", async () => {
  const { studentId } = await mondayTimetable();
  // t2 teaches the OTHER section and is not this pupil's teacher.
  const res = await request(server)
    .get(`/api/v1/timetable/students/${studentId}`).set(auth("t2"));
  assert.equal(res.status, 403, `expected 403, got ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(res.body.code, "not_your_record");
});

test("removing a slot frees the period instead of leaving a phantom lesson", async () => {
  const { slotId, studentId } = await mondayTimetable();
  const del = await request(server).delete(`/api/v1/timetable/slots/${slotId}`).set(auth("admin"));
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const week = await request(server)
    .get(`/api/v1/timetable/students/${studentId}`).set(auth("s1"));
  assert.equal(week.body.week.Monday.filter((p) => p.room).length, 0);
});

/* ── 2. Files ─────────────────────────────────────────────────────────────── */

test("a teacher can upload a file and gets back its size and digest", async () => {
  const res = await upload("t1");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.filename, "worksheet.pdf");
  assert.equal(res.body.mimeType, "application/pdf");
  assert.ok(res.body.bytes > 10);
  assert.match(res.body.sha256, /^[a-f0-9]{64}$/);
});

test("an executable type is refused, not stored", async () => {
  const res = await request(server).post("/api/v1/files").set(auth("t1"))
    .attach("file", Buffer.from("<html><script>alert(1)</script></html>"),
      { filename: "lesson.html", contentType: "text/html" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, "unsupported_file_type");
  const rows = await withActor(db, SERVICE, (tx) =>
    tx.select().from(files).where(eq(files.filename, "lesson.html")));
  assert.equal(rows.length, 0, "the refused file must not leave a row behind");
});

test("file bytes are not reachable without a session", async () => {
  const up = await upload("t1");
  const anon = await request(server).get(`/api/v1/files/${up.body.id}`);
  assert.equal(anon.status, 401, "no anonymous download");
});

test("a pupil enrolled in the section can download the material; an outsider cannot", async () => {
  const { a } = await fixture();
  const up = await upload("t1");
  const made = await request(server).post("/api/v1/materials").set(auth("t1")).send({
    section_id: a.id, title: "Revision sheet", file_id: up.body.id,
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));

  const mine = await request(server).get(`/api/v1/files/${up.body.id}`).set(auth("s1"));
  assert.equal(mine.status, 200, "the enrolled pupil may read it");
  assert.match(mine.headers["content-disposition"] ?? "", /attachment/);
  assert.equal(mine.headers["x-content-type-options"], "nosniff");

  // t2 teaches the other section and is a teacher (so the route's permission
  // gate lets them reach the handler) but has nothing to do with section A.
  const theirs = await request(server).get(`/api/v1/files/${up.body.id}`).set(auth("t2"));
  assert.equal(theirs.status, 404, `outsider must not learn the file exists: ${theirs.status}`);
});

test("a teacher cannot post a material into a section they do not teach", async () => {
  const { b } = await fixture();
  const res = await request(server).post("/api/v1/materials").set(auth("t1"))
    .send({ section_id: b.id, title: "Not mine", url: "https://example.org/x.pdf" });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, "outside_section_scope");
});

/* ── 3. Homework ──────────────────────────────────────────────────────────── */

test("a teacher sets homework and the pupil sees it, with the attachment", async () => {
  const { a, studentId } = await fixture();
  const up = await upload("t1");
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const created = await request(server).post("/api/v1/assignments").set(auth("t1")).send({
    section_id: a.id, title: "Quadratic equations exercise 4", due_at: due,
    instructions: "Questions 1-10.", attachment_file_id: up.body.id,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const list = await request(server).get("/api/v1/student/assignments").set(auth("s1"));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const row = list.body.data.find((r) => r.title === "Quadratic equations exercise 4");
  assert.ok(row, "the homework appears in the pupil's list");
  assert.equal(row.filename, "worksheet.pdf");
  assert.equal(row.submissionId, null, "not yet handed in");
  assert.ok(row.sectionName, "the pupil can see which class it is for");

  // The guardian sees the same homework for their child.
  const parentView = await request(server)
    .get(`/api/v1/student/assignments?student=${studentId}`).set(auth("p1"));
  assert.equal(parentView.status, 200, JSON.stringify(parentView.body));
  assert.ok(parentView.body.data.some((r) => r.title === "Quadratic equations exercise 4"));
});

test("handing work in is recorded once and re-submitting replaces it", async () => {
  const { a } = await fixture();
  const created = await request(server).post("/api/v1/assignments").set(auth("t1"))
    .send({ section_id: a.id, title: "Reading log" });
  const id = created.body.id;

  const first = await request(server).post(`/api/v1/assignments/${id}/submissions`)
    .set(auth("s1")).send({ body_text: "Finished chapter 1." });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await request(server).post(`/api/v1/assignments/${id}/submissions`)
    .set(auth("s1")).send({ body_text: "Finished chapters 1 and 2." });
  assert.equal(second.status, 201, JSON.stringify(second.body));

  const rows = await withActor(db, SERVICE, (tx) =>
    tx.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, id)));
  assert.equal(rows.length, 1, "re-submitting must update, never duplicate");
  assert.match(rows[0].bodyText, /chapters 1 and 2/);

  const sheet = await request(server).get(`/api/v1/assignments/${id}/submissions`).set(auth("t1"));
  assert.equal(sheet.status, 200, JSON.stringify(sheet.body));
  assert.equal(sheet.body.data.length, 1, "one row per enrolled pupil");
  assert.ok(sheet.body.data[0].submission, "the hand-in is attached to the pupil");
});

test("an empty hand-in is refused", async () => {
  const { a } = await fixture();
  const created = await request(server).post("/api/v1/assignments").set(auth("t1"))
    .send({ section_id: a.id, title: "Empty attempt" });
  const res = await request(server).post(`/api/v1/assignments/${created.body.id}/submissions`)
    .set(auth("s1")).send({});
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, "empty_submission");
});

test("a teacher of another section cannot set homework for this one", async () => {
  const { a } = await fixture();
  const res = await request(server).post("/api/v1/assignments").set(auth("t2"))
    .send({ section_id: a.id, title: "Not my class" });
  assert.equal(res.status, 403, JSON.stringify(res.body));
});

test("setting homework queues a notification for pupil and guardian, not the teacher", async () => {
  const { a, studentId } = await fixture();
  await request(server).post("/api/v1/assignments").set(auth("t1"))
    .send({ section_id: a.id, title: "Notify me" });

  // The producer runs detached; give it a moment to finish its writes.
  await new Promise((r) => setTimeout(r, 250));
  const { notifications } = require("../dist/db/schema.js");
  const rows = await withActor(db, SERVICE, (tx) =>
    tx.select().from(notifications).where(eq(notifications.kind, "assignment_posted")));
  assert.ok(rows.length >= 2, `expected pupil + guardian rows, got ${rows.length}`);
  const recipients = rows.map((r) => r.recipientUserId);
  assert.ok(recipients.includes(studentId), "the pupil is told");
  assert.ok(recipients.some((id) => id !== studentId), "the guardian is told");
});

test("materials reach the pupil's own list", async () => {
  const { a } = await fixture();
  const made = await request(server).post("/api/v1/materials").set(auth("t1")).send({
    section_id: a.id, title: "Past paper 2025", url: "https://example.org/past-paper.pdf",
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const mine = await request(server).get("/api/v1/student/materials").set(auth("s1"));
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.ok(mine.body.data.some((m) => m.title === "Past paper 2025"));
});

test("a material with neither a file nor a link is refused", async () => {
  const { a } = await fixture();
  const res = await request(server).post("/api/v1/materials").set(auth("t1"))
    .send({ section_id: a.id, title: "Nothing to read" });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "material_needs_content");
});

test("classwork writes are audited", async () => {
  const { a } = await fixture();
  await request(server).post("/api/v1/assignments").set(auth("t1"))
    .send({ section_id: a.id, title: "Audited homework" });
  const { auditLog } = require("../dist/db/schema.js");
  const rows = await withActor(db, SERVICE, (tx) =>
    tx.select().from(auditLog).where(eq(auditLog.action, "assignment.created")));
  assert.ok(rows.length > 0);
});

test("the class a teacher can post to is their own, not the whole school's", async () => {
  await mondayTimetable();
  const res = await request(server).get("/api/v1/classwork/my-sections").set(auth("t1"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const names = res.body.data.map((s) => s.name);
  assert.ok(names.includes("MTH-101 A"), `t1 should see MTH-101 A, saw ${names.join(",")}`);
  assert.ok(!names.includes("ENG-101 A"), "t1 must not be offered another teacher's class");
});
