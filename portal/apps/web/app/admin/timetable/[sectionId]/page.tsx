import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import { daysWithData, type Week } from "@/components/week-grid";
import SlotEditor from "@/components/slot-editor";
import BellScheduleForm from "@/components/bell-schedule-form";

interface SectionWeek {
  section: { id: string; name: string; termId: string };
  week: Week;
}

function hhmm(t: string) { return t?.slice(0, 5) ?? ""; }

export default async function AdminTimetableSection({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const session = await requireRole("school_admin", "super_admin", "registrar");
  const res = await apiGet<SectionWeek>(`/timetable/sections/${sectionId}`);

  if (!res) {
    return (
      <Shell session={session}>
        <h1>Timetable</h1>
        <div className="card err">That section could not be loaded.</div>
        <Link className="btn ghost" href="/admin/timetable">Back</Link>
      </Shell>
    );
  }

  const { section, week } = res;
  const days = daysWithData(week);

  return (
    <Shell session={session}>
      <h1>{section.name} — timetable</h1>
      <p className="muted">
        Assign a teacher and room to each period. A period left unassigned shows
        to students and staff as a free period.
      </p>

      <div className="row">
        <Link className="btn ghost" href="/admin/timetable">All sections</Link>
      </div>

      <BellScheduleForm termId={section.termId} week={week} />

      {days.length === 0 ? (
        <div className="card muted">
          This term has no periods yet. Open “Bell schedule” above to define the
          week before assigning teachers.
        </div>
      ) : (
        <div className="tt-week">
          {days.map((day) => (
            <section className="tt-day" key={day}>
              <h2>{day}</h2>
              <ul className="tt-list">
                {week[day].map((p) => {
                  const scheduled = !p.isBreak && Boolean(p.course ?? p.teacher ?? p.room);
                  const kind = p.isBreak ? "break" : scheduled ? "taught" : "free";
                  return (
                    <li className={`tt-slot tt-${kind}`} key={p.id}>
                      <div className="tt-time">
                        {p.label ? <span className="tt-label">{p.label}</span> : null}
                        <span>{hhmm(p.startsAt)}–{hhmm(p.endsAt)}</span>
                      </div>
                      <div className="tt-body">
                        {p.isBreak ? (
                          <span className="muted">{p.label ?? "Break"}</span>
                        ) : (
                          <>
                            <strong>{p.course ?? "Unassigned course"}</strong>
                            {p.teacher || p.room
                              ? <span className="muted">{[p.teacher, p.room].filter(Boolean).join(" · ")}</span>
                              : <span className="muted">Not assigned</span>}
                          </>
                        )}
                      </div>
                      <SlotEditor period={p} sectionId={section.id} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}
