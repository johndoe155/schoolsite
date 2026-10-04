import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import { todayIso } from "@/lib/dates";
import NextUp, { type NextItem } from "@/components/next-up";
import EmptyState from "@/components/empty-state";

interface Section { id: string; name: string; courseCode: string; courseTitle: string; status: string }

export default async function TeacherHome() {
  const session = await requireRole("teacher", "teacher_assistant");
  const res = await apiGet<{ data: Section[] }>("/sections");
  const sections = res?.data ?? [];
  const date = todayIso();
  const nextItems: NextItem[] = [];
  if (sections.length > 0) {
    nextItems.push({ label: "Take register", value: sections[0].name, href: `/teacher/attendance/${sections[0].id}?date=${date}` });
  }
  nextItems.push({ label: "Timetable", value: "This week", href: "/teacher/timetable" });
  return (
    <Shell session={session}>
      <header className="page-head">
        <span className="eyebrow">Teacher</span>
        <h1>My sections</h1>
        <p className="lede">
          {sections.length === 0
            ? "Sections appear here once the timetable is published."
            : `${sections.length} section${sections.length === 1 ? "" : "s"} · register, gradebook and classwork in one place.`}
        </p>
      </header>
      <NextUp items={nextItems} />
      {sections.length === 0 && (
        <EmptyState icon="▤" title="No sections assigned yet" action={<Link className="btn" href="/teacher/timetable">See your timetable</Link>}>
          Once the school publishes the timetable you will see every section you teach here.
        </EmptyState>
      )}
      <div className="grid cols2">
        {sections.map((s) => (
          <div className="card" key={s.id}>
            <h2>{s.name}</h2>
            <div className="muted">{s.courseCode} — {s.courseTitle}</div>
            <div className="row card-note">
              <Link className="btn" href={`/teacher/attendance/${s.id}?date=${date}`}>Attendance</Link>
              <Link className="btn ghost" href={`/teacher/gradebook/${s.id}`}>Gradebook</Link>
              <Link className="btn ghost" href={`/teacher/classwork/${s.id}`}>Classwork</Link>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "My sections" };
