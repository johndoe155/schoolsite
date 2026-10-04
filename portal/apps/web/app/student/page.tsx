import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import NextUp, { type NextItem } from "@/components/next-up";
import EmptyState from "@/components/empty-state";

interface GradeRow { id: string; label: string; points: string; maxPoints: string; sourceType: string; releasedAt: string }
interface AttRow { date: string; status: string; sectionId: string; note: string | null }
interface ExamRow { id: string; title: string; examDate: string; maxScore: string }
interface Transport { assignment: { id: string }; route: { name: string; driverName: string | null }; stop: { name: string; pickupTime: string | null } | null }
interface Invoice { id: string; label: string; amountKobo: number; status: string; dueDate: string | null }

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default async function StudentHome() {
  const session = await requireRole("student");
  const [g, a, ex, tr, fees] = await Promise.all([
    apiGet<{ data: GradeRow[] }>("/student/grades"),
    apiGet<{ data: AttRow[] }>("/student/attendance"),
    apiGet<{ data: ExamRow[] }>("/student/exams"),
    apiGet<{ data: Transport | null }>("/student/transport"),
    apiGet<{ data: { invoices: Invoice[] } }>("/fees/my"),
  ]);
  const grades = g?.data ?? [];
  const att = a?.data ?? [];
  const exams = [...(ex?.data ?? [])].sort((x, y) => x.examDate.localeCompare(y.examDate));
  const transport = tr?.data;
  const invoices = fees?.data.invoices ?? [];
  const counts = ["present", "late", "absent", "excused"].map((st) => ({
    st, n: att.filter((r) => r.status === st).length,
  }));
  const latest = [...grades].sort((x, y) => (y.releasedAt ?? "").localeCompare(x.releasedAt ?? "")).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const nextExam = exams.find((e) => e.examDate >= today);
  const unpaid = invoices.find((i) => i.status !== "paid");
  const attendanceRate = att.length
    ? Math.round((att.filter((r) => r.status === "present" || r.status === "late").length / att.length) * 100)
    : null;
  /* "What now?" — built from the fetches above, so the strip costs no extra
     request and cannot disagree with the cards below it. */
  const nextItems: NextItem[] = [];
  if (nextExam) nextItems.push({ label: "Next exam", value: `${nextExam.title} · ${nextExam.examDate}`, href: "/student/timetable" });
  if (unpaid) nextItems.push({ label: "Fees due", value: naira(unpaid.amountKobo), href: `/print/fees/${session.userId}` });
  if (attendanceRate !== null) nextItems.push({ label: "Attendance", value: `${attendanceRate}% present` });

  return (
    <Shell session={session}>
      <header className="page-head">
        <span className="eyebrow">Student</span>
        <h1>Hello, {session.displayName.split(" ")[0]}</h1>
        <p className="lede">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos",
          })}
        </p>
      </header>
      <NextUp items={nextItems} />
      <div className="grid cols2">
        {counts.map(({ st, n }) => (
          <div className="stat" key={st}><div className="muted">{st}</div><div className="n">{n}</div></div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Latest released grades</h2>
        {latest.length === 0 ? (
          <EmptyState icon="◎" title="No grades released yet">
            Grades appear here the moment a teacher releases them.
          </EmptyState>
        ) : (
          <table>
            <thead><tr><th>Label</th><th>Type</th><th>Points</th><th>Released</th></tr></thead>
            <tbody>
              {latest.map((gr) => (
                <tr key={gr.id}><td>{gr.label}</td><td>{gr.sourceType}</td>
                  <td>{gr.points} / {gr.maxPoints}</td><td>{gr.releasedAt.slice(0, 10)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Upcoming exams</h2>
        {exams.length === 0 ? (
          <EmptyState icon="▤" title="No exams scheduled">
            Exam dates appear here once the timetable is published.
          </EmptyState>
        ) : (
          <table>
            <thead><tr><th>Exam</th><th>Date</th><th>Max</th></tr></thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}><td>{e.title}</td><td>{e.examDate}</td><td>{e.maxScore}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>School transport</h2>
        {!transport ? (
          <EmptyState icon="◫" title="No transport assignment">
            The school office sets up bus routes; they will show here when assigned.
          </EmptyState>
        ) : (
          <div>
            <div><strong>{transport.route.name}</strong></div>
            <div className="muted">
              {transport.route.driverName ? `Driver: ${transport.route.driverName}` : ""}
              {transport.stop ? ` · Stop: ${transport.stop.name}${transport.stop.pickupTime ? ` at ${transport.stop.pickupTime}` : ""}` : ""}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Fees</h2>
          {invoices.length > 0 ? (
            <Link className="btn ghost" href={`/print/fees/${session.userId}`}>
              Receipts &amp; statement
            </Link>
          ) : null}
        </div>
        {invoices.length === 0 ? (
          <EmptyState icon="▦" title="No invoices">
            Termly invoices appear here as soon as the bursary issues them.
          </EmptyState>
        ) : (
          <table>
            <thead><tr><th>Label</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.label}</td>
                  <td>{naira(inv.amountKobo)}</td>
                  <td><span className={`chip ${inv.status === "paid" ? "on-present" : inv.status === "partial" ? "on-late" : "on-absent"}`}>{inv.status}</span></td>
                  <td>{inv.dueDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent attendance</h2>
        {att.length === 0 ? (
          <EmptyState icon="✓" title="No attendance recorded yet">
            Once a teacher takes the register, the last seven days show here.
          </EmptyState>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              {[...att].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 7).map((r, i) => (
                <tr key={`${r.date}-${i}`}><td>{r.date}</td>
                  <td><span className={`chip on-${r.status}`}>{r.status}</span></td>
                  <td className="muted">{r.note ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Dashboard" };
