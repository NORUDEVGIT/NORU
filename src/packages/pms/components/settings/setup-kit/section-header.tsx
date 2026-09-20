import type { LucideIcon } from "lucide-react";

import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";

export function PropertySetupSectionHeader({
  icon,
  title,
  description,
}: {
  icon: PropertySetupFieldIconKey | LucideIcon;
  title: string;
  description?: string;
}) {
  const Icon = typeof icon === "string" ? propertySetupFieldIcon(icon) : icon;
  return (
    <div className="flex items-start gap-3" data-testid="property-setup-section-header">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4EDE0] text-[#251605]">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="font-sans text-lg font-semibold text-[#251605]">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
