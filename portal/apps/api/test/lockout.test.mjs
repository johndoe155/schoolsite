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
const { auditLog, users } = require("../dist/db/schema.js");
const { eq } = require("drizzle-orm");
const request = require("supertest");

process.env.COOKIE_SECURE = "false";

/**
 * Audit finding #13: the lockout was a denial of service AND an account
 * existence oracle. Five requests locked any known address for 15 minutes with
 * no way to clear it, and `423 account_locked` vs `401 invalid_credentials`
 * told an attacker which addresses were real — a made-up one could never reach
 * the locked state.
 *
 * Both halves are fixed: the locked response is now indistinguishable from a
 * wrong password, and POST /directory/users/:id/unlock gives staff a recovery
 * path that does not involve waiting out the window.
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
function jar(name) { const j = jars[name]; return `sid=${j.sid}; csrf=${j.csrf}`; }
function auth(name) { return { Cookie: jar(name), "x-csrf": jars[name].csrf }; }

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
async function uidOf(email) {
  const [u] = await withActor(db, SERVICE, async (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1));
  return u?.id;
}

before(async () => {
  const made = createDb();
  db = made.db;
  await runMigrations(made.runner);
  await seed(db);
  app = await createApp(db);
  server = app.getHttpServer();
});
after(async () => { await app?.close(); });

test("a locked account is indistinguishable from a nonexistent one", async () => {
  const real = "p1@school.example";
  const fake = "definitely-not-a-real-user@nowhere.example";

  // Five failures lock the real account.
  for (let i = 0; i < 5; i++) {
    const r = await request(server).post("/api/v1/auth/login")
      .send({ email: real, password: "Wr0ng!Password" });
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }

  // Now hammer the fake address the same number of times.
  for (let i = 0; i < 6; i++) {
    await request(server).post("/api/v1/auth/login")
      .send({ email: fake, password: "Wr0ng!Password" });
  }

  const realRes = await request(server).post("/api/v1/auth/login")
    .send({ email: real, password: "Passw0rd!" });        // correct password
  const fakeRes = await request(server).post("/api/v1/auth/login")
    .send({ email: fake, password: "Passw0rd!" });

  // The whole point: an attacker comparing these two learns nothing.
  assert.equal(realRes.status, fakeRes.status,
    `status leaked: real=${realRes.status} fake=${fakeRes.status}`);
  assert.equal(realRes.body.code, fakeRes.body.code,
    `code leaked: real=${realRes.body.code} fake=${fakeRes.body.code}`);
  assert.equal(realRes.body.code, "invalid_credentials");
  assert.equal(realRes.status, 401);
  // No retry hint either — that alone would reveal the account exists.
  assert.equal(realRes.body.retryAfterMs, undefined);
});

test("the account really is locked, not merely reporting it", async () => {
  // If the lockout were cosmetic the correct password would succeed here.
  const res = await request(server).post("/api/v1/auth/login")
    .send({ email: "p1@school.example", password: "Passw0rd!" });
  assert.equal(res.status, 401);
});

test("an admin can unlock, and it takes effect immediately", async () => {
  const adminId = await staffLogin("admin", "admin@school.example");
  const target = await uidOf("p1@school.example");
  assert.ok(adminId && target, "seeded users missing");

  const res = await request(server).post(`/api/v1/users/${target}/unlock`)
    .set(auth("admin")).send({});
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.unlocked, "p1@school.example");

  // …and the previously-locked account can now sign in.
  const back = await request(server).post("/api/v1/auth/login")
    .send({ email: "p1@school.example", password: "Passw0rd!" });
  assert.equal(back.status, 201, JSON.stringify(back.body));
});

test("unlock is audited", async () => {
  const rows = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(auditLog).where(eq(auditLog.action, "auth.unlock")));
  assert.ok(rows.length >= 1, "expected an auth.unlock audit row");
  assert.equal(rows[0].afterJson?.email, "p1@school.example");
});

test("unlock requires directory:write", async () => {
  const teacher = await staffLogin("t1", "t1@school.example");
  const target = await uidOf("p1@school.example");
  const res = await request(server).post(`/api/v1/users/${target}/unlock`)
    .set(auth("t1")).send({});
  assert.ok(res.status === 403 || res.status === 401,
    `a teacher must not be able to unlock accounts, got ${res.status}`);
  assert.ok(teacher, "teacher login sanity");
});

test("unlocking an unknown user is a 404, not a crash", async () => {
  const res = await request(server)
    .post("/api/v1/users/00000000-0000-4000-8000-000000000000/unlock")
    .set(auth("admin")).send({});
  assert.equal(res.status, 404, JSON.stringify(res.body));
});
