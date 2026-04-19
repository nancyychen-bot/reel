"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href:  "/swipe",
    label: "Swipe",
    glyph: "◈",
  },
  {
    href:  "/friends",
    label: "Friends",
    glyph: null, // SVG
  },
  {
    href:  "/rooms",
    label: "Room",
    glyph: "⊕",
  },
  {
    href:  "/lists",
    label: "Lists",
    glyph: "≡",
  },
] as const;

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none"
      stroke={active ? "#F5F1EA" : "#8A8580"} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10.5" cy="7" r="3.5"/>
      <path d="M3 19c0-4.142 3.358-7.5 7.5-7.5S18 14.858 18 19"/>
    </svg>
  );
}

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(100vw, 390px)",
      height: 70,
      background: "#0A0A0A",
      borderTop: "1px solid #161616",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      paddingBottom: 6,
      zIndex: 100,
    }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
              opacity: active ? 1 : 0.3,
              transition: "opacity 0.15s",
            }}
          >
            {tab.glyph === null ? (
              <ProfileIcon active={active} />
            ) : (
              <span style={{
                fontSize: 20,
                color: active ? "#F5F1EA" : "#8A8580",
                lineHeight: 1,
              }}>
                {tab.glyph}
              </span>
            )}
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: active ? "#6a6560" : "#2a2a2a",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
