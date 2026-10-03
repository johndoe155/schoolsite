import "reflect-metadata";
import { NestFactory, Reflector } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json as expressJson } from "express";
import { AppModule } from "./app.module";
import { config } from "./config";
import type { Db } from "./db/client";
import { makeSessionMiddleware } from "./common/session.middleware";
import { ProblemFilter } from "./common/problem";
import { CsrfGuard, PermGuard } from "./common/guards";
import { startWorker } from "./notify/notify.service";
import { startRetentionLoop } from "./retention/retention.service";

export async function createApp(db: Db) {
  // bodyParser:false + manual express.json with `verify` — the webhook route
  // needs the untouched bytes for Paystack's HMAC-SHA512 signature check.
  const app = await NestFactory.create(AppModule.register(db),
    { logger: process.env.LOG_LEVEL === "debug" ? ["error", "warn", "log"] : ["error", "warn"],
      bodyParser: false });
  const express = app.getHttpAdapter().getInstance();

  // Behind a load balancer: trust the configured number of proxies so req.ip
  // is the real client (rate limiting + audit depend on it).
  if (config.trustProxy) express.set("trust proxy", config.trustProxy);

  // Security headers. This is a JSON API: lock everything down, no CSP relaxations.
  express.use(helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
  }));

  express.use(expressJson({
    limit: "1mb",
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  express.use(cookieParser());
  express.use(makeSessionMiddleware(db));
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalGuards(new CsrfGuard(), new PermGuard(new Reflector()));
  await app.init();
  // dev/single-node: outbox worker runs in-process (unref'd interval).
  // production: WORKER_INPROC=false + `npm run worker` beside real Postgres.
  const timers: Array<() => void> = [];
  if (process.env.WORKER_INPROC !== "false") {
    timers.push(startWorker(db));
    // The retention purge rides along in single-node deployments; with a
    // separate worker process it lives there instead.
    timers.push(startRetentionLoop(db));
  }
  /* Shutdown hooks used to be registered only in the in-process-worker branch,
     which meant production (WORKER_INPROC=false) had none: SIGTERM killed the
     process mid-request and mid-transaction. Register them unconditionally. */
  app.enableShutdownHooks?.();
  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} — shutting down`);
    for (const stop of timers) { try { stop(); } catch { /* already stopped */ } }
    // Nest's own hook closes the HTTP server; give it a moment, then exit.
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("beforeExit", () => { for (const stop of timers) { try { stop(); } catch { /* noop */ } } });
  return app;
}
