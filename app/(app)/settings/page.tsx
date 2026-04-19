"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      setUsername(data?.username ?? "");
    }
    load();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A" }}>
      <header style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(245,241,234,0.06)" }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontStyle: "italic",
          fontWeight: 700,
          color: "#F5F1EA",
        }}>
          Settings
        </h1>
      </header>

      <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 0 }}>

        <Row label="Username" value={`@${username}`} />
        <Row label="Email" value={email} />

        <div style={{ height: 32 }} />

        {/* Sign out */}
        <button
          onClick={signOut}
          style={{
            background: "transparent",
            border: "1px solid rgba(139,42,42,0.3)",
            color: "#8B2A2A",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "14px",
            cursor: "pointer",
            borderRadius: 2,
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px 0",
      borderBottom: "1px solid rgba(245,241,234,0.06)",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "#5A5550", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#F5F1EA" }}>
        {value}
      </span>
    </div>
  );
}
