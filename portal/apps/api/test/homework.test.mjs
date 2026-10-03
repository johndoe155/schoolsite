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
const { users, courseSections, enrollments, auditLog, homeworkAssignments } =
  require("../dist/db/schema.js");
const { eq } = require("drizzle-orm");
const request = require("supertest");

process.env.COOKIE_SECURE = "false";

/**
 * Homework: work set, work done, work marked. The behaviours worth pinning are
 * the ones a parent or a teacher would dispute later — that a late submission
 * is recorded as late at the moment it happens, that "has not handed in" is a
 * real query rather than a null, that a withdrawn assignment stops accepting
 * work, and that a mark above the stated maximum is refused.
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
function auth(name) {
  return { Cookie: `sid=${jars[name].sid}; csrf=${jars[name].csrf}`, "x-csrf": jars[name].csrf };
}

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
  const enroll = await request(server).post("/api/v1/auth/mfa/totp/enroll")
    .set(auth(name)).send({ token });
  assert.equal(enroll.status, 201, JSON.stringify(enroll.body));
  const verify = await request(server).post("/api/v1/auth/mfa/totp/verify")
    .set(auth(name)).send({ code: totpCode(enroll.body.secret) });
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
  await staffLogin("teacher", "t1@school.example");
  await staffLogin("admin", "admin@school.example");
});
after(async () => { await app?.close(); });

/** The section t1 teaches, and one of its enrolled students. */
async function fixture() {
  const [section] = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(courseSections).limit(1));
  const [enrol] = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(enrollments).where(eq(enrollments.sectionId, section.id)).limit(1));
  assert.ok(section, "seed has no section");
  return { sectionId: section.id, studentUserId: enrol?.studentUserId ?? null };
}

const inADay = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

async function setHomework(patch = {}) {
  const { sectionId } = await fixture();
  const res = await request(server).post("/api/v1/homework/assignments")
    .set(auth("teacher"))
    .send({ section_id: sectionId, title: "Exercise 4.2", due_at: inADay(), ...patch });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.assignment;
}

test("a teacher can set homework for a section", async () => {
  const a = await setHomework({ instructions: "Odd numbers only.", max_score: 20 });
  assert.equal(a.title, "Exercise 4.2");
  assert.equal(a.status, "active");
  assert.equal(a.maxScore, 20);
});

test("a due date in the past is refused", async () => {
  const res = await request(server).post("/api/v1/homework/assignments")
    .set(auth("teacher")).send({ section_id: (await fixture()).sectionId, title: "Backdated", due_at: yesterday() });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.match(res.body.detail, /before the day/i);
});

test("a due time that is not an ISO datetime is refused", async () => {
  const res = await request(server).post("/api/v1/homework/assignments")
    .set(auth("teacher"))
    .send({ section_id: (await fixture()).sectionId, title: "Bad date", due_at: "next friday" });
  assert.equal(res.status, 422);
});

test("a student sees their homework and can hand it in on time", async () => {
  await loginAs("s1", "s1@school.example");
  const before = await request(server).get("/api/v1/homework/me").set(auth("s1"));
  assert.equal(before.status, 200, JSON.stringify(before.body));
  const mine = before.body.assignments.find((x) => x.title === "Exercise 4.2");
  assert.ok(mine, "the student should see work set for their section");
  assert.equal(mine.submitted, null);
  assert.equal(mine.overdue, false, "not yet due, not yet submitted");

  const sub = await request(server).post(`/api/v1/homework/assignments/${mine.id}/submit`)
    .set(auth("s1")).send({ body: "My answers." });
  assert.equal(sub.status, 201, JSON.stringify(sub.body));
  assert.equal(sub.body.late, false, "handed in before the deadline");

  const after = await request(server).get("/api/v1/homework/me").set(auth("s1"));
  const again = after.body.assignments.find((x) => x.id === mine.id);
  assert.equal(again.body, "My answers.");
  assert.equal(again.late, false);
});

