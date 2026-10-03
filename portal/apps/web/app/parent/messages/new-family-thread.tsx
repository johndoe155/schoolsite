"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

interface Child { studentUserId: string; displayName: string | null; verified: string | null }
interface Teacher { id: string; name: string; sectionName: string | null; courseTitle: string | null }

/**
 * A guardian opening a thread.
 *
 * Until migration 0021 the only way a conversation could exist was for a
 * teacher to start one, so a parent with something to raise had no way in.
 * The child and the teacher are both chosen from lists the API builds for this
 * guardian only — the teachers shown are the ones who actually teach that
 * child, and picking anyone else is refused server-side.
 *
 * The teacher list is fetched per child on demand (it depends on which child
 * is selected), and it is not cached between children: a sibling in another
 * year has different teachers.
 */
export default function NewFamilyThread({ children }: { children: Child[] }) {
  const verified = children.filter((c) => c.verified);
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState(verified[0]?.studentUserId ?? "");
  const [teacherId, setTeacherId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function loadTeachers(nextChildId: string) {
    setChildId(nextChildId);
    setTeacherId("");
    setTeachers(null);
    if (!nextChildId) return;
    setLoading(true); setErr("");
    try {
      const out = await api<{ data: Teacher[] }>(`/family/children/${nextChildId}/teachers`);
      setTeachers(out.data);
      if (out.data.length === 0) {
        setErr("No teacher is currently assigned to this child, so there is nobody to write to yet.");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Could not load this child's teachers.");
    }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const out = await api<{ id: string }>("/threads/family", {
        method: "POST",
        body: JSON.stringify({
          child_user_id: childId, teacher_user_id: teacherId,
          subject, body_text: body,
        }),
      });
      setSubject(""); setBody(""); setTeacherId("");
      setOpen(false);
      router.push(`/parent/messages/${out.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.code === "outside_section_scope"
        ? "That teacher does not teach this child."
        : e?.message ?? "Could not send your message.");
    }
    setBusy(false);
  }

  if (verified.length === 0) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Message a teacher</h2>
        <div className="muted">
          Your guardian link has to be confirmed before you can write about a child.
          Check your inbox for the confirmation email from the school.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Message a teacher</h2>
      {!open ? (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>
            Start a conversation about one of your children. The teacher you pick is emailed
            when you send it.
          </div>
          <button className="btn" onClick={() => { setOpen(true); void loadTeachers(childId); }}>
            Write a new message
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {err && <div className="alert err" role="alert">{err}</div>}
          <div className="grid cols2">
            <div>
              <label htmlFor="ft-child">Child</label>
              <select id="ft-child" value={childId} onChange={(e) => void loadTeachers(e.target.value)} required>
                {verified.map((c) => (
                  <option key={c.studentUserId} value={c.studentUserId}>
                    {c.displayName ?? c.studentUserId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ft-teacher">Teacher</label>
              <select id="ft-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}
                required disabled={loading || !teachers}>
                <option value="">{loading ? "Loading…" : "— choose a teacher —"}</option>
                {(teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.courseTitle || t.sectionName ? ` — ${t.courseTitle ?? t.sectionName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="ft-subject">Subject</label>
          <input id="ft-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
            maxLength={200} required placeholder="Pick-up arrangements" />
          <label htmlFor="ft-body">Message</label>
          <textarea id="ft-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)}
            maxLength={4000} required />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy || !teacherId || !subject.trim() || !body.trim()}>
              {busy ? "Sending…" : "Send message"}
            </button>
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
