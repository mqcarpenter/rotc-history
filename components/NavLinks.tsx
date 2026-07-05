"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/standings", label: "Standings" },
  { href: "/records/single-game", label: "Single Game" },
  { href: "/records/single-season", label: "Single Season" },
  { href: "/records/career", label: "Career" },
  { href: "/postseason", label: "Postseason" },
  { href: "/teams", label: "Teams" },
  { href: "/gamecenter", label: "Game Center" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="mt-3 flex flex-wrap gap-x-1 gap-y-1 text-sm">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              active
                ? "bg-indigo-600 text-white font-medium"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
