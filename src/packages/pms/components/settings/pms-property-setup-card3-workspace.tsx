import type { ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CreditCard,
  FileText,
  History,
  Receipt,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  CARD3_AUDIT_HISTORY_LABEL,
  CARD3_BACK_LABEL,
  type Card3Domain,
} from "@/packages/pms/lib/pms-property-setup-card3";

const DOMAIN_ICONS: Record<Card3Domain["icon"], LucideIcon> = {
  banknote: Banknote,
  receipt: Receipt,
  tag: Tag,
  utensils: UtensilsCrossed,
  "credit-card": CreditCard,
  "file-text": FileText,
  building: Building2,
  "trending-up": TrendingUp,
};

export function Card3DomainIcon({
  icon,
  className,
}: {
  icon: Card3Domain["icon"];
  className?: string;
}) {
  const Icon = DOMAIN_ICONS[icon];
  return <Icon aria-hidden="true" className={className} />;
}

/**
 * Shared Card 3 domain workspace shell. Phase 0 proves header, optional tabs,
 * main content, search/filter, table, and drawer slots. No persistence.
 */
export function PmsPropertySetupCard3Workspace({
  domain,
  onBack,
  tabs,
  search,
  drawer,
  children,
}: {
  domain: Card3Domain;
  onBack: () => void;
  tabs?: ReactNode;
  search?: ReactNode;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5" data-testid={`pms-card3-domain-${domain.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2"
            data-testid="pms-card3-domain-back"
          >
            <ArrowLeft aria-hidden="true" className="size-3" />
            {CARD3_BACK_LABEL}
          </button>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#E6D7B8] bg-[#C89933]/10 text-[#251605]">
              <Card3DomainIcon icon={domain.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-3xl text-[#251605]">{domain.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{domain.description}</p>
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" disabled data-testid="pms-card3-audit-history">
          <History aria-hidden="true" className="size-4" />
          {CARD3_AUDIT_HISTORY_LABEL}
        </Button>
      </header>

      {tabs ? (
        <div data-testid="pms-card3-tabs-slot">{tabs}</div>
      ) : (
        <div className="sr-only" data-testid="pms-card3-tabs-slot">
          Tabs slot
        </div>
      )}

      {search ? <div data-testid="pms-card3-search-slot">{search}</div> : null}

      <div
        className={cn("grid gap-4", drawer ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1")}
        data-testid="pms-card3-workspace-layout"
      >
        <div className="min-w-0 space-y-4" data-testid="pms-card3-content-slot">
          {children}
        </div>
        {drawer ? (
          <aside className="min-w-0" data-testid="pms-card3-drawer-slot">
            {drawer}
          </aside>
        ) : (
          <aside className="sr-only" data-testid="pms-card3-drawer-slot">
            Drawer slot
          </aside>
        )}
      </div>
    </div>
  );
}
