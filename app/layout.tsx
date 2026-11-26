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
    default: "One Up: one better than yesterday",
    template: "%s · One Up",
  },
  description:
    "One more rep, one better than yesterday. Training, food and recovery in one place.",
  applicationName: "One Up",
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
    title: "One Up",
  },
};

/** Picks light or dark before first paint: saved choice, else dark from 7 PM to 6 AM local time. */
const THEME_SCRIPT = `(function(){try{function d(){var h=new Date().getHours();return h>=19||h<6;}function a(){var t=localStorage.getItem("oneup.theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:(d()?"dark":"light");}a();setInterval(a,60000);document.addEventListener("visibilitychange",a);}catch(e){document.documentElement.dataset.theme="dark";}})();`;

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
