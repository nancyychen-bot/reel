import Link from "next/link";

function TvIllustration() {
  return (
    <svg
      viewBox="0 0 390 520"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Background gradient: deep cobalt → near-black at bottom */}
        <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#0E1D8E" />
          <stop offset="45%"  stopColor="#1A30BC" />
          <stop offset="100%" stopColor="#05091F" />
        </linearGradient>

        {/* Sketch/hand-drawn displacement filter */}
        <filter id="sketch" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="3" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="390" height="520" fill="url(#bgGrad)" />

      {/* All illustration elements get sketch filter */}
      <g filter="url(#sketch)" stroke="#0B175E" fill="none" strokeLinecap="round" strokeLinejoin="round">

        {/* ── TV body – slightly imperfect quad ── */}
        <path d="M48,58 Q46,50 56,50 L336,49 Q345,49 346,58 L347,252 Q347,261 337,262 L52,263 Q43,264 43,255 Z"
          strokeWidth="4" />
        {/* Screen inset */}
        <path d="M63,72 Q62,65 70,65 L321,64 Q329,64 330,72 L330,240 Q330,247 322,248 L69,249 Q62,249 62,241 Z"
          strokeWidth="2.5" fill="#0B175E" fillOpacity="0.15" />
        {/* Scanlines */}
        <line x1="63"  y1="100" x2="330" y2="99"  strokeWidth="0.9" strokeOpacity="0.2" />
        <line x1="63"  y1="130" x2="330" y2="131" strokeWidth="0.9" strokeOpacity="0.2" />
        <line x1="63"  y1="160" x2="330" y2="159" strokeWidth="0.9" strokeOpacity="0.2" />
        <line x1="63"  y1="190" x2="330" y2="191" strokeWidth="0.9" strokeOpacity="0.2" />
        <line x1="63"  y1="220" x2="330" y2="219" strokeWidth="0.9" strokeOpacity="0.2" />

        {/* Stand neck */}
        <path d="M193,263 Q195,278 196,308" strokeWidth="4.5" />
        {/* Stand base */}
        <path d="M148,308 Q152,304 196,304 Q240,305 244,310 Q240,316 196,317 Q152,316 148,310 Z"
          strokeWidth="3.5" />

        {/* ── Sofa ── */}
        {/* Back rest */}
        <path d="M24,332 Q23,325 32,325 L359,324 Q367,324 367,332 L367,366 Q367,374 358,374 L31,375 Q23,375 23,367 Z"
          strokeWidth="4" />
        {/* Seat cushion */}
        <path d="M23,374 Q22,367 31,366 L359,366 Q368,366 368,375 L368,432 Q368,440 359,441 L31,442 Q22,442 22,433 Z"
          strokeWidth="4" />
        {/* Left arm */}
        <path d="M10,350 Q9,344 17,343 L36,343 Q44,343 45,351 L45,440 Q45,447 37,447 L17,448 Q9,448 9,440 Z"
          strokeWidth="3.5" />
        {/* Right arm */}
        <path d="M346,343 Q354,342 355,350 L355,440 Q355,447 347,448 L365,447 Q373,448 374,440 L374,350 Q374,342 366,343 Z"
          strokeWidth="3.5" />
        {/* Centre seam */}
        <path d="M195,374 Q196,400 194,441" strokeWidth="2" strokeOpacity="0.35" strokeDasharray="5 5" />

        {/* ── Person left ── */}
        {/* Head – slightly oval */}
        <path d="M91,294 Q90,268 115,265 Q143,263 147,290 Q150,316 126,324 Q101,331 91,312 Q88,303 91,294Z"
          strokeWidth="4" fill="#1A30BC" />
        {/* Torso */}
        <path d="M87,332 Q83,367 87,375 L147,375 Q152,370 149,332 Q135,320 118,320 Q101,321 87,332Z"
          strokeWidth="3.5" fill="#1A30BC" />
        {/* Arm toward partner */}
        <path d="M147,344 Q162,347 175,353"
          strokeWidth="3.5" />

        {/* ── Person right ── */}
        {/* Head */}
        <path d="M244,292 Q242,265 268,263 Q296,261 301,288 Q305,315 282,323 Q257,330 246,312 Q242,303 244,292Z"
          strokeWidth="4" fill="#1A30BC" />
        {/* Torso */}
        <path d="M241,330 Q237,365 241,375 L301,375 Q306,370 303,330 Q289,318 272,318 Q255,319 241,330Z"
          strokeWidth="3.5" fill="#1A30BC" />

        {/* ── Decorative marks ── */}
        {/* Circle left */}
        <circle cx="34"  cy="200" r="6"   strokeWidth="2.5" />
        {/* Circle right */}
        <circle cx="358" cy="158" r="6"   strokeWidth="2.5" />
        {/* Dot left */}
        <circle cx="28"  cy="314" r="3.5" fill="#0B175E" fillOpacity="0.4" strokeWidth="0" />
        {/* Dot right */}
        <circle cx="363" cy="290" r="3.5" fill="#0B175E" fillOpacity="0.4" strokeWidth="0" />

        {/* Star / cross left */}
        <line x1="46" y1="154" x2="46" y2="140" strokeWidth="2.5" />
        <line x1="39" y1="147" x2="53" y2="147" strokeWidth="2.5" />
        <line x1="41" y1="142" x2="51" y2="152" strokeWidth="2" strokeOpacity="0.6" />
        <line x1="41" y1="152" x2="51" y2="142" strokeWidth="2" strokeOpacity="0.6" />

        {/* Star / cross right */}
        <line x1="350" y1="86"  x2="350" y2="72"  strokeWidth="2.5" />
        <line x1="343" y1="79"  x2="357" y2="79"  strokeWidth="2.5" />
        <line x1="344" y1="73"  x2="354" y2="85"  strokeWidth="2" strokeOpacity="0.6" />
        <line x1="344" y1="85"  x2="354" y2="73"  strokeWidth="2" strokeOpacity="0.6" />

        {/* Small loose squiggle marks */}
        <path d="M360,220 Q364,216 360,212 Q356,208 360,204" strokeWidth="2" strokeOpacity="0.5" />
        <path d="M30,244 Q26,240 30,236 Q34,232 30,228"      strokeWidth="2" strokeOpacity="0.5" />
      </g>

      {/* Dark gradient overlay at the bottom — blends into text section */}
      <defs>
        <linearGradient id="fadeOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#05091F" stopOpacity="0"   />
          <stop offset="100%" stopColor="#05091F" stopOpacity="1"   />
        </linearGradient>
      </defs>
      <rect x="0" y="340" width="390" height="180" fill="url(#fadeOut)" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#05091F",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Illustration — fills whatever space remains above the text block */}
      <div style={{ flex: "1 1 0", minHeight: 0, position: "relative", overflow: "hidden" }}>
        <TvIllustration />
      </div>

      {/* Text + CTAs — sizes to its own content, never clipped */}
      <div style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        padding: "0 28px",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
        background: "#05091F",
      }}>
        {/* Wordmark */}
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(60px, 22vw, 88px)",
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
          color: "rgba(245,241,234,0.45)",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}>
          A Film Club With Friends
        </div>

        <p style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.65,
          color: "rgba(245,241,234,0.65)",
          marginBottom: 28,
          maxWidth: 300,
        }}>
          Stop spending hours finding something to watch. Pick vibes, swipe curated options and match on films you all like. Tonight is sorted.
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
          marginBottom: 12,
        }}>
          Log in
        </Link>

        {/* Create account */}
        <Link href="/login?signup=1" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 44,
          color: "rgba(245,241,234,0.5)",
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
