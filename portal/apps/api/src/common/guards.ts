import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { config } from "../config";

export const PERM_KEY = "portal.perm";
export const Perm = (perm: string) => SetMetadata(PERM_KEY, perm);

/** review-2 #7: marks an endpoint as a deliberate parent-writable exception
 *  (fees:pay). The parent read-only invariant still blocks everything else. */
export const PARENT_WRITE_KEY = "portal.parentWrite";
export const ParentWrite = () => SetMetadata(PARENT_WRITE_KEY, true);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Double-submit CSRF on mutations (Phase 3 §1.1). /auth/* exempt
 * (rate-limited); /webhooks/* exempt — gateway callbacks carry their own HMAC
 * signature instead, as does the RFC 8058 one-click unsubscribe, which a mail
 * client POSTs with no cookies at all.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!MUTATING.has(req.method as string)) return true;
    const path = req.path as string;
    if (path.startsWith("/api/v1/webhooks")) return true;
    /* /auth/* used to be exempt wholesale, on the reasoning that those
       endpoints are rate-limited. That holds for the pre-authentication ones —
       login, forgot, reset, SSO callback — where no session cookie exists yet
       and there is nothing to double-submit. It does not hold for the
       endpoints under /auth that run *inside* a session: role/switch in
       particular is an ordinary authenticated mutation, and the blanket
       exemption meant any future /auth route would inherit no CSRF protection
       by accident. Gate on whether a session exists rather than on the path. */
    if (path.startsWith("/api/v1/auth") && !req.cookies?.[config.sidCookie]) return true;
    if (path === "/api/v1/notifications/unsubscribe") return true;
    const header = req.headers["x-csrf"];
    const cookie = req.cookies?.[config.csrfCookie];
    if (!header || !cookie || header !== cookie) {
      throw new ForbiddenException({ code: "csrf_missing", title: "CSRF token missing or mismatch" });
    }
    return true;
  }
}

/** Capability gate (gate 1a) + parent read-only invariant (Phase 3 §1.7). RLS remains gate 2. */
@Injectable()
export class PermGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const p = req.principal;
    const perm = this.reflector.getAllAndOverride<string | undefined>(PERM_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    const parentWrite = this.reflector.getAllAndOverride<boolean | undefined>(PARENT_WRITE_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (p && p.activeRole === "parent" && MUTATING.has(req.method as string) && !parentWrite) {
      throw new ForbiddenException({ code: "parent_read_only", title: "Parent accounts are read-only" });
    }
    if (perm) {
      if (!p) throw new UnauthorizedException({ code: "unauthenticated" });
      if (!p.perms.includes(perm)) {
        throw new ForbiddenException({ code: "missing_capability", detail: `requires ${perm}` });
      }
    }
    return true;
  }
}
