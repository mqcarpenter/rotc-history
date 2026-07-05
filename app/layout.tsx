import type { Metadata } from "next";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "League History",
  description: "Fantasy football league history and records",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col text-neutral-900">
        <header className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/85 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/" className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              League History
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-neutral-200/80 py-6 text-center text-xs text-neutral-400">
          Data imported from MyFantasyLeague
        </footer>
      </body>
    </html>
  );
}
