/**
 * One week of a timetable, laid out day by day.
 *
 * Three states have to be visibly different, and the third is the one that
 * usually gets lost: a taught period, a break, and a free period. Rendering a
 * free period as an empty box is fine; rendering it like a break is not, and
 * hiding it makes the week look finished when it is not.
 */
export interface Period {
  id: string;
  index: number;
  label?: string | null;
  startsAt: string;
  endsAt: string;
  isBreak: boolean;
  /** Only present when something is scheduled here. */
  course?: string | null;
  courseId?: string | null;
  teacher?: string | null;
  room?: string | null;
  section?: string | null;
}

export type Week = Record<string, Period[]>;

/** "08:00:00" → "08:00". Postgres returns time as HH:MM:SS. */
function hhmm(t: string): string {
  return t?.slice(0, 5) ?? "";
}

/** Only the days that actually have periods, in weekday order. */
export function daysWithData(week: Week): string[] {
  const ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return ORDER.filter((d) => (week[d]?.length ?? 0) > 0);
}

export default function WeekGrid({ week }: { week: Week }) {
  const days = daysWithData(week);

  if (days.length === 0) {
    return (
      <div className="card muted">
        No periods have been defined for this term yet. Once the bell schedule
        is set, the week appears here.
      </div>
    );
  }

  return (
    <div className="tt-week">
      {days.map((day) => (
        <section className="tt-day" key={day}>
          <h2>{day}</h2>
          <ul className="tt-list">
            {week[day].map((p) => {
              const scheduled = p.isBreak ? false : Boolean(p.course ?? p.teacher ?? p.room);
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
                    ) : scheduled ? (
                      <>
                        <strong>{p.course ?? "Unassigned course"}</strong>
                        <span className="muted">
                          {[p.teacher, p.room].filter(Boolean).join(" · ") || "no teacher"}
                        </span>
                        {p.section ? <span className="muted">{p.section}</span> : null}
                      </>
                    ) : (
                      <span className="muted">Free period</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
