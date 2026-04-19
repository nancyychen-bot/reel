import Link from "next/link";

// Cobalt palette (matches HTML default)
const PAL = {
  bg:      "#1e3db0",
  ink:     "#0b1840",
  ctaBg:   "#E8453C",
  ctaText: "#fff",
  title:   "#F5F1EA",
  sub:     "rgba(245,241,234,0.72)",
  label:   "rgba(245,241,234,0.32)",
};

function FilmReelIllustration() {
  const { bg, ink } = PAL;
  return (
    <svg viewBox="0 0 390 620" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "72%", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="hd" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="turbulence" baseFrequency="0.018" numOctaves="3" seed="5" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <linearGradient id="fade-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="52%" stopColor={bg} stopOpacity="0"/>
          <stop offset="100%" stopColor="#0A0A0A" stopOpacity="1"/>
        </linearGradient>
      </defs>
      <rect width="390" height="620" fill={bg}/>

      {/* Film reel */}
      <g filter="url(#hd)" stroke={ink} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="195" cy="290" r="188" strokeWidth="5"/>
        <circle cx="195" cy="290" r="62"  strokeWidth="4.5"/>
        <circle cx="195" cy="290" r="58"  strokeWidth="0" fill={ink} opacity="0.08"/>
        {[0,60,120,180,240,300].map((deg, i) => {
          const r = deg * Math.PI / 180;
          return <circle key={i} cx={195 + 130*Math.cos(r)} cy={290 + 130*Math.sin(r)} r="26" strokeWidth="3.5"/>;
        })}
        {[0,60,120,180,240,300].map((deg, i) => {
          const r = deg * Math.PI / 180;
          return <line key={i}
            x1={195 + 64*Math.cos(r)}  y1={290 + 64*Math.sin(r)}
            x2={195 + 104*Math.cos(r)} y2={290 + 104*Math.sin(r)} strokeWidth="3.5"/>;
        })}
      </g>

      {/* Film strip top */}
      <g filter="url(#hd)" stroke={ink} fill="none" strokeWidth="3">
        <rect x="-4" y="8" width="400" height="52" rx="3"/>
        <rect x="-4" y="8" width="400" height="52" rx="3" fill={ink} opacity="0.07"/>
        {[0,1,2,3,4,5,6,7,8,9].map(i =>
          <rect key={i} x={8 + i*40} y="16" width="18" height="36" rx="3" strokeWidth="2.5"/>
        )}
      </g>

      {/* Clapperboard */}
      <g filter="url(#hd)" stroke={ink} fill="none" strokeWidth="3.5" strokeLinecap="round">
        <rect x="290" y="100" width="88" height="68" rx="3"/>
        <rect x="290" y="88"  width="88" height="18" rx="3" fill={ink} opacity="0.12"/>
        <line x1="306" y1="88" x2="299" y2="106" strokeWidth="3"/>
        <line x1="326" y1="88" x2="319" y2="106" strokeWidth="3"/>
        <line x1="346" y1="88" x2="339" y2="106" strokeWidth="3"/>
        <line x1="366" y1="88" x2="359" y2="106" strokeWidth="3"/>
        <circle cx="290" cy="97" r="5" fill={ink} opacity="0.3"/>
      </g>

      {/* Two figures watching */}
      <g filter="url(#hd)" stroke={ink} fill={bg} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="92"  cy="490" rx="22" ry="22"/>
        <path d="M68,514 C62,538 64,572 66,590 L118,590 C120,572 122,538 116,514 C110,507 98,504 92,504 C86,504 74,507 68,514Z"/>
        <ellipse cx="148" cy="487" rx="22" ry="22"/>
        <path d="M124,510 C118,534 120,568 122,590 L174,590 C176,568 178,534 172,510 C166,503 154,500 148,500 C142,500 130,503 124,510Z"/>
        <path d="M124,530 Q108,520 96,525" strokeWidth="3" fill="none"/>
      </g>

      {/* Sparkles */}
      <g stroke={ink} strokeWidth="2.8" strokeLinecap="round" fill="none">
        <line x1="46" y1="420" x2="46" y2="408"/><line x1="40" y1="414" x2="52" y2="414"/>
        <line x1="42" y1="410" x2="50" y2="418"/><line x1="42" y1="418" x2="50" y2="410"/>
        <line x1="355" y1="200" x2="355" y2="188"/><line x1="349" y1="194" x2="361" y2="194"/>
        <line x1="351" y1="190" x2="359" y2="198"/><line x1="351" y1="198" x2="359" y2="190"/>
        <circle cx="38"  cy="560" r="5" fill={ink} opacity="0.25"/>
        <circle cx="362" cy="480" r="4" fill={ink} opacity="0.2"/>
        <circle cx="270" cy="520" r="7" strokeWidth="2.5"/>
      </g>

      <rect width="390" height="620" fill="url(#fade-down)"/>
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "#0A0A0A" }}>

      <FilmReelIllustration />

      {/* Text content — bottom third */}
      <div style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 28px 48px",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 96,
            fontWeight: 400,
            color: PAL.title,
            lineHeight: 0.9,
            letterSpacing: "0em",
            textTransform: "uppercase",
          }}>
            Reel
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: PAL.label,
            letterSpacing: "0.22em",
            marginTop: 14,
          }}>
            A FILM CLUB WITH FRIENDS
          </div>
        </div>

        <p style={{
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          fontWeight: 400,
          lineHeight: 1.7,
          color: PAL.sub,
          maxWidth: 300,
          marginBottom: 36,
        }}>
          Stop spending hours finding something to watch. Pick vibes, swipe curated films and match with friends. Tonight is sorted.
        </p>

        <Link href="/login" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 54,
          borderRadius: 3,
          border: "none",
          background: PAL.ctaBg,
          color: PAL.ctaText,
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textDecoration: "none",
          marginBottom: 10,
          cursor: "pointer",
        }}>
          Get started
        </Link>

        <Link href="/demo" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 44,
          borderRadius: 3,
          background: "transparent",
          border: `1px solid ${PAL.label}`,
          color: PAL.label,
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: "0.08em",
          textDecoration: "none",
          cursor: "pointer",
        }}>
          Preview the app
        </Link>
      </div>
    </div>
  );
}
