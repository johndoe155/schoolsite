"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionView } from "@/lib/session";
import { api } from "@/lib/client";
import { clearDeviceData, listQueuedRegisters } from "@/lib/offline";
import { ROLE_HOME, roleLabel } from "@/lib/roles";
import { useSchoolName } from "@/lib/school-context";
import { TITLES, normalizePath } from "@/lib/nav";
import CommandPalette, { type PaletteItem } from "./command-palette";
import AccountMenu from "./account-menu";
import { toggleTheme } from "./theme-controls";

interface Tab { href: string; label: string; perm?: string }

/**
 * Navigation is keyed by AREA (admin/teacher/student/parent), but a session
 * carries a ROLE ("school_admin", "registrar", "auditor", …). Indexing the
 * tab table directly with the role silently fell through to the student tabs,
 * so every administrator saw "Dashboard | Grades" and had no way to reach the
 * admin console at all. Roles are mapped to their area explicitly here.
 */
const ROLE_AREA: Record<string, string> = {
  super_admin: "admin", school_admin: "admin", registrar: "admin",
  auditor: "admin", counselor: "admin",
  teacher: "teacher", teacher_assistant: "teacher",
  student: "student", parent: "parent",
};

/**
 * `perm` hides a tab the role cannot use. An auditor has audit:read but not
 * fees:read, and a link that only ever produces "Forbidden" is worse than no
 * link — it looks like something is broken.
 */
const TABS: Record<string, Tab[]> = {
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users", perm: "directory:read" },
    { href: "/admin/students", label: "Students", perm: "directory:read" },
    { href: "/admin/sections", label: "Sections", perm: "academics:read" },
    { href: "/admin/academics", label: "Academics", perm: "academics:read" },
    { href: "/admin/timetable", label: "Timetable", perm: "schedule:read" },
    { href: "/admin/fees", label: "Fees", perm: "fees:read" },
    { href: "/admin/transport", label: "Transport", perm: "transport:read" },
    { href: "/admin/import", label: "Import", perm: "directory:write" },
    { href: "/admin/reports", label: "Reports", perm: "directory:read" },
    { href: "/admin/notifications", label: "Email", perm: "audit:read" },
    { href: "/admin/audit", label: "Activity log", perm: "audit:read" },
    { href: "/admin/retention", label: "Retention", perm: "settings:write" },
    { href: "/admin/school", label: "School", perm: "settings:write" },
  ],
  teacher: [
    { href: "/teacher", label: "Sections" },
    { href: "/teacher/timetable", label: "My timetable" },
    { href: "/teacher/messages", label: "Messages" },
  ],
  student: [
    { href: "/student", label: "Dashboard" },
    { href: "/student/timetable", label: "Timetable" },
    { href: "/student/classwork", label: "Homework" },
    { href: "/student/grades", label: "Grades" },
  ],
  parent: [{ href: "/parent", label: "Children" }, { href: "/parent/messages", label: "Messages" }],
};

/**
 * The phone bottom bar holds four thumb targets plus "More". Which four is a
 * product decision, not an alphabetical one: the admin console repeats 14
 * links into a `flex:1` bar and each one collapsed to about 25px wide at a
 * 360px viewport — technically present, practically unusable. Everything not
 * here stays reachable on a phone through "More" → the command palette, which
 * lists every permitted destination with its full name.
 */
const MOBILE_ORDER: Record<string, string[]> = {
  admin: ["/admin", "/admin/students", "/admin/timetable", "/admin/fees", "/admin/users", "/admin/academics", "/admin/reports"],
  teacher: ["/teacher", "/teacher/timetable", "/teacher/messages"],
  student: ["/student", "/student/timetable", "/student/classwork", "/student/grades"],
  parent: ["/parent", "/parent/messages"],
};

/**
 * The four phone targets, chosen from the tabs this role can actually use — an
 * auditor has no `fees:read`, so a fixed list would have quietly produced three
 * tabs plus More. Preference order first, then whatever else survived, so the
 * bar is always full and never shows a link the role cannot open.
 */
function mobilePrimaryFor(area: string, hrefs: string[]): Set<string> {
  const preferred = (MOBILE_ORDER[area] ?? []).filter((h) => hrefs.includes(h));
  const rest = hrefs.filter((h) => !preferred.includes(h));
  return new Set([...preferred, ...rest].slice(0, 4));
}

