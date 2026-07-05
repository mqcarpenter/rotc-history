import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "League History",
  description: "Fantasy football league history and records",
};

const NAV = [
  { href: "/standings", label: "Standings" },
  { href: "/records/single-game", label: "Single Game" },
  { href: "/records/single-season", label: "Single Season" },
  { href: "/records/career", label: "Career" },
  { href: "/postseason", label: "Postseason" },
  { href: "/teams", label: "Teams" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/" className="text-xl font-bold tracking-tight">
              League History
            </Link>
            <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-neutral-600 hover:text-neutral-900 hover:underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
          Data imported from MyFantasyLeague
        </footer>
      </body>
    </html>
  );
}
