import type { ReactNode } from "react";

import { PropertySetupSectionHeader } from "@/packages/pms/components/settings/setup-kit";
import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";

export const DOMAIN_ICON_KEYS: Record<Card3Domain["icon"], PropertySetupFieldIconKey> = {
  banknote: "money",
  receipt: "tax",
  tag: "tag",
  utensils: "meal",
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

export function PmsPropertySetupCard3Workspace({
  domain,
  children,
}: {
  domain: Card3Domain;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5" data-testid={`pms-card3-domain-${domain.id}`}>
      <PropertySetupSectionHeader
        icon={DOMAIN_ICON_KEYS[domain.icon]}
        title={domain.title}
        description={domain.description}
      />
      <div className="min-w-0 space-y-5" data-testid="pms-card3-content-slot">
        {children}
      </div>
    </div>
  );
}
