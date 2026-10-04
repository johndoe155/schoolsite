"use client";
/**
 * The school's name, for client components that render chrome.
 *
 * The root layout already fetches this for the page title, so passing it down
 * through a context means the topbar renders the real name in the first HTML
 * byte (no "School Portal" flicker) and the browser makes one request fewer.
 * `useSchoolName` returns a neutral fallback when no provider is mounted, so a
 * component can be rendered in isolation without special-casing.
 */
import { createContext, useContext, type ReactNode } from "react";

const SchoolNameContext = createContext<string | null>(null);

export function SchoolNameProvider({ name, children }: { name: string; children: ReactNode }) {
  return <SchoolNameContext.Provider value={name}>{children}</SchoolNameContext.Provider>;
}

export function useSchoolName(fallback = "School Portal"): string {
  return useContext(SchoolNameContext) ?? fallback;
}
