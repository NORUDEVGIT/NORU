import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";

export function PropertySetupSectionHeader({
  icon,
  title,
  description,
  dense,
  action,
}: {
  icon: PropertySetupFieldIconKey | LucideIcon;
  title: string;
  description?: string;
  dense?: boolean;
  action?: ReactNode;
}) {
  const Icon = typeof icon === "string" ? propertySetupFieldIcon(icon) : icon;
  return (
    <div
      className={
        dense
          ? "flex flex-wrap items-center justify-between gap-2.5"
          : "flex flex-wrap items-start justify-between gap-3"
      }
      data-testid="property-setup-section-header"
    >
      <div className={dense ? "flex min-w-0 items-center gap-2.5" : "flex min-w-0 items-start gap-3"}>
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
          <h2
            className={
              dense
                ? "font-sans text-base font-semibold text-[#251605]"
                : "font-sans text-lg font-semibold text-[#251605]"
            }
          >
            {title}
          </h2>
          {description ? (
            <p
              className={
                dense
                  ? "mt-0.5 text-xs text-muted-foreground"
                  : "mt-0.5 text-sm text-muted-foreground"
              }
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
