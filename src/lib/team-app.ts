import type { Metadata, Viewport } from "next";

/**
 * Makes team pages installable as a phone app ("Add to Home screen"): the app icon opens
 * the dashboard full screen. Only team pages link the manifest, so shoppers are never
 * offered the team app.
 */
export const teamAppMetadata: Metadata = {
  manifest: "/team.webmanifest",
  appleWebApp: { capable: true, title: "Threadline", statusBarStyle: "default" },
  icons: { apple: "/team/apple-touch-icon.png" },
};

export const teamAppViewport: Viewport = { themeColor: "#231d18" };
