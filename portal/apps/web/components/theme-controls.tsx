"use client";
/**
 * Theme controls for the portal.
 *
 * Three constraints shape this file:
 *
 * 1. The portal may not run an inline script (the CSP is nonce-based), so
 *    "no flash of the wrong theme" cannot be done the usual way. Instead the
 *    first visit is decided in CSS by `prefers-color-scheme`, and the cookie
 *    written here makes the *server* render the right theme from the next
 *    request on — see the dark-theme block in app/globals.css and the
 *    `cookies()` read in app/layout.tsx.
 * 2. Several toggles can be on screen at once (account menu + command
 *    palette), so state is broadcast on a window event rather than held in
 *    one component.
 * 3. `aria-pressed` on the button, and the label always says what will
 *    happen, not what the current state is ("Switch to dark theme").
 */
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "portal_theme";
const COOKIE = "portal_theme";
const EVENT = "portal-theme-change";

/** The theme in force right now: explicit choice first, OS preference second. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Apply a theme to the live document and remember it for the next request. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
  /* Path=/ so the cookie is present on every portal route; a year is long
     enough that the choice feels permanent, short enough to expire on a
     shared staffroom device. */
  document.cookie = `${COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/**
 * The button used in the account menu and the command palette. It renders a
 * neutral label until mounted (the server cannot know the OS preference), so
 * there is no hydration mismatch.
 */
export function ThemeToggleButton({ className = "menu__item" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    const onChange = () => setTheme(currentTheme());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
      mq?.removeEventListener?.("change", onChange);
    };
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={className}
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(toggleTheme())}
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
      {theme === null ? "Theme" : next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
    </button>
  );
}
