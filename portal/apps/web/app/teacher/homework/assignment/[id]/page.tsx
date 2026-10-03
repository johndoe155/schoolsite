import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import MarkSubmission from "@/components/mark-submission";

interface Submission {
  studentUserId: string;
  name: string;
  email: string;
  body: string | null;
  submittedAt: string;
  late: boolean;
  score: number | null;
  feedback: string | null;
  markedAt: string | null;
}
interface Outstanding { studentUserId: string; name: string; email: string }
interface SubRes {
  assignmentId: string; title: string; maxScore: number | null; status: string;
  submissions: Submission[];
}
interface OutRes { title: string; dueAt: string; overdue: boolean; missing: Outstanding[] }

/**
 * One assignment: who has not handed in, and everything that has been handed
 * in, ready to mark. These belong on the same page because they are the two
 * halves of the same job — chasing and marking — and a teacher should not have
 * to hold one list in their head while working through the other.
 */
export default async function AssignmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("teacher", "teacher_assistant");
  const [subs, out] = await Promise.all([
    apiGet<SubRes>(`/homework/assignments/${id}/submissions`),
    apiGet<OutRes>(`/homework/assignments/${id}/outstanding`),
  ]);

  if (!subs || !out) {
    return (
      <Shell session={session}>
        <h1>Homework</h1>
        <div className="card err">That assignment could not be loaded.</div>
        <Link className="btn ghost" href="/teacher">Back to my sections</Link>
      </Shell>
    );
  }

  const unmarked = subs.submissions.filter((s) => s.score === null);

  return (
    <Shell session={session}>
      <h1>{subs.title}</h1>
      <div className={out.overdue ? "warn" : "muted"}>
        Due {new Date(out.dueAt).toLocaleString()}
        {subs.maxScore ? ` · ${subs.maxScore} marks` : ""}
        {subs.status !== "active" ? ` · ${subs.status}` : ""}
      </div>

      <div className="row">
        <span className="stat">{subs.submissions.length} in</span>
        <span className="stat">{out.missing.length} outstanding</span>
        <span className="stat">{unmarked.length} unmarked</span>
      </div>

      {out.missing.length > 0 && (
        <>
          <h2>Not handed in</h2>
          <div className="card">
            <ul className="hw-missing">
              {out.missing.map((m) => (
                <li key={m.studentUserId}>
                  {m.name} <span className="muted">{m.email}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {subs.submissions.length === 0 ? (
        <div className="card muted">Nothing has been handed in yet.</div>
      ) : (
        <>
          <h2>Submissions</h2>
          <div className="grid cols2">
            {subs.submissions.map((s) => (
              <div className="card" key={s.studentUserId}>
                <h3 style={{ marginTop: 0 }}>{s.name}</h3>
                <div className={s.late ? "warn" : "muted"}>
                  {new Date(s.submittedAt).toLocaleString()}{s.late ? " — late" : ""}
                </div>
                {s.score !== null
                  ? <div className="ok">Marked {s.score}{subs.maxScore ? ` / ${subs.maxScore}` : ""}</div>
                  : <div className="muted">Not yet marked.</div>}
                <details>
                  <summary>Their work</summary>
                  <pre className="hw-body">{s.body ?? "(submitted with no text)"}</pre>
                </details>
                <MarkSubmission
                  assignmentId={id}
                  studentUserId={s.studentUserId}
                  maxScore={subs.maxScore}
                  current={{ score: s.score, feedback: s.feedback }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
