"use client";
/**
 * Offline attendance queue (IndexedDB).
 *
 * The workflow this exists for is boring and real: a teacher opens the register
 * on a phone in a classroom, the phone has no usable data, and they mark the
 * class anyway. Before this, every mark was lost. Now the register is written
 * to IndexedDB on this device and sent when there is a connection.
 *
 * Three rules make that safe rather than dangerous:
 *
 *   1. **One entry per (section, date).** Re-marking the same register replaces
 *      the queued copy; it never stacks up two versions of the same lesson.
 *   2. **The idempotency key is generated when the register is first queued and
 *      kept.** Replaying the same key is what makes "did that save?" harmless:
 *      the server returns the original result instead of writing twice.
 *   3. **The queue is device-local and is not a sync engine.** It holds one
 *      register per section/day, and it only ever sends what a teacher typed.
 *      Nothing else is cached, and clearing it is a single button.
 */
import { API_BASE } from "./base-path";

const DB_NAME = "portal-offline";
/* v2 adds the roster snapshot store. Bumping the version (rather than
   swallowing the upgrade) is what keeps an existing device working: the
   upgrade handler creates only the store that is missing. */
const DB_VERSION = 2;
const STORE = "attendance";
const ROSTER = "rosters";

export interface QueuedRegister {
  /** `${sectionId}:${date}` — the natural key of one register. */
  key: string;
  sectionId: string;
  date: string;
  records: { student_user_id: string; status: string }[];
  idempotencyKey: string;
  savedAt: string;
  lastError?: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store the register offline."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(ROSTER)) db.createObjectStore(ROSTER, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the offline store."));
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  store = STORE,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export function queueKey(sectionId: string, date: string) {
  return `${sectionId}:${date}`;
}

export async function putQueuedRegister(entry: QueuedRegister): Promise<void> {
  await tx("readwrite", (s) => s.put(entry));
}

export async function listQueuedRegisters(): Promise<QueuedRegister[]> {
  return (await tx("readonly", (s) => s.getAll())) as QueuedRegister[];
}

export async function getQueuedRegister(sectionId: string, date: string): Promise<QueuedRegister | null> {
  const row = await tx("readonly", (s) => s.get(queueKey(sectionId, date)));
  return (row as QueuedRegister) ?? null;
}

export async function removeQueuedRegister(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

/* ── The roster snapshot ──────────────────────────────────────────────────────
   The register page cannot be reached while the device is offline: the app is
   server-rendered, so with no network there is no HTML to render. Instead the
   register page keeps a copy of the class list here, and a small static
   "offline register" screen — the one page the service worker precaches — reads
   it back. That is the difference between "the marks are not lost" and "the
   teacher can still take the register", which are not the same promise.
   ------------------------------------------------------------------------- */

export interface RosterSnapshot {
  /** `${sectionId}:${date}` — same natural key as the queue entry. */
  key: string;
  sectionId: string;
  sectionName: string;
  date: string;
  students: { studentUserId: string; displayName: string; admissionNo: string }[];
  marks: Record<string, string>;
  savedAt: string;
}

export async function saveRosterSnapshot(snapshot: RosterSnapshot): Promise<void> {
  await tx("readwrite", (s) => s.put(snapshot), ROSTER);
}

export async function listRosterSnapshots(): Promise<RosterSnapshot[]> {
  const rows = (await tx("readonly", (s) => s.getAll(), ROSTER)) as RosterSnapshot[];
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Forget everything this device is holding: queued registers and roster
 * copies. Offered on the offline screen and run on sign-out, because a
 * staffroom device that keeps the last teacher's class list after they log
 * out is a data-protection problem, not a convenience.
 */
export async function clearDeviceData(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
  try { await tx("readwrite", (s) => s.clear(), ROSTER); } catch { /* older DB */ }
}

export interface FlushResult { sent: number; failed: number; remaining: number }

/** POST one queued register. Returns true when the server accepted it. */
async function send(entry: QueuedRegister): Promise<{ ok: boolean; error?: string }> {
  const csrf = document.cookie.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1] ?? "";
  try {
    const res = await fetch(`${API_BASE}/sections/${entry.sectionId}/attendance`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf": decodeURIComponent(csrf),
        "idempotency-key": entry.idempotencyKey,
      },
      credentials: "same-origin",
      body: JSON.stringify({ date: entry.date, records: entry.records }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Your session ended — sign in again to send this register." };
    }
    const body = await res.json().catch(() => ({}));
    // 422 means the marks themselves are wrong (e.g. a pupil left the class).
    // Retrying forever will not fix that; surface it and keep the entry.
    return { ok: false, error: body?.detail ?? body?.title ?? `Rejected (${res.status})` };
  } catch {
    return { ok: false };   // still offline — keep it queued and try again later
  }
}

/**
 * Try to send everything queued. Called on load and whenever the browser
 * reports the connection is back. Never throws: a failure leaves the entry in
 * place with its error recorded, which is what the register screen shows.
 */
export async function flushQueuedRegisters(): Promise<FlushResult> {
  let entries: QueuedRegister[] = [];
  try { entries = await listQueuedRegisters(); } catch { return { sent: 0, failed: 0, remaining: 0 }; }
  let sent = 0, failed = 0;
  for (const entry of entries) {
    const result = await send(entry);
    if (result.ok) {
      sent++;
      try { await removeQueuedRegister(entry.key); } catch { /* keep going */ }
    } else {
      failed++;
      try { await putQueuedRegister({ ...entry, lastError: result.error ?? null }); } catch { /* keep going */ }
    }
  }
  return { sent, failed, remaining: entries.length - sent };
}
