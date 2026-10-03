#!/usr/bin/env node
/**
 * Run the portal's two processes side by side.
 *
 *   npm run portal
 *
 * The portal is a Next.js app (:3000) in front of a NestJS API (:8080). The
 * main site's server.js is the public door on :4040 and proxies /portal to
 * these two — see PORTAL-INTEGRATION-PLAN.md §2.1. Nothing here is exposed to
 * the network on its own; run `npm start` alongside this.
 *
 * Prereqs (once):   npm run portal:install && npm run portal:build
 *
 * These are DEVELOPMENT defaults. Production needs real values — DATABASE_URL
 * in particular, without which apps/api/src/db/client.ts refuses to boot
 * rather than silently falling back to in-memory PGlite.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const PUBLIC_ORIGIN = process.env.PUBLIC_WEB_ORIGIN || `http://localhost:${process.env.PORT || 4040}/portal`;

/* Every emailed link and the Paystack callback_url are built from
   PUBLIC_WEB_ORIGIN, and it must carry the /portal basePath or recipients land
   on a 404. It also has to be set on the worker, not just the API. */
const API_ENV = {
  ...process.env,
  PORT: process.env.PORTAL_API_PORT || '8080',
  SEED_DEMO: process.env.SEED_DEMO ?? 'true',
  COOKIE_SECURE: process.env.COOKIE_SECURE ?? 'false',
  SMTP_VERIFY_ON_BOOT: process.env.SMTP_VERIFY_ON_BOOT ?? 'false',
  TRUST_PROXY: process.env.TRUST_PROXY ?? '1',        // one hop: server.js → api
  PUBLIC_WEB_ORIGIN: PUBLIC_ORIGIN,
  /* File-backed PGlite so the demo roster survives a restart. Ignored by
     portal/.gitignore (`data/`). Unset it for a throwaway in-memory DB. */
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR ?? path.join(ROOT, 'portal', 'data', 'pglite'),
  /* Dev-only Paystack wiring: apps/web/test/smoke.mjs starts a mock gateway on
     :9311 and asserts a real Initialize round-trip plus a signed webhook.
     Without these the fee-payment smoke checks cannot run. A real deployment
     sets PAYSTACK_SECRET_KEY to an sk_live_ key instead. */
  PAYSTACK_SECRET: process.env.PAYSTACK_SECRET ?? 'sk_test_dev_secret',
  PAYSTACK_API_BASE: process.env.PAYSTACK_API_BASE ?? 'http://127.0.0.1:9311',
};

const WEB_ENV = {
  ...process.env,
  PORT: process.env.PORTAL_WEB_PORT || '3000',
  API_INTERNAL: process.env.API_INTERNAL || 'http://127.0.0.1:8080',
  PUBLIC_WEB_ORIGIN: PUBLIC_ORIGIN,
};

/* PGlite calls mkdirSync WITHOUT { recursive: true }, so it fails with ENOENT
   if the parent is missing. Create the whole path here. */
if (API_ENV.PGLITE_DATA_DIR && !process.env.DATABASE_URL) {
  fs.mkdirSync(API_ENV.PGLITE_DATA_DIR, { recursive: true });
}

const targets = [
  { name: 'api', cmd: process.execPath, args: [path.join('portal', 'apps', 'api', 'dist', 'main.js')], env: API_ENV },
  { name: 'web', cmd: 'npm',            args: ['run', 'start', '--prefix', path.join('portal', 'apps', 'web')], env: WEB_ENV },
];

const kids = [];
let shuttingDown = false;

function tag(name, chunk) {
  process.stdout.write(String(chunk).split('\n').filter(Boolean)
    .map((l) => `[portal:${name}] ${l}\n`).join(''));
}

for (const t of targets) {
  /* detached: the child leads its own process group. `npm run start` spawns
     next-server as a grandchild, and SIGTERM to npm does NOT reach it — without
     the group kill a stray next-server keeps holding :3000 after we shut down. */
  const child = spawn(t.cmd, t.args, { cwd: ROOT, env: t.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (c) => tag(t.name, c));
  child.stderr.on('data', (c) => tag(t.name, c));
  child.on('exit', (code, signal) => {
    console.log(`[portal:${t.name}] exited (code=${code} signal=${signal})`);
    if (!shuttingDown) shutdown(code ?? 1);   // if one dies, take the other down
  });
  kids.push(child);
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const k of kids) {
    try { process.kill(-k.pid, 'SIGTERM'); }          // whole group, not just npm
    catch { try { k.kill('SIGTERM'); } catch { /* already gone */ } }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`[portal] api → :${API_ENV.PORT}   web → :${WEB_ENV.PORT}   public origin → ${PUBLIC_ORIGIN}`);
console.log('[portal] start the site with `npm start` — it proxies /portal on :' + (process.env.PORT || 4040));
