import type { LucideIcon } from "lucide-react";

import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";

export function PropertySetupSectionHeader({
  icon,
  title,
  description,
  dense,
}: {
  icon: PropertySetupFieldIconKey | LucideIcon;
  title: string;
  description?: string;
  dense?: boolean;
}) {
  const Icon = typeof icon === "string" ? propertySetupFieldIcon(icon) : icon;
  return (
    <div
      className={dense ? "flex items-center gap-2.5" : "flex items-start gap-3"}
      data-testid="property-setup-section-header"
    >
      <span
        className={
          dense
            ? "flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F4EDE0] text-[#251605]"
            : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4EDE0] text-[#251605]"
        }
      >
        {Icon ? (
          <Icon className={dense ? "size-4" : "size-5"} strokeWidth={1.75} aria-hidden />
        ) : null}
      </span>
      <div className="min-w-0">
        <h2 className={dense ? "font-sans text-base font-semibold text-[#251605]" : "font-sans text-lg font-semibold text-[#251605]"}>
          {title}
        </h2>
        {description ? (
          <p className={dense ? "mt-0.5 text-xs text-muted-foreground" : "mt-0.5 text-sm text-muted-foreground"}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
