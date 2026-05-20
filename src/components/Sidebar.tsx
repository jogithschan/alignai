"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Settings, FileText, Activity, BarChart3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrape } from "@/components/ScrapeProvider";

const navItems = [
  { name: "Dashboard", href: "/", icon: Briefcase },
  { name: "Resumes", href: "/resumes", icon: FileText },
  { name: "Activity", href: "/activity", icon: Activity },
  { name: "API Usage", href: "/usage", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isRunning, message, status } = useScrape();

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Briefcase className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium text-sidebar-foreground">AlignAI</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        {isRunning ? (
          <div className="flex items-start gap-2">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground">Scraping in background</p>
              {message && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{message}</p>
              )}
            </div>
          </div>
        ) : status === "completed" && message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : status === "failed" && message ? (
          <p className="text-xs text-destructive">{message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Scraper ready</p>
        )}
      </div>
    </aside>
  );
}
