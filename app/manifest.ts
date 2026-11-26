import type { MetadataRoute } from "next";

/** Installable PWA: "Add to Home Screen" opens full-screen on the dashboard. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "One Up",
    short_name: "One Up",
    description: "One more rep, one better than yesterday. Training, food and recovery in one place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#191919",
    theme_color: "#191919",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Snap a meal", url: "/food", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Log workout", url: "/log", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
