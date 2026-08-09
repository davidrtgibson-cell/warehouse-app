import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, listActingUsers } from "@/lib/auth";
import { ActingAsPicker } from "@/components/ActingAsPicker";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [currentUser, actingUsers] = await Promise.all([getCurrentUser(), listActingUsers()]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Live board
              </Link>
              <Link href="/roster" className="hover:underline">
                Roster
              </Link>
              <Link href="/roster/build" className="hover:underline">
                Build roster
              </Link>
              <Link href="/reports" className="hover:underline">
                Reports
              </Link>
              <Link href="/settings" className="hover:underline">
                Settings
              </Link>
            </nav>
            <ActingAsPicker users={actingUsers} currentUserId={currentUser?.id ?? null} />
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
