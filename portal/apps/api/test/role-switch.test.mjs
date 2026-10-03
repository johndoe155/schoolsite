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
const { auditLog, users, userRoles } = require("../dist/db/schema.js");
const { eq } = require("drizzle-orm");
const { randomUUID } = require("node:crypto");
const request = require("supertest");

process.env.COOKIE_SECURE = "false";

/**
 * POST /auth/role/switch shipped with the RBAC work and had no test covering
 * it at all — and no UI, so nothing exercised it either. It is the endpoint
 * behind the role switcher in components/shell.tsx, so a regression here shows
 * up as a topbar control that silently does nothing.
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

async function loginAs(name, email) {
  const res = await request(server).post("/api/v1/auth/login")
    .send({ email, password: "Passw0rd!" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  jars[name] = { ...cookiesOf(res) };
  return res;
}
/** Login first — completeMfa reuses the jar the login response set. */
async function staffLogin(name, email) {
  await loginAs(name, email);
  return completeMfa(name, email);
}
async function completeMfa(name, email) {
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
/** The seed gives every account exactly one role; a dual-role staff member is
    the only way to reach the switcher at all. */
async function grantRole(userId, roleCode) {
  await withActor(db, SERVICE, async (tx) =>
    tx.insert(userRoles).values({ id: randomUUID(), userId, roleCode }));
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

test("a dual-role staff member can switch, and the session follows", async () => {
  const id = await staffLogin("dual", "t1@school.example");
  await grantRole(id, "registrar");

  const before = await request(server).get("/api/v1/auth/session").set(auth("dual"));
  assert.equal(before.status, 200);
  assert.equal(before.body.activeRole, "teacher");
  assert.deepEqual(before.body.roles.sort(), ["registrar", "teacher"]);
  assert.ok(!before.body.permissions.includes("directory:write"),
    "a plain teacher must not hold directory:write before switching");

  const res = await request(server).post("/api/v1/auth/role/switch")
    .set(auth("dual")).send({ role: "registrar" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.activeRole, "registrar");

  // The point of switching is that the *permissions* change, not just the label.
  const after = await request(server).get("/api/v1/auth/session").set(auth("dual"));
  assert.equal(after.body.activeRole, "registrar");
  assert.ok(after.body.permissions.includes("directory:write"),
    "registrar permissions must be live immediately after the switch");
});

test("switching to a role you do not hold is refused", async () => {
  const res = await request(server).post("/api/v1/auth/role/switch")
    .set(auth("dual")).send({ role: "super_admin" });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, "role_not_held");

  // …and the active role is untouched by the failed attempt.
  const after = await request(server).get("/api/v1/auth/session").set(auth("dual"));
  assert.equal(after.body.activeRole, "registrar");
});

test("a malformed role is a validation error, not a crash", async () => {
  const res = await request(server).post("/api/v1/auth/role/switch")
    .set(auth("dual")).send({ role: "" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
});

test("the switch is audited", async () => {
  const rows = await withActor(db, SERVICE, async (tx) =>
    tx.select().from(auditLog).where(eq(auditLog.action, "auth.role_switch")));
  assert.ok(rows.length >= 1, "expected at least one auth.role_switch audit row");
  const last = rows[rows.length - 1];
  assert.equal(last.afterJson?.role, "registrar",
    `audit row should name the role switched to, got ${JSON.stringify(last.afterJson)}`);
});

test("switching requires CSRF like every other mutation", async () => {
  const res = await request(server).post("/api/v1/auth/role/switch")
    .set("Cookie", jar("dual"))
    .send({ role: "teacher" });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "csrf_missing");
});
