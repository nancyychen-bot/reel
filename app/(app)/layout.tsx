import NavBar from "@/components/NavBar";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <div style={{ position: "absolute", inset: 0 }}>
        {children}
        <NavBar />
      </div>
    </ErrorBoundary>
  );
}
