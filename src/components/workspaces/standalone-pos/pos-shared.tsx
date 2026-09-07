/**
 * Phase 8H3 — small pieces shared by the Standalone POS screens.
 *
 * Package-neutral presentation only. Nothing here imports Restaurant
 * Management, PMS or Back Office code.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { POS_STATUS_LABEL, type PosModuleStatus } from "@/lib/standalone-pos-modules";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

/** Roles allowed to change POS catalog and settings (server-enforced too). */
export const POS_SETUP_ROLES = ["owner", "manager"];

export function canSetupPos(membership: RestaurantMembership): boolean {
  return POS_SETUP_ROLES.includes(membership.role);
}

export function PosHeader({
  title,
  description,
  propertyName,
  crumb,
  actions,
}: {
  title: string;
  description?: string;
  propertyName: string;
  crumb?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link to="/restaurant/home" className="hover:text-foreground">
          Property Home
        </Link>
        <span className="px-1.5">→</span>
        {crumb ? (
          <>
            <Link to="/restaurant/pos" className="hover:text-foreground">
              Standalone POS
            </Link>
            <span className="px-1.5">→</span>
            <span className="text-foreground">{crumb}</span>
          </>
        ) : (
          <span className="text-foreground">Standalone POS</span>
        )}
      </nav>
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShoppingCart className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{propertyName}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}

export function StatusPill({ status }: { status: PosModuleStatus }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {POS_STATUS_LABEL[status]}
    </span>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
