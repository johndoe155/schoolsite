"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { uploadFile, humanBytes, fileUrl } from "@/lib/upload";

interface Message {
  id: string; senderUserId: string; senderName: string; bodyText: string; createdAt: string;
  attachmentFileId?: string | null; attachmentName?: string | null; attachmentBytes?: number | null;
}
interface Thread { id: string; subject: string; status: string; studentName: string | null }

export default function ThreadView({ thread, messages, canReply, meId }: {
  thread: Thread; messages: Message[]; canReply: boolean; meId: string;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /* Attachments: the file is uploaded first, then referenced by id. A message
     that pointed at a file that never uploaded would look sent and deliver
     nothing, so the order is not negotiable. */
  const [attachment, setAttachment] = useState<{ id: string; filename: string; bytes: number } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const router = useRouter();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await api(`/threads/${thread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body_text: text || null, attachment_file_id: attachment?.id ?? null }),
      });
      setText(""); setAttachment(null);
      router.refresh();
    } catch (e: any) {
      setErr(e?.code === "parent_read_only"
        ? "Parent accounts are read-only — your teacher will follow up here."
        : e?.message ?? "Could not send");
    }
    setBusy(false);
  }

  async function close() {
    if (!confirm("Close this thread?")) return;
    setBusy(true);
    try { await api(`/threads/${thread.id}/close`, { method: "POST" }); router.refresh(); }
    catch (e: any) { setErr(e?.message ?? "Could not close"); }
    setBusy(false);
  }

  return (
    <>
      <h1>{thread.subject}</h1>
      <div className="muted">About {thread.studentName ?? "student"} · {thread.status}</div>
      {err && <div className="alert err" role="alert">{err}</div>}

      <div className="card">
        {messages.map((m) => (
          <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row">
              <strong>{m.senderName}{m.senderUserId === meId ? " (you)" : ""}</strong>
              <span className="muted">{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            {m.bodyText ? <div style={{ whiteSpace: "pre-wrap" }}>{m.bodyText}</div> : null}
            {m.attachmentFileId ? (
              <div style={{ marginTop: 4 }}>
                <a className="btn ghost" href={fileUrl(m.attachmentFileId)}>
                  {m.attachmentName ?? "attachment"}
                  {m.attachmentBytes ? ` (${humanBytes(m.attachmentBytes)})` : ""}
                </a>
              </div>
            ) : null}
          </div>
        ))}
        {messages.length === 0 && <div className="muted">No messages yet.</div>}
      </div>

      {!canReply && (
        <div className="alert ok">Read-only view — messages from your child’s teacher appear here.</div>
      )}
      {canReply && thread.status === "open" && (
        <form className="card" onSubmit={send}>
          <label htmlFor="reply">Reply</label>
          <textarea id="reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
          <label htmlFor="attach" style={{ marginTop: 8 }}>Attach a file (optional)</label>
          <input id="attach" type="file" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setErr(""); setPct(0);
            try {
              const up = await uploadFile(file, setPct);
              setAttachment({ id: up.id, filename: up.filename, bytes: up.bytes });
            } catch (err2) {
              setErr(err2 instanceof Error ? err2.message : "Upload failed.");
            }
            setPct(null);
            e.target.value = "";
          }} />
          {pct !== null && <div className="muted" role="status">Uploading… {pct}%</div>}
          {attachment && (
            <div className="muted">
              Attached: {attachment.filename} ({humanBytes(attachment.bytes)}){" "}
              <button type="button" className="btn ghost" onClick={() => setAttachment(null)}>Remove</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy || pct !== null || (!text.trim() && !attachment)}>
              {attachment ? "Send with attachment" : "Send"}
            </button>
            <button type="button" className="btn ghost" onClick={close} disabled={busy}>Close thread</button>
          </div>
        </form>
      )}
      {canReply && thread.status === "closed" && <div className="muted">This thread is closed.</div>}
    </>
  );
}
