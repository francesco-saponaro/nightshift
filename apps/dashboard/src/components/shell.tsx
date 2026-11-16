import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The mark: the night's half of a day. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor" />
    </svg>
  );
}

const items = [
  {
    to: "/",
    label: "Incidents",
    icon: (
      <svg {...ICON}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    to: "/skills",
    label: "Skills",
    icon: (
      <svg {...ICON}>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
        <path d="M5 4v16a3 3 0 0 1 3-3h11" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <svg {...ICON}>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
    ),
  },
] as const;

/** An icon rail on the ground, the mark at its top; a bottom bar with labels on a phone. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="rail" aria-label="Nightshift">
        <div className="mark" title="Nightshift">
          <Mark />
        </div>
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="item" title={item.label} activeOptions={{ exact: item.to === "/" }}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <main className="canvas">{children}</main>
    </>
  );
}
