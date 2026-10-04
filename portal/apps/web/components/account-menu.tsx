"use client";
/**
 * Account menu — the topbar's three loose buttons (Emails / Password / Sign
 * out) collapsed into one disclosure.
 *
 * Built on a native `<details>` rather than a hand-rolled popover: it opens
 * with a keyboard, is announced as a disclosure, and keeps working if the
 * JavaScript bundle has not arrived yet. The two behaviours `<details>` does
 * not provide — close on outside click, close on Escape and return focus to
 * the summary — are added here.
 *
 * The theme toggle lives inside because "appearance" is an account-level
 * preference and this is the only place a signed-in user can reach it without
 * the palette.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";
import { roleLabel } from "@/lib/roles";
import { ThemeToggleButton } from "./theme-controls";

export default function AccountMenu({
  displayName,
  email,
  role,
  onSignOut,
}: {
  displayName: string;
  email: string;
  /** Role code, e.g. "school_admin" — shown so a dual-role account can tell which is active. */
  role: string;
  onSignOut: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function close() {
    if (ref.current) ref.current.open = false;
  }

  const firstName = displayName.split(" ")[0] || "Account";

  return (
    <details
      className="menu"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        close();
        (ref.current?.querySelector("summary") as HTMLElement | null)?.focus();
      }}
    >
      <summary aria-label={`Account menu for ${displayName}`}>
        <span aria-hidden="true">◍</span>
        <span className="menu__label">{firstName}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="menu__panel">
        <div className="menu__head">
          <span className="menu__name">{displayName}</span>
          <span className="menu__mail">{email}</span>
          <span className="menu__mail">{roleLabel(role)}</span>
        </div>
        {/* Both pages existed only as URLs before — the email-preferences page
            in particular is linked from the List-Unsubscribe header of every
            bulk message the school sends. */}
        <Link className="menu__item" href="/account/notifications" onClick={close}>
          <span aria-hidden="true">✉</span> Email preferences
        </Link>
        <Link className="menu__item" href="/account/password" onClick={close}>
          <span aria-hidden="true">⚿</span> Password
        </Link>
        <ThemeToggleButton />
        <div className="menu__sep" />
        <button className="menu__item" type="button" onClick={() => { close(); onSignOut(); }}>
          <span aria-hidden="true">↪</span> Sign out
        </button>
      </div>
    </details>
  );
}
