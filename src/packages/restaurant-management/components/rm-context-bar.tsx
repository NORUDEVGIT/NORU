/**
 * Phase 8F4 — Restaurant Management context bar.
 *
 * Some canonical Restaurant Management screens (POS & Sales, Payments &
 * Cashiering, Kitchen) are full-screen operating surfaces rendered without the
 * shell. This slim bar gives them the same package context — breadcrumb, title
 * and a way back — without introducing a second application shell.
 * Presentation only.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { RM_MODULES } from "@/packages/restaurant-management/lib/restaurant-management-modules";

export function RmContextBar({ moduleKey, note }: { moduleKey: string; note?: string }) {
  const mod = RM_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return null;
  return (
    <div className="border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          to="/restaurant/restaurant-management"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Restaurant Management
        </Link>
        <span className="text-sm font-medium">· {mod.title}</span>
        <nav aria-label="Breadcrumb" className="ml-auto text-xs text-muted-foreground">
          <Link to="/restaurant/home" className="hover:text-foreground">
            Property Home
          </Link>
          <span className="px-1.5">→</span>
          <Link to="/restaurant/restaurant-management" className="hover:text-foreground">
            Restaurant Management
          </Link>
          <span className="px-1.5">→</span>
          <span className="text-foreground">{mod.title}</span>
        </nav>
      </div>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
