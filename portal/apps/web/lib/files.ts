/**
 * Pure helpers for stored files — safe on the server AND in the browser.
 *
 * Kept out of lib/upload.ts on purpose: that module is a client module ("use
 * client"), and a server component importing a value from a client module gets
 * a client *reference*, not the function — calling it throws at render time.
 * These two functions are used on both sides, so they live here.
 */
import { API_BASE } from "./base-path";

/** Download URL for a stored file. Always the API — never a static path. */
export function fileUrl(id: string): string {
  return `${API_BASE}/files/${id}`;
}

/** Human file size for buttons and lists. */
export function humanBytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
