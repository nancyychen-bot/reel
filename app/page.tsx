import Link from "next/link";

const BLUE = "#1B2FBB";
const INK  = "#0d1a6e";

function TvIllustration() {
  return (
    <svg
      viewBox="0 0 390 480"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="390" height="480" fill={BLUE} />

      {/* ── TV ── */}
      {/* Outer bezel */}
      <rect x="42" y="52" width="306" height="210" rx="10"
        stroke={INK} strokeWidth="4.5" fill="none" />
      {/* Screen */}
      <rect x="56" y="66" width="278" height="182" rx="5"
        stroke={INK} strokeWidth="2.5" fill={INK} fillOpacity="0.12" />
      {/* Scanlines hint */}
      {[0,1,2,3,4].map(i =>
        <line key={i}
          x1="56" y1={100 + i * 34} x2="334" y2={100 + i * 34}
          stroke={INK} strokeWidth="0.8" strokeOpacity="0.25" />
      )}
      {/* Stand neck */}
      <line x1="195" y1="262" x2="195" y2="306"
        stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      {/* Stand base */}
      <rect x="148" y="304" width="94" height="12" rx="5"
        stroke={INK} strokeWidth="3.5" fill="none" />

      {/* ── Sofa ── */}
      {/* Seat cushion */}
      <rect x="28" y="368" width="334" height="70" rx="8"
        stroke={INK} strokeWidth="4" fill="none" />
      {/* Back rest */}
      <rect x="28" y="330" width="334" height="44" rx="8"
        stroke={INK} strokeWidth="4" fill="none" />
      {/* Left arm */}
      <rect x="14" y="348" width="24" height="90" rx="7"
        stroke={INK} strokeWidth="3.5" fill="none" />
      {/* Right arm */}
      <rect x="352" y="348" width="24" height="90" rx="7"
        stroke={INK} strokeWidth="3.5" fill="none" />
      {/* Seat divider seam */}
      <line x1="195" y1="368" x2="195" y2="438"
        stroke={INK} strokeWidth="2" strokeOpacity="0.4" strokeDasharray="4 4" />

      {/* ── Person left ── */}
      {/* Head */}
      <circle cx="118" cy="300" r="26"
        stroke={INK} strokeWidth="4" fill={BLUE} />
      {/* Torso */}
      <path d="M90,330 Q90,368 92,368 L144,368 Q146,368 146,330 Q133,320 118,320 Q103,320 90,330Z"
        stroke={INK} strokeWidth="3.5" fill={BLUE} />
      {/* Left arm reaching toward right person */}
      <path d="M144,340 Q162,344 170,348"
        stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* ── Person right ── */}
      {/* Head */}
      <circle cx="272" cy="300" r="26"
        stroke={INK} strokeWidth="4" fill={BLUE} />
      {/* Torso */}
      <path d="M244,330 Q244,368 246,368 L298,368 Q300,368 300,330 Q287,320 272,320 Q257,320 244,330Z"
        stroke={INK} strokeWidth="3.5" fill={BLUE} />

      {/* ── Decorative dots / sparkles ── */}
      <circle cx="36"  cy="200" r="5" stroke={INK} strokeWidth="2.5" fill="none" />
      <circle cx="358" cy="160" r="5" stroke={INK} strokeWidth="2.5" fill="none" />
      <circle cx="28"  cy="310" r="3.5" fill={INK} fillOpacity="0.35" />
      <circle cx="362" cy="290" r="3.5" fill={INK} fillOpacity="0.35" />

      {/* star left */}
      <line x1="46" y1="154" x2="46" y2="142" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="40" y1="148" x2="52" y2="148" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="41" y1="143" x2="51" y2="153" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="41" y1="153" x2="51" y2="143" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />

      {/* star right */}
      <line x1="350" y1="84" x2="350" y2="72" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="344" y1="78" x2="356" y2="78" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="345" y1="73" x2="355" y2="83" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="345" y1="83" x2="355" y2="73" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: BLUE,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* Illustration — top portion */}
      <div style={{ flex: "0 0 58%", position: "relative" }}>
        <TvIllustration />
      </div>

      {/* Text + CTAs — bottom portion */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 28px calc(48px + env(safe-area-inset-bottom, 0px))",
      }}>
        {/* Wordmark */}
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 88,
          color: "#F5F1EA",
          lineHeight: 0.88,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}>
          Reel
        </div>

        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "rgba(245,241,234,0.5)",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}>
          A Film Club With Friends
        </div>

        <p style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.65,
          color: "rgba(245,241,234,0.72)",
          marginBottom: 32,
          maxWidth: 300,
        }}>
          Stop spending hours finding something to watch. Pick vibes, swipe curated films and match with friends. Tonight is sorted.
        </p>

        {/* Log in */}
        <Link href="/login" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 54,
          borderRadius: 4,
          background: "#E8453C",
          color: "#fff",
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textDecoration: "none",
          marginBottom: 14,
        }}>
          Log in
        </Link>

        {/* Create account */}
        <Link href="/login?signup=1" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 44,
          color: "rgba(245,241,234,0.6)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 400,
          letterSpacing: "0.02em",
          textDecoration: "none",
        }}>
          Create an account
        </Link>
      </div>
    </div>
  );
}
