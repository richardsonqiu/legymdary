import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
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
  title: "LeGYMdary — the Legendary Gym Diary",
  description:
    "Log workouts, track personal records, body stats and progress over time.",
  applicationName: "LeGYMdary",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LeGYMdary",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
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
    >
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
          <main className="flex-1 px-4 pb-28 pt-6">{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
