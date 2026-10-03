import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";

interface Section { id: string; name: string; courseCode: string; courseTitle: string; status: string }

/**
 * Pick a section to timetable. Sections rather than terms, because the bell
 * schedule is set once per term and reused; what changes week to week is which
 * teacher is in which room for which section.
 */
export default async function AdminTimetable() {
  const session = await requireRole("school_admin", "super_admin", "registrar");
  const res = await apiGet<{ data: Section[] }>("/sections");
  const sections = res?.data ?? [];

  return (
    <Shell session={session}>
      <h1>Timetable</h1>
      <p className="muted">
        Choose a section to see and edit its week. The bell schedule is defined
        per term and shared by every section in it.
      </p>
      {sections.length === 0 ? (
        <div className="card muted">No sections exist yet.</div>
      ) : (
        <div className="grid cols2">
          {sections.map((s) => (
            <div className="card" key={s.id}>
              <h2 style={{ marginTop: 0 }}>{s.name}</h2>
              <div className="muted">{s.courseCode} — {s.courseTitle}</div>
              <div className="row" style={{ marginTop: 10 }}>
                <Link className="btn" href={`/admin/timetable/${s.id}`}>Open week</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
