/**
 * Phase 8H3 — honest "not built yet" page for Standalone POS areas that have
 * no working screen. It never pretends functionality exists.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PosHeader, StatusPill } from "./pos-shared";
import { getPosModule } from "@/lib/standalone-pos-modules";

export function PosFoundationPage({
  moduleKey,
  propertyName,
  what,
  children,
}: {
  moduleKey: string;
  propertyName: string;
  /** Plain list of what this area will do once built. */
  what: string[];
  children?: ReactNode;
}) {
  const mod = getPosModule(moduleKey);
  if (!mod) return null;
  return (
    <div className="space-y-6">
      <PosHeader
        title={mod.title}
        crumb={mod.title}
        propertyName={propertyName}
        description={mod.description}
      />

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg">Not built yet</h2>
          <StatusPill status={mod.status} />
        </div>
        {mod.note ? <p className="mt-1 text-sm text-muted-foreground">{mod.note}</p> : null}
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {what.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {children}

      <p className="text-sm text-muted-foreground">
        In the meantime you can set up the{" "}
        <Link to="/restaurant/pos/catalog" className="underline underline-offset-4">
          catalog
        </Link>{" "}
        and{" "}
        <Link to="/restaurant/pos/settings" className="underline underline-offset-4">
          settings
        </Link>
        .
      </p>
    </div>
  );
}
