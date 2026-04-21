"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
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
            fontFamily: "var(--font-display)",
            fontSize: 11,
            color: "#C9A961",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: 20,
          }}>
            Something went wrong
          </div>
          <div style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "#5A5550",
            lineHeight: 1.7,
            marginBottom: 32,
            maxWidth: 280,
          }}>
            {this.state.error.message || "An unexpected error occurred."}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "transparent",
              border: "1px solid #252525",
              borderRadius: 2,
              padding: "8px 20px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#3a3a3a",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
