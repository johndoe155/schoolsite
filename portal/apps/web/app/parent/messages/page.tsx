import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import NewFamilyThread from "./new-family-thread";

interface Thread { id: string; subject: string; status: string; createdAt: string; studentName: string }
interface Child { studentUserId: string; displayName: string | null; verified: string | null }

export default async function ParentMessages() {
  const session = await requireRole("parent");
  const [threads, kids] = await Promise.all([
    apiGet<{ data: Thread[] }>("/threads"),
    apiGet<{ data: Child[] }>("/parent/children"),
  ]);
  return (
    <Shell session={session}>
      <h1>Messages</h1>
      <p className="muted">
        Threads about your children. Open one to read it and reply — your child’s teacher is
        notified when you answer.
      </p>
      <div className="card">
        {(threads?.data ?? []).length === 0 ? <div className="muted">No messages yet.</div> : (
          <table>
            <thead><tr><th>Subject</th><th>Child</th><th>Status</th><th>Opened</th><th></th></tr></thead>
            <tbody>
              {(threads?.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td>{t.subject}</td><td>{t.studentName}</td>
                  <td>{t.status}</td><td>{t.createdAt.slice(0, 10)}</td>
                  <td><Link href={`/parent/messages/${t.id}`}>Read →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <NewFamilyThread children={kids?.data ?? []} />
    </Shell>
  );
}
