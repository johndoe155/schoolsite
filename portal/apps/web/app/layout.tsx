import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";
import RouteAnnouncer from "@/components/route-announcer";
import { SchoolNameProvider } from "@/lib/school-context";
import { getSchool } from "@/lib/school";

/**
 * The school's name is part of every page title, so it has to be fetched here
 * rather than in each page. `getSchool` falls back to "School Portal" when the
 * API is unreachable, which keeps the title template valid during an outage
 * instead of rendering a bare "Fees".
 */
export async function generateMetadata(): Promise<Metadata> {
  const school = await getSchool();
  return {
    title: { default: school.name, template: `%s · ${school.name}` },
    description: "Attendance, grades, homework and messages for staff, pupils and guardians.",
  /* The portal is installable: teachers use it on a phone all day, and the
     standalone window is the difference between "a website" and "the app I
     take the register in". */
    manifest: "/manifest.webmanifest",
    applicationName: school.name,
    appleWebApp: { capable: true, title: school.name, statusBarStyle: "default" },
    /* PNGs as well as the SVG: an SVG-only manifest installs as a bookmark on
       Android, and Android is what the teachers carry. See make-pwa-icons.mjs. */
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/icon-192.png",
    },
  };
}
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05014A",
  /* Fills the notch on a phone held in the classroom; without it a fixed
     bottom bar sits under the home indicator. */
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* `getSchool` is request-memoised, so this costs nothing beyond the call that
     `generateMetadata` already made. The name is handed to client chrome
     through a provider, which is what keeps it out of the HTML as "School
     Portal" and then a flash of the real name. */
  const school = await getSchool();
  /* Dark mode is a server render, not a script: there is no middleware to mint
     a nonce for an inline bootstrap, and the CSP would refuse one anyway. The
     cookie written by <ThemeToggleButton> therefore decides the attribute on
     the request that follows a choice, and `prefers-color-scheme` decides the
     very first visit — see the dark-theme block in globals.css. */
  const choice = (await cookies()).get("portal_theme")?.value;
  const theme = choice === "dark" || choice === "light" ? choice : undefined;
  return (
    <html lang="en" {...(theme ? { "data-theme": theme } : {})}>
      <body className="portal-root">
        <a className="skip" href="#main">Skip to content</a>
        <PwaRegister />
        <SchoolNameProvider name={school.name}>
          <main id="main">{children}</main>
        </SchoolNameProvider>
        {/* In the layout rather than in the signed-in shell, so every
            client-side navigation is announced — the sign-in, invite and
            password pages are navigations too. */}
        <RouteAnnouncer schoolName={school.name} />
      </body>
    </html>
  );
}
