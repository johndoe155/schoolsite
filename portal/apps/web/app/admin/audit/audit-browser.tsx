"use client";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import { api } from "@/lib/client";
import { API_BASE } from "@/lib/base-path";

interface Row {
  id: string;
  action: string;
  label: string;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  actor: { id: string | null; displayName: string; email: string | null };
  before: unknown;
  after: unknown;
  ip: string | null;
  occurredAt: string;
  rowHash: string;
}
interface Page { data: Row[]; meta: { per: number; hasMore: boolean; nextCursor: string | null } }
interface ActionOpt { action: string; label: string; count: number }
interface Verify { ok: boolean; checked: number; intact: number; mismatched: { id: string }[]; detail: string }

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, {
  year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Render a before/after pair as a readable field-level diff. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (!keys.length) return <span className="muted">No field detail recorded.</span>;
  const show = (v: unknown) =>
    v === undefined ? "—" : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  return (
    <table style={{ fontSize: ".82rem", width: "100%" }}>
      <thead><tr><th style={{ width: "25%" }}>Field</th><th>Before</th><th>After</th></tr></thead>
      <tbody>
        {keys.map((k) => {
          const changed = JSON.stringify(b[k]) !== JSON.stringify(a[k]);
          return (
            <tr key={k} style={{ background: changed ? "rgba(180,35,24,.05)" : undefined }}>
              <td><code>{k}</code></td>
              <td style={{ wordBreak: "break-word" }}>{show(b[k])}</td>
              <td style={{ wordBreak: "break-word", fontWeight: changed ? 600 : 400 }}>{show(a[k])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The audit browser.
 *
 * Every privileged write in the portal has been recorded since day one, but
 * there was no way to look at any of it. For a school this is the screen that
 * answers "who changed this mark?", "who let that parent see this child?" and
 * "who exported the directory?" — and it is usually asked under pressure, so
 * filtering is on the things people actually ask about.
 */
export default function AuditBrowser() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [actions, setActions] = useState<ActionOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [fAction, setFAction] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fQ, setFQ] = useState("");

  const qs = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ per: "50", ...extra });
    if (fAction) p.set("action", fAction);
    if (fFrom) p.set("from", fFrom);
    if (fTo) p.set("to", fTo);
    if (fQ) p.set("q", fQ);
    return p.toString();
  }, [fAction, fFrom, fTo, fQ]);

  const load = useCallback(async (append = false, cur?: string | null) => {
    setLoading(true); setErr("");
    try {
      const res = await api<Page>(`/audit?${qs(cur ? { cursor: cur } : {})}`);
      setRows((prev) => (append ? [...prev, ...res.data] : res.data));
      setCursor(res.meta.nextCursor);
      setHasMore(res.meta.hasMore);
    } catch (e: any) {
      setErr(e?.detail ?? e?.message ?? "Could not load the audit log");
    } finally { setLoading(false); }
  }, [qs]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    api<{ data: ActionOpt[] }>("/audit/actions").then((r) => setActions(r.data)).catch(() => {});
  }, []);

  async function runVerify() {
    setVerifying(true); setVerify(null);
    try { setVerify(await api<Verify>("/audit/verify")); }
    catch (e: any) { setErr(e?.message ?? "Verification failed"); }
    finally { setVerifying(false); }
  }

  return (
    <>
      <div className="card">
        {/* .toolbar = the portal's sticky filter row: one surface, real labels,
            and it keeps the controls reachable while the log scrolls. */}
        <div className="toolbar">
          <label>
            <span className="field-label">Action</span>
            <select value={fAction} onChange={(e) => setFAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>{a.label} ({a.count})</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">From</span>
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </label>
          <label>
            <span className="field-label">To</span>
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </label>
          <label>
            <span className="field-label">Search action</span>
            <input value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="e.g. guardian" />
          </label>
          {(fAction || fFrom || fTo || fQ) && (
            <button className="btn ghost" onClick={() => { setFAction(""); setFFrom(""); setFTo(""); setFQ(""); }}>
              Clear
            </button>
          )}
          <a className="btn ghost" href={`${API_BASE}/audit/export.csv?${qs()}`}>Export CSV</a>
          <button className="btn ghost" onClick={runVerify} disabled={verifying}>
            {verifying ? "Checking…" : "Check for tampering"}
          </button>
        </div>

        {verify && (
          <p className={`verify-note ${verify.ok ? "ok" : "bad"}`}>
            {verify.ok
              ? `✅ ${verify.checked} entries checked, all intact.`
              : `⚠️ ${verify.mismatched.length} of ${verify.checked} entries no longer match their recorded fingerprint. ${verify.detail}`}
          </p>
        )}
      </div>

      {err && <p className="alert err" role="alert">{err}</p>}

      <div className="card">
        {rows.length === 0 && !loading ? (
          <EmptyState icon="⌕" title="No activity matches these filters">
            Widen the dates or clear the search to see the whole log.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr><th style={{ width: 170 }}>When</th><th>What</th><th>Who</th><th>Target</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <>
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: ".85rem" }}>{fmt(r.occurredAt)}</td>
                    <td>
                      {r.label}
                      <br /><code className="muted" style={{ fontSize: ".75rem" }}>{r.action}</code>
                    </td>
                    <td>
                      {r.actor.displayName}
                      {r.actor.email && <><br /><span className="muted" style={{ fontSize: ".75rem" }}>{r.actor.email}</span></>}
                    </td>
                    <td className="muted" style={{ fontSize: ".78rem", wordBreak: "break-all" }}>
                      {r.entityType ?? "—"}{r.entityId ? ` ${r.entityId.slice(0, 8)}…` : ""}
                    </td>
                    <td>
                      <button className="btn ghost" style={{ padding: "2px 8px", fontSize: ".8rem" }}
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                        {expanded === r.id ? "Hide" : "Detail"}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-d`}>
                      <td colSpan={5} style={{ background: "var(--surface-2, #fafafa)" }}>
                        <Diff before={r.before} after={r.after} />
                        <p className="muted" style={{ fontSize: ".75rem", marginBottom: 0 }}>
                          IP {r.ip ?? "—"} · fingerprint <code>{r.rowHash.slice(0, 16)}…</code>
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          {hasMore && (
            <button className="btn ghost" onClick={() => load(true, cursor)} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
          <span className="muted" style={{ fontSize: ".8rem" }}>
            {rows.length} entr{rows.length === 1 ? "y" : "ies"} shown{hasMore ? " (more available)" : ""}
          </span>
        </div>
      </div>
    </>
  );
}
