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

/**
 * Picks light or dark before first paint. A saved Light or Dark wins.
 * Auto is dark when the phone is in dark mode, or at night on the phone's
 * own clock (7 pm to 7 am). Re-checked every minute and when the app comes
 * back to the foreground, so it flips at 7 pm without a reload.
 */
const THEME_SCRIPT = `(function(){var d=document.documentElement;function pick(){var t=null;try{t=localStorage.getItem("oneup.theme")}catch(e){}if(t==="light"||t==="dark")return t;var h=new Date().getHours();var night=h>=19||h<7;var sys=false;try{sys=window.matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}return sys||night?"dark":"light"}function a(){d.dataset.theme=pick()}a();window.__applyTheme=a;try{window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",a)}catch(e){}setInterval(a,60000);document.addEventListener("visibilitychange",function(){if(!document.hidden)a()})})();`;

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
