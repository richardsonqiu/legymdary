import type { MetadataRoute } from "next";

/** Installable PWA: "Add to Home Screen" opens full-screen on the dashboard. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeGYMdary — the Legendary Gym Diary",
    short_name: "LeGYMdary",
    description: "Log workouts, meals and body stats; track PRs and progress.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
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
