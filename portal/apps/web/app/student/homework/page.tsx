import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import SubmitHomework from "@/components/submit-homework";

interface Assignment {
  id: string;
  title: string;
  instructions: string | null;
  section: string | null;
  dueAt: string;
  maxScore: number | null;
  submitted: string | null;
  late: boolean;
  body: string | null;
  score: number | null;
  feedback: string | null;
  overdue: boolean;
}

function due(d: string) {
  const dt = new Date(d);
  return dt.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * A student's own work: what is set, what is due, what they have handed in and
 * what has come back marked.
 *
 * The ordering matters. Outstanding first, then marked, because "what do I owe"
 * is the question a student opens this page to answer; burying it under returned
 * work makes the page a record rather than a to-do list.
 */
export default async function StudentHomework() {
  const session = await requireRole("student");
  const res = await apiGet<{ assignments: Assignment[] }>("/homework/me");
  const all = res?.assignments ?? [];

  const open = all.filter((a) => !a.submitted);
  const done = all.filter((a) => a.submitted);

  return (
    <Shell session={session}>
      <h1>My homework</h1>

      {all.length === 0 && (
        <div className="card muted">Nothing has been set for you yet.</div>
      )}

      {open.length > 0 && (
        <>
          <h2>To do</h2>
          <div className="grid cols2">
            {open.map((a) => (
              <div className={`card ${a.overdue ? "hw-overdue" : ""}`} key={a.id}>
                <h3 style={{ marginTop: 0 }}>{a.title}</h3>
                <div className="muted">{a.section}</div>
                <div className={a.overdue ? "err" : "muted"}>
                  {a.overdue ? "Overdue — was due " : "Due "}{due(a.dueAt)}
                  {a.maxScore ? ` · ${a.maxScore} marks` : ""}
                </div>
                {a.instructions && <p>{a.instructions}</p>}
                <SubmitHomework assignmentId={a.id} current={null} />
              </div>
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <h2>Handed in</h2>
          <div className="grid cols2">
            {done.map((a) => (
              <div className="card" key={a.id}>
                <h3 style={{ marginTop: 0 }}>{a.title}</h3>
                <div className="muted">{a.section}</div>
                <div className={a.late ? "warn" : "muted"}>
                  Submitted {new Date(a.submitted!).toLocaleString()}
                  {a.late ? " — late" : ""}
                </div>
                {/* The instructions stay visible after submission. A student
                    re-reading their own work needs to see what was asked; only
                    showing them before the deadline makes the page useless the
                    moment it is most likely to be revisited. */}
                {a.instructions && <p>{a.instructions}</p>}
                {a.score !== null ? (
                  <div className="ok">
                    Marked {a.score}{a.maxScore ? ` / ${a.maxScore}` : ""}
                  </div>
                ) : (
                  <div className="muted">
                    Not yet marked.{a.maxScore ? ` Will be out of ${a.maxScore}.` : ""}
                  </div>
                )}
                {a.feedback && <p><strong>Feedback:</strong> {a.feedback}</p>}
                <details>
                  <summary>What you submitted</summary>
                  <pre className="hw-body">{a.body}</pre>
                </details>
                <SubmitHomework
                  assignmentId={a.id}
                  current={{ body: a.body, submitted: a.submitted, late: a.late }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
