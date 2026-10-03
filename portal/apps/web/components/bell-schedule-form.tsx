"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import type { Week } from "./week-grid";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKDAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 } as const;
const MAX_PERIODS = 10;

interface Cell { start: string; end: string; label: string; isBreak: boolean }
type Grid = Record<string, Cell[]>;

function blankRows(): Cell[] {
  return Array.from({ length: MAX_PERIODS }, () => ({ start: "", end: "", label: "", isBreak: false }));
}

/** Seed the form from an existing week so editing does not start from nothing. */
function fromWeek(week: Week): Grid {
  const g: Grid = {};
  for (const day of DAYS) {
    g[day] = blankRows();
    (week[day] ?? []).forEach((p) => {
      const i = p.index - 1;
      if (i < 0 || i >= MAX_PERIODS) return;
      g[day][i] = {
        start: p.startsAt?.slice(0, 5) ?? "",
        end: p.endsAt?.slice(0, 5) ?? "",
        label: p.label ?? "",
        isBreak: Boolean(p.isBreak),
      };
    });
  }
  return g;
}

/**
 * Define the bell schedule for a term.
 *
 * The API replaces the whole week on save, so this form always submits the
 * entire grid rather than one row. A form that posted a single period would
 * silently delete the other four days — the kind of data loss that shows up
 * weeks later when someone notices Tuesday is empty.
 */
export default function BellScheduleForm({ termId, week }: { termId: string; week: Week }) {
  const router = useRouter();
  const [grid, setGrid] = useState<Grid>(() => fromWeek(week));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set(day: string, i: number, patch: Partial<Cell>) {
    setGrid((g) => {
      const rows = g[day].map((r, j) => (j === i ? { ...r, ...patch } : r));
      return { ...g, [day]: rows };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);

    const payload: Array<Record<string, unknown>> = [];
    for (const day of DAYS) {
      grid[day].forEach((c, i) => {
        if (!c.start || !c.end) return; // an empty cell means "no period", not "clear it"
        payload.push({
          weekday: WEEKDAY[day as keyof typeof WEEKDAY],
          period_index: i + 1,
          starts_at: c.start,
          ends_at: c.end,
          label: c.label.trim() || undefined,
          is_break: c.isBreak,
        });
      });
    }

    if (payload.length === 0) {
      setMsg({ kind: "err", text: "Fill in at least one period, or this saves an empty week." });
      setBusy(false); return;
    }

    try {
      await api(`/timetable/terms/${termId}/periods`, { method: "POST", body: JSON.stringify(payload) });
      setMsg({ kind: "ok", text: `Saved ${payload.length} period${payload.length === 1 ? "" : "s"}.` });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? (err.detail ?? err.message) : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tt-bell" onSubmit={save}>
      <details>
        <summary>Bell schedule for this term</summary>
        <p className="muted">
          Saving replaces the whole week for every section in this term. Leave a
          row blank to have no period there; tick Break for periods nothing can
          be taught in.
        </p>

        <div className="tt-bell-grid">
          {DAYS.map((day) => (
            <section key={day} className="tt-bell-day">
              <h3>{day}</h3>
              {grid[day].map((c, i) => (
                <div className="tt-bell-row" key={i}>
                  <span className="tt-bell-n">{i + 1}</span>
                  <input type="time" value={c.start} aria-label={`${day} period ${i + 1} start`}
                    onChange={(e) => set(day, i, { start: e.target.value })} />
                  <input type="time" value={c.end} aria-label={`${day} period ${i + 1} end`}
                    onChange={(e) => set(day, i, { end: e.target.value })} />
                  <input value={c.label} placeholder="Label" aria-label={`${day} period ${i + 1} label`}
                    onChange={(e) => set(day, i, { label: e.target.value })} />
                  <label className="tt-bell-break">
                    <input type="checkbox" checked={c.isBreak}
                      onChange={(e) => set(day, i, { isBreak: e.target.checked })} />
                    Break
                  </label>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="row">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save week"}</button>
        </div>
        {msg && <div className={msg.kind === "ok" ? "ok" : "err"} role="status">{msg.text}</div>}
      </details>
    </form>
  );
}
