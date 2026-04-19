import NavBar from "@/components/NavBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 64 }}>
      {children}
      <NavBar />
    </div>
  );
}
