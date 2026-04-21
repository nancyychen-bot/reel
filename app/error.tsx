"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: "#0A0A0A",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 32px",
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: "var(--font-display, monospace)",
        fontSize: 11,
        color: "#C9A961",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        marginBottom: 20,
      }}>
        Something went wrong
      </div>
      <div style={{
        fontFamily: "var(--font-sans, sans-serif)",
        fontSize: 13,
        color: "#5A5550",
        marginBottom: 32,
        maxWidth: 280,
        lineHeight: 1.7,
      }}>
        {error.message || "An unexpected error occurred."}
      </div>
      <button
        onClick={reset}
        style={{
          background: "transparent",
          border: "1px solid #252525",
          borderRadius: 2,
          padding: "8px 20px",
          cursor: "pointer",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 10,
          color: "#3a3a3a",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        Try again
      </button>
    </div>
  );
}
