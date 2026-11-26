import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "legymdari. Train, eat, recover",
    template: "%s · legymdari.",
  },
  description:
    "Training, food and recovery in one calm daily view.",
  applicationName: "legymdari.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "legymdari.",
  },
};

/** Picks light or dark before first paint: saved choice, else the system's. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("legymdari.theme");var m=window.matchMedia("(prefers-color-scheme: light)");function a(){var v=t==="light"||t==="dark"?t:(m.matches?"light":"dark");document.documentElement.dataset.theme=v;}a();m.addEventListener("change",function(){t=localStorage.getItem("legymdari.theme");a();});}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme script below sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
