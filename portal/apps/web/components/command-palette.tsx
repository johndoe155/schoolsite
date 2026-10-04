"use client";
/**
 * ⌘K command palette — PORTAL-UX-AUDIT.md feature #1.
 *
 * One input over every destination the signed-in account may reach, the pages
 * it visited recently, and the actions that otherwise hide in the topbar. It
 * exists because the admin console has 14 destinations and (before this) the
 * only way to reach the ninth was to remember it was the ninth.
 *
 * Accessibility: this is the ARIA 1.2 dialog + combobox pattern — a modal
 * dialog holding a `role="combobox"` input with `aria-activedescendant`
 * pointing into a `role="listbox"`, options inside labelled `role="group"`
 * containers. Focus stays in the input (the option is never focused), Tab is
 * trapped between the input and the close button, Escape closes and restores
 * the focus that opened it, and the result count is announced politely.
 *
 * Keyboard: ⌘K / Ctrl+K toggles, "/" opens from anywhere that is not a text
 * field, ↑↓ Home End move, Enter activates, Esc closes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizePath } from "@/lib/nav";

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  /** Right-aligned secondary text — a shortcut, a role, a count. */
  hint?: string;
  /** Extra search terms that should match but not display. */
  keywords?: string;
  /** Navigation target. Omit for pure actions. */
  href?: string;
  /** Action to run. Ignored when href is set. */
  run?: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  placeholder?: string;
}

const RECENT_KEY = "portal_recent";
const MAX_RECENT = 6;

export interface RecentEntry { href: string; label: string }

/** Recent destinations, written by <RouteAnnouncer> on every navigation. */
export function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentEntry => !!r && typeof r === "object" && typeof (r as RecentEntry).href === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecent(pathname: string, label: string): void {
  if (typeof window === "undefined" || !pathname) return;
  try {
    const next = [{ href: pathname, label }, ...readRecent().filter((r) => r.href !== pathname)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode — recents are a convenience, not a feature */ }
}

const optId = (item: PaletteItem) => `palette-opt-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export default function CommandPalette({ open, onOpenChange, items, placeholder = "Search pages and actions…" }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  /* ── global shortcuts ───────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        onOpenChange(true);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  /* ── open/close side effects: scroll lock, focus in, focus back ─────────── */
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    setRecent(readRecent());
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) restoreRef.current?.focus?.();
  }, [open]);

  /* ── filtering ──────────────────────────────────────────────────────────── */
  const q = query.trim().toLowerCase();
  const scored = useMemo(() => {
    return items
      .map((item) => {
        const hay = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
        let score = 0;
        if (!q) score = 1;
        else if (hay.startsWith(q)) score = 4;
        else if (hay.includes(q)) score = 3;
        else if (q.split(/\s+/).every((w) => hay.includes(w))) score = 2;
        return { item, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [items, q]);

  const recentItems = useMemo(() => {
    if (q) return [];
    const byHref = new Map(items.filter((i) => i.href).map((i) => [normalizePath(i.href as string), i]));
    return recent
      .map((r) => byHref.get(normalizePath(r.href)))
      .filter((i): i is PaletteItem => !!i);
  }, [q, recent, items]);

  const groups = useMemo(() => {
    const out: { label: string; entries: PaletteItem[] }[] = [];
    if (recentItems.length) out.push({ label: "Recent", entries: recentItems });
    const seen = new Map<string, PaletteItem[]>();
    for (const { item } of scored) {
      if (item.group === "Recent") continue;
      const bucket = seen.get(item.group) ?? [];
      bucket.push(item);
      seen.set(item.group, bucket);
    }
    for (const [label, entries] of seen) out.push({ label, entries });
    return out;
  }, [scored, recentItems]);

  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);

  useEffect(() => {
    setActive((i) => (flat.length === 0 ? 0 : Math.min(i, flat.length - 1)));
    setAnnouncement(flat.length === 0 ? "No results" : `${flat.length} result${flat.length === 1 ? "" : "s"}`);
  }, [flat.length, q]);

  /* Keep the active option visible while arrowing through a long list. */
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(optId(flat[active] ?? { id: "none", label: "", group: "" }));
    el?.scrollIntoView({ block: "nearest" });
  }, [active, flat, open]);

  const activate = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      onOpenChange(false);
      if (item.href) router.push(item.href);
      else void item.run?.();
    },
    [onOpenChange, router]
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => flat.length ? (i + 1) % flat.length : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => flat.length ? (i - 1 + flat.length) % flat.length : 0); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, flat.length - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); activate(flat[active]); }
    else if (e.key === "Tab") {
      /* Only two focusables exist in the dialog; cycle between them. */
      e.preventDefault();
      if (document.activeElement === inputRef.current) closeRef.current?.focus();
      else inputRef.current?.focus();
    }
  }

  if (!open) return null;

  let index = -1;
  return (
    <div
      className="palette-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search pages and actions">
        <div className="palette__row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={flat.length ? optId(flat[active]) : undefined}
            aria-autocomplete="list"
            aria-label="Search pages and actions"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onInputKeyDown}
          />
          <button ref={closeRef} type="button" className="palette__close" onClick={() => onOpenChange(false)}>
            Esc
          </button>
        </div>

        <ul className="palette__list" id="palette-list" role="listbox" aria-label="Results">
          {flat.length === 0 && (
            <li className="palette__empty" role="presentation">
              No matches for <strong>{query}</strong>. Try a page name (“fees”, “timetable”) or an action (“theme”).
            </li>
          )}
          {groups.map((group) => (
            <li role="group" aria-label={group.label} key={group.label} style={{ listStyle: "none" }}>
              <div className="palette__group" aria-hidden="true">{group.label}</div>
              <ul role="presentation" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {group.entries.map((item) => {
                  index += 1;
                  const i = index;
                  return (
                    <li
                      key={item.id}
                      id={optId(item)}
                      role="option"
                      aria-selected={i === active}
                      className="palette__opt"
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => { e.preventDefault(); activate(item); }}
                    >
                      <span>{item.label}</span>
                      {item.hint ? <span className="hint">{item.hint}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        <p className="palette__foot">
          <span aria-hidden="true">↑↓ move · ↵ open · esc close</span>
          <span className="sr-only">{announcement}</span>
        </p>
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      </div>
    </div>
  );
}
