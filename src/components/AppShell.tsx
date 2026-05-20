"use client";

import { ScrapeProvider } from "@/components/ScrapeProvider";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ScrapeProvider>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto h-full w-full max-w-7xl px-6 py-8 lg:px-8">
          {children}
        </div>
      </main>
    </ScrapeProvider>
  );
}
