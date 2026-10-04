import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import TimetableBuilder from "./timetable-builder";

interface Term { id: string; name: string; academicYearId: string; termNo: number }
interface Period {
  id: string; weekday: number; periodIndex: number; label: string | null;
  startsAt: string; endsAt: string; isBreak: boolean;
}
interface Section { id: string; name: string; code: string; title: string }
interface Slot {
  id: string; periodId: string; sectionId: string; sectionName: string | null;
  courseTitle: string | null; teacherUserId: string | null; teacherName: string | null; room: string | null;
}
interface Teacher { id: string; name: string }

export default async function AdminTimetablePage({ searchParams }: {
  searchParams: Promise<{ term?: string }>;
}) {
  const session = await requireRole("super_admin", "school_admin", "registrar");
  const sp = await searchParams;

  const termsRes = await apiGet<{ data: Term[] }>("/terms");
  const terms = termsRes?.data ?? [];
  const termId = sp.term && terms.some((t) => t.id === sp.term) ? sp.term : terms[0]?.id;

  const [grid, teachers] = await Promise.all([
    termId ? apiGet<{ periods: Period[]; sections: Section[]; slots: Slot[] }>(`/timetable/terms/${termId}`) : Promise.resolve(null),
    apiGet<{ id: string; name: string }[]>("/timetable/teachers"),
  ]);

  return (
    <Shell session={session}>
      {terms.length === 0 ? (
        <div className="card muted">
          No terms exist yet. Create the academic year and its terms on the{" "}
          <Link href="/admin/academics">Academics</Link> page first — a timetable
          belongs to a term.
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <label htmlFor="term" className="muted">Term</label>
            <form method="get">
              <select id="term" name="term" defaultValue={termId} >
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>Term {t.termNo} — {t.name}</option>
                ))}
              </select>
              <noscript><button className="btn" type="submit">Show</button></noscript>
            </form>
          </div>
          {termId && (
            <TimetableBuilder
              termId={termId}
              termName={terms.find((t) => t.id === termId)?.name ?? ""}
              periods={grid?.periods ?? []}
              sections={grid?.sections ?? []}
              slots={grid?.slots ?? []}
              teachers={teachers ?? []}
            />
          )}
        </>
      )}
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Timetable" };
