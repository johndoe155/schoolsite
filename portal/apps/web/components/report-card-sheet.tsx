/**
 * A report card as a document.
 *
 * Shared by the student's own page and a guardian's view of their child so the
 * two can never drift into different documents. Deliberately free of client
 * state: it renders the snapshot that was generated for the term, which is the
 * school's record of what was issued — not a recomputation of today's marks.
 */

export interface ReportCardSnapshot {
  term: string; generatedAt: string;
  grading?: { scale?: unknown; weights?: unknown };
  sections: {
    section: string; course: string;
    grades: { label: string; points: string; maxPoints: string }[];
    exam_pct?: number | null; coursework_pct?: number | null; weighted_pct?: number | null;
    letter?: string | null; point?: number | null;
    attendance: Record<string, number>;
  }[];
  overall?: { average_pct: number | null; gpa: number | null; letter: string | null };
}

export interface Pupil {
  displayName: string;
  admissionNo?: string | null;
  gradeLevel?: number | null;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Present", absent: "Absent", late: "Late", excused: "Excused",
};

export default function ReportCardSheet({ school, pupil, snapshot, address }: {
  school: string; pupil: Pupil; snapshot: ReportCardSnapshot; address?: string | null;
}) {
  const attendance = snapshot.sections.reduce<Record<string, number>>((acc, sec) => {
    for (const [k, v] of Object.entries(sec.attendance)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});

  return (
    <article className="sheet">
      <header className="sheet__head">
        <div>
          <div className="sheet__school">{school}</div>
          {address ? <div className="sheet__address">{address}</div> : null}
        </div>
        <div className="sheet__doc">
          <div className="sheet__doc-title">Report card</div>
          <div className="sheet__doc-meta">{snapshot.term}</div>
          <div className="sheet__doc-meta">Issued {snapshot.generatedAt.slice(0, 10)}</div>
        </div>
      </header>

      <div className="sheet__facts">
        <div>
          <span className="sheet__label">Pupil</span>
          <strong>{pupil.displayName}</strong>
        </div>
        {pupil.admissionNo ? (
          <div><span className="sheet__label">Admission no.</span><strong>{pupil.admissionNo}</strong></div>
        ) : null}
        {pupil.gradeLevel ? (
          <div><span className="sheet__label">Year</span><strong>{pupil.gradeLevel}</strong></div>
        ) : null}
        {snapshot.overall ? (
          <div>
            <span className="sheet__label">Overall</span>
            <strong>
              {snapshot.overall.letter ?? "—"}
              {snapshot.overall.average_pct != null ? ` · ${snapshot.overall.average_pct}%` : ""}
              {snapshot.overall.gpa != null ? ` · GPA ${snapshot.overall.gpa}` : ""}
            </strong>
          </div>
        ) : null}
      </div>

      {snapshot.sections.map((sec) => (
        <section key={sec.section} className="sheet__block">
          <div className="sheet__block-head">
            <strong>{sec.section}</strong>
            <span className="sheet__label">{sec.course}</span>
            {sec.letter ? <strong className="sheet__grade">{sec.letter} ({sec.weighted_pct}%)</strong> : null}
          </div>
          <table>
            <thead>
              <tr><th>Assessment</th><th>Score</th><th>Out of</th><th>%</th></tr>
            </thead>
            <tbody>
              {sec.grades.map((g) => {
                const pct = Number(g.maxPoints) > 0
                  ? Math.round((Number(g.points) / Number(g.maxPoints)) * 1000) / 10 : null;
                return (
                  <tr key={`${g.label}-${g.points}`}>
                    <td>{g.label}</td><td>{g.points}</td><td>{g.maxPoints}</td>
                    <td>{pct ?? "—"}</td>
                  </tr>
                );
              })}
              {sec.grades.length === 0 && (
                <tr><td colSpan={4} className="sheet__muted">No released marks for this subject.</td></tr>
              )}
            </tbody>
          </table>
          <div className="sheet__meta-row">
            <span>Exam {sec.exam_pct ?? "—"}%</span>
            <span>Coursework {sec.coursework_pct ?? "—"}%</span>
            <span>Weighted {sec.weighted_pct ?? "—"}%</span>
          </div>
        </section>
      ))}

      <section className="sheet__block">
        <div className="sheet__block-head"><strong>Attendance</strong></div>
        <div className="sheet__meta-row">
          {Object.keys(attendance).length === 0
            ? <span className="sheet__muted">No attendance recorded this term.</span>
            : Object.entries(attendance).map(([k, v]) => (
              <span key={k}>{ATTENDANCE_LABEL[k] ?? k}: <strong>{v}</strong></span>
            ))}
        </div>
      </section>

      <p className="sheet__note">
        Marks shown are those released by subject teachers and recorded at the time this card was
        issued. Corrections are made by the school and re-issued.
      </p>

      <div className="sheet__signatures">
        <div>Class teacher</div>
        <div>Head of school</div>
        <div>Date</div>
      </div>
    </article>
  );
}