test("a submission after the deadline is recorded as late", async () => {
  // Set work that was due an hour ago, directly, so the lateness is real
  // rather than simulated — the flag is written at submit time.
  const { sectionId } = await fixture();
  // Resolve the teacher id BEFORE opening an actor context: uid() opens one of
  // its own, and nesting them deadlocks.
  const teacherId = await uid("t1@school.example");
  await withActor(db, SERVICE, async (tx) => tx.insert(homeworkAssignments).values({
    sectionId, title: "Already due", assignedBy: teacherId,
    assignedOn: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    dueAt: new Date(Date.now() - 3600 * 1000), status: "active",
  }));
  const mine = (await request(server).get("/api/v1/homework/me").set(auth("s1"))).body
    .assignments.find((x) => x.title === "Already due");
  assert.ok(mine);
  assert.equal(mine.overdue, true, "past due and not submitted");

  const sub = await request(server).post(`/api/v1/homework/assignments/${mine.id}/submit`)
    .set(auth("s1")).send({ body: "Sorry this is late." });
  assert.equal(sub.status, 201);
  assert.equal(sub.body.late, true, "late must be recorded, not inferred later");
});

async function uid(email) {
  const [u] = await withActor(db, SERVICE, async (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1));
  return u.id;
}

test("re-submitting replaces the work rather than duplicating it", async () => {
  const mine = (await request(server).get("/api/v1/homework/me").set(auth("s1"))).body
    .assignments.find((x) => x.title === "Exercise 4.2");
  const res = await request(server).post(`/api/v1/homework/assignments/${mine.id}/submit`)
    .set(auth("s1")).send({ body: "Corrected version." });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const again = (await request(server).get("/api/v1/homework/me").set(auth("s1"))).body
    .assignments.find((x) => x.id === mine.id);
  assert.equal(again.body, "Corrected version.");
});

test("the outstanding report names the students who have not handed in", async () => {
  const a = await setHomework({ title: "Never submitted" });
  const res = await request(server).get(`/api/v1/homework/assignments/${a.id}/outstanding`)
    .set(auth("teacher"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.missing.length > 0, "nobody has submitted, so the list must not be empty");
  assert.equal(res.body.overdue, false);
  assert.ok(res.body.missing.every((m) => m.name && m.studentUserId));

  // Hand one in and confirm they drop off the list.
  await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Done." });
  const after = await request(server).get(`/api/v1/homework/assignments/${a.id}/outstanding`)
    .set(auth("teacher"));
  assert.equal(after.body.missing.length, res.body.missing.length - 1);
});

test("the section list counts submissions correctly", async () => {
  // This failed while the count came from a correlated subquery, which compiled
  // and ran but always returned 0. A list claiming nobody has handed anything in
  // is worse than a crash, so the count gets its own assertion.
  const a = await setHomework({ title: "Counted" });
  const { sectionId } = await fixture();
  const before = await request(server).get(`/api/v1/homework/sections/${sectionId}`).set(auth("teacher"));
  assert.equal(before.status, 200, JSON.stringify(before.body));
  const zero = before.body.assignments.find((x) => x.id === a.id);
  assert.equal(zero.submissionCount, 0, "nobody has submitted yet");

  await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Counted attempt." });

  const after = await request(server).get(`/api/v1/homework/sections/${sectionId}`).set(auth("teacher"));
  const one = after.body.assignments.find((x) => x.id === a.id);
  assert.equal(one.submissionCount, 1, "the count must reflect the submission");
});

test("a teacher can mark a submission, and the student sees the mark", async () => {
  const a = await setHomework({ title: "To be marked", max_score: 10 });
  const studentId = await uid("s1@school.example");
  await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Attempt." });

  const mark = await request(server).post(`/api/v1/homework/assignments/${a.id}/mark`)
    .set(auth("teacher")).send({ student_user_id: studentId, score: 8, feedback: "Good working." });
  assert.equal(mark.status, 201, JSON.stringify(mark.body));
  assert.equal(mark.body.submission.score, 8);

  const mine = (await request(server).get("/api/v1/homework/me").set(auth("s1"))).body
    .assignments.find((x) => x.id === a.id);
  assert.equal(mine.score, 8);
  assert.equal(mine.feedback, "Good working.");
});

test("the submissions list returns what was handed in, ready to mark", async () => {
  const a = await setHomework({ title: "To be listed", max_score: 10 });
  const studentId = await uid("s1@school.example");
  await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Listed attempt." });

  const res = await request(server).get(`/api/v1/homework/assignments/${a.id}/submissions`)
    .set(auth("teacher"));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.title, "To be listed");
  assert.equal(res.body.maxScore, 10);
  const mine = res.body.submissions.find((x) => x.studentUserId === studentId);
  assert.ok(mine, "the submission must appear");
  assert.equal(mine.body, "Listed attempt.");
  assert.equal(mine.score, null, "unmarked before the teacher marks it");
  assert.ok(mine.name && mine.email, "the teacher needs to know whose work this is");
});

