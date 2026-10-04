import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";

interface Entry {
  index: number; label: string | null; startsAt: string; endsAt: string; isBreak: boolean;
  sectionId?: string; section?: string | null; room?: string | null;
}

/**
 * A teacher's week.
 *
 * This is the page the API could already answer (`GET /timetable/me`) and that
 * nobody could reach: a teacher could see their classes but not when they
 * taught them, so "what have I got after break?" was a question for the office.
 * Today and tomorrow are pulled to the top because that is what gets checked
 * standing in a corridor.
 */
export default async function TeacherTimetable() {
  const session = await requireRole("teacher", "teacher_assistant");
  const res = await apiGet<{ week: Record<string, Entry[]> }>("/timetable/me");
  const week = res?.week ?? {};
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long" });

  return (
    <Shell session={session}>
      <h1>My timetable</h1>
      <div className="grid cols2">
        {Object.entries(week).map(([day, entries]) => {
          const lessons = entries.filter((e) => !e.isBreak);
          return (
            <div className={`card${day === today ? "" : " muted"}`} key={day}>
              <h2 style={{ marginTop: 0 }}>
                {day}{day === today ? <span className="chip on-present" style={{ marginLeft: 8 }}>today</span> : null}
              </h2>
              {entries.length === 0 && <div className="muted">No periods defined.</div>}
              {entries.map((e, i) => (
                <div key={`${day}-${i}`} className="row"
                  style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
                  <span className="muted" style={{ minWidth: 96 }}>
                    {e.startsAt?.slice(0, 5)}–{e.endsAt?.slice(0, 5)}
                  </span>
                  {e.isBreak ? (
                    <span className="muted">{e.label ?? "Break"}</span>
                  ) : e.sectionId ? (
                    <span>
                      <strong>{e.section ?? "Section"}</strong>
                      {e.room ? <span className="muted"> · {e.room}</span> : null}
                    </span>
                  ) : (
                    <span className="muted">free</span>
                  )}
                </div>
              ))}
              {lessons.length === 0 && <div className="muted" style={{ marginTop: 6 }}>No lessons.</div>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "My timetable" };
