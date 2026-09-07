import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";

/**
 * Phase 7D.2B — clean landing page for PMS submodules whose deeper
 * functionality is planned. No forms, no mock data, no backend calls.
 */
export function PmsPlaceholder({
  title,
  icon: Icon,
  description,
  planned,
  children,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
  planned: string[];
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Icon className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Planned for this module
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {planned.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden className="text-accent">
                •
              </span>
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing here is live in your property yet — this page marks where the module will live.
        </p>
      </section>

      {children}

      <Link
        to="/restaurant/pms"
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to PMS
      </Link>
    </div>
  );
}