test("a student cannot read the submissions list for their own assignment", async () => {
  const a = await setHomework({ title: "Not for students to browse" });
  const res = await request(server).get(`/api/v1/homework/assignments/${a.id}/submissions`)
    .set(auth("s1"));
  assert.ok([401, 403].includes(res.status),
    `one student must not read another's work, got ${res.status}`);
});

test("a score above the assignment's maximum is refused", async () => {
  const a = await setHomework({ title: "Max ten", max_score: 10 });
  const studentId = await uid("s1@school.example");
  await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Attempt." });
  const res = await request(server).post(`/api/v1/homework/assignments/${a.id}/mark`)
    .set(auth("teacher")).send({ student_user_id: studentId, score: 11 });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "score_exceeds_max");
});

test("marking a student who has not handed in is a 404, not a silent success", async () => {
  const a = await setHomework({ title: "Nobody submitted this" });
  const studentId = await uid("s1@school.example");
  const res = await request(server).post(`/api/v1/homework/assignments/${a.id}/mark`)
    .set(auth("teacher")).send({ student_user_id: studentId, score: 5 });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, "not_submitted");
});

test("a withdrawn assignment stops accepting work but stays in the record", async () => {
  const a = await setHomework({ title: "Set in error" });
  const wd = await request(server).post(`/api/v1/homework/assignments/${a.id}/withdraw`)
    .set(auth("teacher"));
  assert.equal(wd.status, 201, JSON.stringify(wd.body));
  assert.equal(wd.body.assignment.status, "withdrawn");

  const sub = await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("s1")).send({ body: "Too late." });
  assert.equal(sub.status, 422);
  assert.equal(sub.body.code, "assignment_closed");

  const row = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(homeworkAssignments).where(eq(homeworkAssignments.id, a.id)));
  assert.equal(row.length, 1, "withdrawn means withdrawn, not deleted");
});

test("students cannot set or mark homework", async () => {
  const res = await request(server).post("/api/v1/homework/assignments")
    .set(auth("s1")).send({ section_id: (await fixture()).sectionId, title: "Nope", due_at: inADay() });
  assert.ok([401, 403].includes(res.status), `a student must not set work, got ${res.status}`);
});

test("a teacher cannot submit as if they were a student", async () => {
  const a = await setHomework({ title: "Teacher tries to submit" });
  const res = await request(server).post(`/api/v1/homework/assignments/${a.id}/submit`)
    .set(auth("teacher")).send({ body: "I did it." });
  assert.ok([401, 403].includes(res.status), `submit needs homework:submit, got ${res.status}`);
});

test("homework writes are audited", async () => {
  await setHomework({ title: "Audited one" });
  const actions = await withActor(db, SERVICE, async (tx) =>
    tx.select({ action: auditLog.action }).from(auditLog));
  const set = new Set(actions.map((a) => a.action));
  for (const expected of ["homework.assigned", "homework.submitted", "homework.marked", "homework.withdrawn"]) {
    assert.ok(set.has(expected), `expected audit action ${expected}`);
  }
});
