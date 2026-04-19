import NavBar from "@/components/NavBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {children}
      <NavBar />
    </div>
  );
}
