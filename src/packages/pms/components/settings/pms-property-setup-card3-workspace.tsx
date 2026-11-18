import type { ReactNode } from "react";

import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";

export const DOMAIN_ICON_KEYS: Record<Card3Domain["icon"], PropertySetupFieldIconKey> = {
  banknote: "money",
  receipt: "tax",
  tag: "tag",
  "credit-card": "payment",
  "file-text": "document",
  building: "facility",
  "trending-up": "revenue",
};

export function Card3DomainIcon({
  icon,
  className,
}: {
  icon: Card3Domain["icon"];
  className?: string;
}) {
  const Icon = propertySetupFieldIcon(DOMAIN_ICON_KEYS[icon]);
  return <Icon aria-hidden="true" className={className} />;
}

/**
 * Domain content slot for Financial & Commercial.
 * Card title + step nav live in PropertySetupWorkspaceShell; keep this dense
 * so content aligns with Rooms & Operations / Property & Business.
 */
export function PmsPropertySetupCard3Workspace({
  domain,
  children,
}: {
  domain: Card3Domain;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3" data-testid={`pms-card3-domain-${domain.id}`}>
      <div className="min-w-0 space-y-3" data-testid="pms-card3-content-slot">
        {children}
      </div>
    </div>
  );
}
