/**
 * Route vocabulary — one place where a path becomes a human label.
 *
 * Three things read this: the `metadata.title` each page exports (so the
 * browser tab and the screen-reader title agree), <RouteAnnouncer> (which
 * announces the new page after a client-side navigation) and the command
 * palette (which lists destinations by name). Keeping one table means those
 * three can never disagree about what a page is called.
 */
export const TITLES: Record<string, string> = {
  "/": "School Portal",
  "/login": "Sign in",
  "/forgot": "Reset password",
  "/reset": "Choose a new password",
  "/invite": "Accept invitation",
  "/change": "Change password",
  "/mfa": "Two-factor sign-in",
  "/offline-register": "Offline register",
  "/parent/verify": "Verify your account",
  "/fees/return": "Payment result",

  "/legal/privacy": "Privacy notice",
  "/legal/retention": "Retention schedule",
  "/legal/terms": "Terms of use",

  "/account/notifications": "Email preferences",
  "/account/password": "Password",

  "/admin": "Overview",
  "/admin/users": "Users",
  "/admin/students": "Students",
  "/admin/sections": "Sections",
  "/admin/academics": "Academics",
  "/admin/timetable": "Timetable",
  "/admin/fees": "Fees",
  "/admin/transport": "Transport",
  "/admin/import": "Import",
  "/admin/reports": "Reports",
  "/admin/notifications": "Email",
  "/admin/audit": "Activity log",
  "/admin/retention": "Retention",
  "/admin/school": "School settings",

  "/teacher": "My sections",
  "/teacher/timetable": "My timetable",
  "/teacher/messages": "Messages",

  "/student": "Dashboard",
  "/student/timetable": "Timetable",
  "/student/classwork": "Homework",
  "/student/grades": "Grades",

  "/parent": "Children",
  "/parent/messages": "Messages",
};

/** Dynamic routes, matched segment by segment so `/parent/ada` is "Child overview". */
const PATTERNS: [string, string][] = [
  ["/print/fees/[studentId]", "Fee statement"],
  ["/print/report-card/[studentId]", "Report card"],
  ["/admin/users/[id]", "User"],
  ["/teacher/messages/[threadId]", "Message"],
  ["/teacher/attendance/[sectionId]", "Take register"],
  ["/teacher/gradebook/[sectionId]", "Gradebook"],
  ["/teacher/classwork/[sectionId]", "Classwork"],
  ["/parent/messages/[threadId]", "Message"],
  ["/parent/[childId]", "Child overview"],
];

/** Strip the deploy basePath so "/portal/admin" and "/admin" are one path. */
export function normalizePath(pathname: string): string {
  const clean = pathname.replace(/^\/portal(?=\/|$)/, "");
  return clean === "" ? "/" : clean;
}

function matchesPattern(pattern: string, path: string): boolean {
  const p = pattern.split("/");
  const q = path.split("/");
  if (p.length !== q.length) return false;
  return p.every((seg, i) => seg.startsWith("[") || seg === q[i]);
}

export function titleFor(pathname: string): string | undefined {
  const clean = normalizePath(pathname);
  if (TITLES[clean]) return TITLES[clean];
  const hit = PATTERNS.find(([pattern]) => matchesPattern(pattern, clean));
  return hit?.[1];
}

/** "Fees · Birch International College" — the title format used everywhere. */
export function documentTitle(pathname: string, schoolName: string): string {
  const label = titleFor(pathname);
  return label ? `${label} · ${schoolName}` : schoolName;
}
