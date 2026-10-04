import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";

interface Entry {
  index: number; label: string | null; startsAt: string; endsAt: string; isBreak: boolean;
  section?: string | null; course?: string | null; courseCode?: string | null;
  teacher?: string | null; room?: string | null;
}

export default async function StudentTimetable() {
  const session = await requireRole("student");
  const res = await apiGet<{ week: Record<string, Entry[]> }>(`/timetable/students/${session.userId}`);
  const week = res?.week ?? {};
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <Shell session={session}>
      <h1>My timetable</h1>
      <div className="grid cols2">
        {Object.entries(week).map(([day, entries]) => (
          <div className={`card${day === today ? "" : " muted"}`} key={day}>
            <h2 style={{ marginTop: 0 }}>
              {day}{day === today ? <span className="chip on-present" style={{ marginLeft: 8 }}>today</span> : null}
            </h2>
            {entries.length === 0 && <div className="muted">Nothing scheduled.</div>}
            {entries.map((e, i) => (
              <div key={`${day}-${i}`} className="row"
                style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
                <span className="muted" style={{ minWidth: 96 }}>
                  {e.startsAt?.slice(0, 5)}–{e.endsAt?.slice(0, 5)}
                </span>
                {e.isBreak ? (
                  <span className="muted">{e.label ?? "Break"}</span>
                ) : e.section ? (
                  <span>
                    <strong>{e.course ?? e.section}</strong>
                    <span className="muted">
                      {e.teacher ? ` · ${e.teacher}` : ""}{e.room ? ` · ${e.room}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="muted">free</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Timetable" };
