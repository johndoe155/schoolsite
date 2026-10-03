import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import WeekGrid, { type Week } from "@/components/week-grid";

interface MeResponse { userId: string; week: Week }

/**
 * A teacher's own week across every section they teach.
 *
 * Before this existed a teacher could see *which* sections they had but not
 * *when* — the answer to "what do I have on Tuesday period 3" lived only in
 * the office. This page answers it from the same timetable the office edits.
 */
export default async function TeacherTimetable() {
  const session = await requireRole("teacher", "teacher_assistant");
  const res = await apiGet<MeResponse>("/timetable/me");
  const week = res?.week ?? {};

  // A teacher with periods defined but nothing assigned to them yet is a real
  // state worth saying out loud, rather than showing an empty page that reads
  // as "this does not work".
  const anyScheduled = Object.values(week).some((days) => (days ?? []).length > 0);

  return (
    <Shell session={session}>
      <h1>My timetable</h1>
      <p className="muted">
        Every period you are timetabled to teach, across all your sections.
      </p>
      {anyScheduled ? (
        <WeekGrid week={week} />
      ) : (
        <div className="card muted">
          Nothing is timetabled to you yet. If you expect to be teaching this
          term, the schedule has not been published.
        </div>
      )}
    </Shell>
  );
}
