import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "School Portal",
  description: "Attendance, grades, homework and messages for staff, pupils and guardians.",
  /* The portal is installable: teachers use it on a phone all day, and the
     standalone window is the difference between "a website" and "the app I
     take the register in". */
  manifest: "/manifest.webmanifest",
  applicationName: "School Portal",
  appleWebApp: { capable: true, title: "School Portal", statusBarStyle: "default" },
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
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05014A",
  /* Fills the notch on a phone held in the classroom; without it a fixed
     bottom bar sits under the home indicator. */
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="portal-root">
        <a className="skip" href="#main">Skip to content</a>
        <PwaRegister />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
