import type { Metadata } from "next";
import OfflineRegister from "./offline-register";

/* The screen itself is a client component — it reads IndexedDB, not the
   network — and a file that exports `metadata` cannot also be one. So the route
   is a server wrapper whose only job is to give the page a title. The URL the
   service worker precaches is unchanged, so this still opens with no signal. */
export const metadata: Metadata = { title: "Offline register" };

export default function OfflineRegisterPage() {
  return <OfflineRegister />;
}
