import type { Metadata } from "next";
import { Bebas_Neue, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import GrainOverlay from "@/components/GrainOverlay";

const bebas = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
});

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Reel",
  description: "Tinder for movies. Match films with friends.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bebas.variable} ${figtree.variable} ${jetbrains.variable} h-full`}
    >
      <body className="h-full antialiased">
        <GrainOverlay />
        {children}
      </body>
    </html>
  );
}