export default function Shell({ session, children }: { session: SessionView; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const area = ROLE_AREA[session.activeRole] ?? "student";
  const perms = new Set(session.permissions ?? []);
  const tabs = (TABS[area] ?? []).filter((t) => !t.perm || perms.has(t.perm));
  const mobilePrimary = mobilePrimaryFor(area, tabs.map((t) => t.href));
  const otherRoles = session.roles.filter((r) => r !== session.activeRole);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const here = normalizePath(pathname ?? "/");

  async function switchRole(role: string) {
    if (switching || role === session.activeRole) return;
    setSwitching(true); setSwitchError("");
    try {
      await api("/auth/role/switch", { method: "POST", body: JSON.stringify({ role }) });
      // The new role's permissions only reach this component through a fresh
      // server render, and staying on /teacher as a student would 403 — so go
      // to the new role's home first, then refresh.
      router.push(ROLE_HOME[role] ?? "/");
      router.refresh();
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : "Could not switch role.");
    } finally {
      setSwitching(false);
    }
  }

  /* The brand comes from the root layout (school settings, public endpoint)
     rather than a client fetch: it is in the first byte of HTML, so the topbar
     never flashes the generic name, and the browser makes one request fewer. */
  const brand = useSchoolName();

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); }
    finally {
      /* A staffroom device changes hands. Anything this account left on it —
         queued registers, class lists — goes with the sign-out, unless it has
         not been sent yet, in which case the device keeps it and says so on
         the offline screen. */
      const queued = await listQueuedRegisters().catch(() => []);
      if (queued.length === 0) await clearDeviceData().catch(() => {});
      router.push("/login"); router.refresh();
    }
  }

  /* ── Command palette inventory ────────────────────────────────────────────
     Every destination the account may reach, the account pages that
     previously existed only as URLs, and the actions that otherwise require
     hunting through the topbar. */
  const items: PaletteItem[] = [
    ...tabs.map((t) => ({
      id: `go-${t.href}`,
      label: TITLES[t.href] ?? t.label,
      group: "Go to",
      keywords: `${t.label} ${area}`,
      href: t.href,
    })),
    { id: "account-emails", label: "Email preferences", group: "Account", hint: "notices", keywords: "notifications unsubscribe", href: "/account/notifications" },
    { id: "account-password", label: "Password", group: "Account", keywords: "security change", href: "/account/password" },
    { id: "mfa", label: "Two-factor sign-in", group: "Account", keywords: "mfa 2fa authenticator", href: "/mfa" },
    ...otherRoles.map((r) => ({
      id: `role-${r}`,
      label: `Switch to ${roleLabel(r)}`,
      group: "Account",
      keywords: `role ${r}`,
      run: () => switchRole(r),
    })),
    { id: "action-theme", label: "Toggle dark theme", group: "Actions", keywords: "light dark appearance night", run: () => { toggleTheme(); } },
    { id: "action-website", label: "Open the school website", group: "Actions", keywords: "public marketing home", run: () => { window.location.href = "/"; } },
    { id: "action-signout", label: "Sign out", group: "Actions", keywords: "log out exit", run: () => { void logout(); } },
  ];

  return (
    <>
      <header className="topbar">
        {/* INTEGRATION: plain <a>, not next/link — the marketing site sits
            OUTSIDE basePath, so <Link> would wrongly prefix it to /portal/. */}
        <a className="site-link" href="/">← Website</a>
        <Link className="brand" href={ROLE_HOME[session.activeRole] ?? "/"}>{brand}</Link>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost search-btn"
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <span aria-hidden="true">⌕</span>
          <span className="search-label">Search</span>
          <span className="kbd" aria-hidden="true">⌘K</span>
        </button>
        {otherRoles.length === 0 ? (
          <span className="muted role-label">{roleLabel(session.activeRole)}</span>
        ) : (
          <label className="role-switch">
            <span className="muted role-label">Role</span>
            <select
              value={session.activeRole}
              disabled={switching}
              onChange={(e) => switchRole(e.target.value)}
              aria-label="Switch role"
            >
              {session.roles.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </label>
        )}
        <AccountMenu
          displayName={session.displayName}
          email={session.email}
          role={session.activeRole}
          onSignOut={() => void logout()}
        />
      </header>
      <div className="container">
        {session.mfaGraceUntil && (
          /* Grace is dated and self-closing. Somebody has to be told the date
             before the morning it shuts, or the first they know of it is a
             sign-in that stops working. */
          <div className="alert warn" role="status" style={{ marginTop: 12 }}>
            <strong>Set up two-factor sign-in.</strong>{" "}
            Your account has no second factor yet. Staff sign-in without one stops working after{" "}
            {new Date(session.mfaGraceUntil).toLocaleDateString(undefined,
              { day: "numeric", month: "long", year: "numeric" })}.{" "}
            Ask the office for an enrolment token, then <Link href="/mfa">set it up</Link>.
          </div>
        )}
        <nav className="tabbar" aria-label="Primary">
          {tabs.map((t) => {
            const current = here === t.href || here.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={[current ? "on" : "", mobilePrimary.has(t.href) ? "" : "tab-wide"].filter(Boolean).join(" ")}
                aria-current={current ? "page" : undefined}
              >
                {t.label}
              </Link>
            );
          })}
          {/* The phone-only escape hatch: four tabs can never cover an admin
              console, so the fifth target opens the palette with the rest. */}
          <button type="button" className="tab-more" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog">
            More
          </button>
        </nav>
        {switchError && (
          <div className="alert err" role="alert" style={{ marginTop: 12 }}>{switchError}</div>
        )}
        {children}
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={items} />
    </>
  );
}
