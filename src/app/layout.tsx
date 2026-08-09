import type { Metadata } from "next";
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
  title: "Warehouse App",
  description: "Warehouse workforce rostering, timekeeping & task-movement app",
};

// Deliberately minimal — shared by both the auth-gated app (src/app/(app)/
// layout.tsx, which has the header/nav and the actual login check) and
// /login, which sits outside that route group specifically so it doesn't
// get wrapped by its own gate (that would redirect-loop).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
