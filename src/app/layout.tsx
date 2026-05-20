import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AlignAI",
  description: "AI-powered job discovery and resume alignment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} h-full antialiased`}>
      <body className={`${inter.className} flex h-full min-h-full w-full overflow-hidden bg-background text-foreground`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
