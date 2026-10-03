import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import PayButton from "./pay-button";
import { fileUrl } from "@/lib/files";

interface Child { studentUserId: string; admissionNo: string; gradeLevel: number; displayName: string; relationship: string }
interface GradeRow { id: string; label: string; points: string; maxPoints: string; sourceType: string; feedbackText: string | null; releasedAt: string }
interface AttRow { date: string; status: string }
interface ReportCard { id: string; snapshot: { term: string; generatedAt: string;
  sections: { section: string; course: string; grades: { label: string; points: string; maxPoints: string }[];
    exam_pct?: number | null; coursework_pct?: number | null; weighted_pct?: number | null;
    letter?: string | null; point?: number | null;
    attendance: Record<string, number> }[];
  overall?: { average_pct: number | null; gpa: number | null; letter: string | null } } }
interface Invoice { id: string; label: string; amountKobo: number; status: string; dueDate: string | null }
interface ExamRow { id: string; title: string; examDate: string; maxScore: string }
interface Transport { assignment: { id: string }; route: { name: string; driverName: string | null }; stop: { name: string; pickupTime: string | null } | null }
interface TimetableEntry {
  index: number; label: string | null; startsAt: string; endsAt: string; isBreak: boolean;
  section?: string | null; course?: string | null; teacher?: string | null; room?: string | null;
}
interface HomeworkRow {
  id: string; title: string; instructions: string | null; dueAt: string | null;
  sectionName: string | null; courseTitle: string | null;
  attachmentFileId: string | null; filename: string | null;
  submissionId: string | null; submissionText: string | null; submittedAt: string | null;
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const session = await requireRole("parent");
  const { childId } = await params;
  const [kids, g, a, rc, fees, ex, tr, tt, hw] = await Promise.all([
    apiGet<{ data: Child[] }>("/parent/children"),
    apiGet<{ data: GradeRow[] }>(`/parent/children/${childId}/grades`),
    apiGet<{ data: AttRow[] }>(`/parent/children/${childId}/attendance`),
    apiGet<{ data: ReportCard[] }>(`/students/${childId}/report-card`),
    apiGet<{ data: { invoices: Invoice[] } }>(`/parent/children/${childId}/fees`),
    apiGet<{ data: ExamRow[] }>(`/parent/children/${childId}/exams`),
    apiGet<{ data: Transport | null }>(`/parent/children/${childId}/transport`),
    /* Phase 8: what the child is meant to be doing, and what they owe. Both
       come from the guardian-scoped endpoints, which check the link — a
       parent cannot read another family's child by pasting an id. */
    apiGet<{ week: Record<string, TimetableEntry[]> }>(`/timetable/students/${childId}`),
    apiGet<{ data: HomeworkRow[] }>(`/student/assignments?student=${childId}`),
  ]);
  const invoices = fees?.data.invoices ?? [];
  const childExams = [...(ex?.data ?? [])].sort((x, y) => x.examDate.localeCompare(y.examDate));
  const transport = tr?.data;
  const card = rc?.data[0];
  const child = kids?.data.find((c) => c.studentUserId === childId);
  if (!child) {
    return (
      <Shell session={session}>
        <h1>Child not found</h1>
        <p className="muted">This student is not linked to your account.</p>
        <Link className="btn ghost" href="/parent">Back to my children</Link>
      </Shell>
    );
  }
  const week = tt?.week ?? {};
  const todayName = new Date().toLocaleDateString("en-GB", { weekday: "long" });
  const todayPeriods = week[todayName] ?? [];
  const homework = [...(hw?.data ?? [])].sort((x, y) =>
    String(x.dueAt ?? "9999").localeCompare(String(y.dueAt ?? "9999")));
  const outstanding = homework.filter((h) => !h.submissionId);
  const grades = [...(g?.data ?? [])].sort((x, y) => (y.releasedAt ?? "").localeCompare(x.releasedAt ?? ""));
  const att = [...(a?.data ?? [])].sort((x, y) => y.date.localeCompare(x.date));
  return (
    <Shell session={session}>
      <Link href="/parent" className="muted">← My children</Link>
      <h1>{child.displayName}</h1>
      <div className="muted">{child.admissionNo} · Grade {child.gradeLevel} · your {child.relationship}</div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Released grades</h2>
        {grades.length === 0 ? <div className="muted">No released grades yet.</div> : (
          <table>
            <thead><tr><th>Label</th><th>Type</th><th>Points</th><th>%</th><th>Feedback</th></tr></thead>
            <tbody>
              {grades.map((gr) => (
                <tr key={gr.id}>
                  <td>{gr.label}</td><td>{gr.sourceType}</td>
                  <td>{gr.points} / {gr.maxPoints}</td>
                  <td>{Math.round((Number(gr.points) / Number(gr.maxPoints)) * 100)}%</td>
                  <td className="muted">{gr.feedbackText ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Report card</h2>
          {card ? (
            <Link className="btn ghost" href={`/print/report-card/${childId}`}>
              Print / Save as PDF
            </Link>
          ) : null}
        </div>
        {!card ? <div className="muted">No report-card snapshot has been generated yet.</div> : (
          <>
            <div className="muted">{card.snapshot.term} · generated {card.snapshot.generatedAt.slice(0, 10)}</div>
            {card.snapshot.overall ? (
              <p style={{ fontSize: 18, margin: "8px 0" }}>
                <strong>{card.snapshot.overall.letter ?? "—"}</strong>
                <span className="muted"> · average {card.snapshot.overall.average_pct ?? "—"}%{card.snapshot.overall.gpa != null ? ` · GPA ${card.snapshot.overall.gpa}` : ""}</span>
              </p>
            ) : null}
            {card.snapshot.sections.map((sec) => (
              <div key={sec.section} style={{ marginTop: 10 }}>
                <strong>{sec.section}</strong> <span className="muted">({sec.course})</span>
                {sec.letter ? <span style={{ marginLeft: 8 }}><strong>{sec.letter}</strong> <span className="muted">({sec.weighted_pct}%)</span></span> : null}
                <table>
                  <tbody>
                    {sec.grades.map((gr) => (
                      <tr key={gr.label}><td>{gr.label}</td><td>{gr.points} / {gr.maxPoints}</td></tr>
                    ))}
                    {sec.exam_pct != null || sec.coursework_pct != null ? (
                      <tr><td className="muted">Exam {sec.exam_pct ?? "—"}% · Coursework {sec.coursework_pct ?? "—"}%</td>
                        <td className="muted">weighted {sec.weighted_pct ?? "—"}%</td></tr>
                    ) : null}
                    <tr><td className="muted">Attendance</td>
                      <td className="muted">{Object.entries(sec.attendance).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Today — {todayName}</h2>
        {todayPeriods.length === 0 ? (
          <div className="muted">Nothing on the timetable for today.</div>
        ) : (
          todayPeriods.map((e, i) => (
            <div key={`${e.index}-${i}`} className="row"
              style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
              <span className="muted" style={{ minWidth: 96 }}>
                {e.startsAt?.slice(0, 5)}–{e.endsAt?.slice(0, 5)}
              </span>
              {e.isBreak
                ? <span className="muted">{e.label ?? "Break"}</span>
                : e.section
                  ? <span><strong>{e.course ?? e.section}</strong>
                      <span className="muted">{e.teacher ? ` · ${e.teacher}` : ""}{e.room ? ` · ${e.room}` : ""}</span>
                    </span>
                  : <span className="muted">free</span>}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          Homework
          {outstanding.length > 0 && <span className="chip on-late" style={{ marginLeft: 8 }}>{outstanding.length} outstanding</span>}
        </h2>
        {homework.length === 0 ? <div className="muted">No homework set yet.</div> : (
          <table>
            <thead><tr><th>Set for</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {homework.map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.title}</strong>
                    <div className="muted">{h.courseTitle ?? h.sectionName ?? ""}</div>
                  </td>
                  <td className="muted">
                    {h.dueAt ? new Date(h.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
                  </td>
                  <td>
                    {h.submissionId
                      ? <span className="chip on-present">handed in</span>
                      : <span className="chip on-absent">not yet</span>}
                  </td>
                  <td>
                    {h.attachmentFileId && <a href={fileUrl(h.attachmentFileId)}>sheet</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">A pupil hands work in from their own sign-in; guardians can see what is set and what is outstanding.</p>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Fees</h2>
          {invoices.length > 0 ? (
            <Link className="btn ghost" href={`/print/fees/${childId}`}>
              Receipts &amp; statement
            </Link>
          ) : null}
        </div>
        {invoices.length === 0 ? <div className="muted">No invoices.</div> : (
          <table>
            <thead><tr><th>Label</th><th>Amount</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.label}</td>
                  <td>{naira(inv.amountKobo)}</td>
                  <td><span className={`chip ${inv.status === "paid" ? "on-present" : inv.status === "partial" ? "on-late" : "on-absent"}`} style={{ cursor: "default" }}>{inv.status}</span></td>
                  <td>{inv.dueDate ?? "—"}</td>
                  <td>{inv.status !== "paid" && inv.status !== "void" ? <PayButton childId={childId} invoiceId={inv.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Upcoming exams</h2>
        {childExams.length === 0 ? <div className="muted">No exams scheduled.</div> : (
          <table>
            <thead><tr><th>Exam</th><th>Date</th><th>Max</th></tr></thead>
            <tbody>
              {childExams.map((e) => (
                <tr key={e.id}><td>{e.title}</td><td>{e.examDate}</td><td>{e.maxScore}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>School transport</h2>
        {!transport ? <div className="muted">No transport assignment.</div> : (
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
        <h2 style={{ marginTop: 0 }}>Attendance</h2>
        {att.length === 0 ? <div className="muted">No attendance recorded yet.</div> : (
          <table>
            <thead><tr><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {att.slice(0, 14).map((r, i) => (
                <tr key={`${r.date}-${i}`}>
                  <td>{r.date}</td>
                  <td><span className={`chip on-${r.status}`} style={{ cursor: "default" }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
