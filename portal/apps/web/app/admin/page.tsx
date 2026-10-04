import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import SystemStatus from "./system-status";
import NextUp, { type NextItem } from "@/components/next-up";
import EmptyState from "@/components/empty-state";

interface Section { id: string; name: string; courseCode: string; courseTitle: string }
interface UsersRes { meta: { total: number } }

export default async function AdminHome() {
  const session = await requireRole("super_admin", "school_admin", "registrar", "counselor", "auditor");
  const [sections, users] = await Promise.all([
    apiGet<{ data: Section[] }>("/sections"),
    apiGet<UsersRes>("/users?per=1"),
  ]);
  const nextItems: NextItem[] = [
    { label: "People", value: `${users?.meta.total ?? 0} on roll`, href: "/admin/users" },
    { label: "Course sections", value: `${sections?.data.length ?? 0}`, href: "/admin/sections" },
    { label: "Term reports", value: "Reports", href: "/admin/reports" },
  ];
  return (
    <Shell session={session}>
      <header className="page-head">
        <span className="eyebrow">Administration</span>
        <h1>Admin console</h1>
        <p className="lede">Live counts, then the shortest path to the work that is waiting.</p>
      </header>
      <NextUp items={nextItems} />
      <SystemStatus />
      <div className="grid cols3">
        <div className="stat"><div className="muted">People</div><div className="n">{users?.meta.total ?? "—"}</div></div>
        <div className="stat"><div className="muted">Course sections</div><div className="n">{sections?.data.length ?? "—"}</div></div>
        <div className="stat"><div className="muted">Your role</div><div className="n text">{session.activeRole.replace("_", " ")}</div></div>
      </div>
      <div className="card">
        <h2>Course sections</h2>
        {(sections?.data.length ?? 0) === 0 ? (
          <EmptyState icon="▤" title="No course sections yet">
            Create sections in Academics, then build the timetable from them.
          </EmptyState>
        ) : sections?.data.map((s) => (
          <div key={s.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <strong>{s.name}</strong><span className="muted">{s.courseCode} — {s.courseTitle}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <Link className="btn" href="/admin/users">User directory</Link>
        <Link className="btn ghost" href="/admin/sections">All sections</Link>
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Overview" };
