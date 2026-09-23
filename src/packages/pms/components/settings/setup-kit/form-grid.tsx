import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import {
  propertySetupFieldIcon,
  type PropertySetupFieldIconKey,
} from "@/packages/pms/lib/pms-property-setup-field-icons";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import { PropertySetupSectionHeader } from "./section-header";

export function PropertySetupField({
  id,
  label,
  icon,
  required,
  helper,
  error,
  disabled,
  readOnly,
  children,
}: {
  id?: string;
  label: string;
  icon?: PropertySetupFieldIconKey | LucideIcon;
  required?: boolean;
  helper?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const Icon = icon ? (typeof icon === "string" ? propertySetupFieldIcon(icon) : icon) : null;
  return (
    <div
      className={cn("min-w-0 space-y-1.5", (disabled || readOnly) && "opacity-70")}
      data-testid="property-setup-field"
    >
      <Label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-[#251605]">
        {Icon ? (
          <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        ) : null}
        {label}
        {required ? <span className="text-red-600">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={id ? `${id}-error` : undefined} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {!error && helper ? (
        <p id={id ? `${id}-helper` : undefined} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export function PropertySetupPanel({
  title,
  helper,
  icon,
  testId,
  children,
}: {
  title: string;
  helper?: string;
  icon: PropertySetupFieldIconKey | LucideIcon;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-2xl border border-[#E6E1D8] bg-white p-5"
      data-testid={testId}
    >
      <PropertySetupSectionHeader icon={icon} title={title} description={helper} />
      {children}
    </section>
  );
}

export function PropertySetupSettingRow({
  id,
  label,
  helper,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] px-3 py-2.5">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-[#251605]">
          {label}
        </Label>
        {helper ? <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    </div>
  );
}

export function PropertySetupFormGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
      data-testid="property-setup-form-grid"
    >
      {children}
    </div>
  );
}

export function PropertySetupFormItem({
  span = 1,
  children,
}: {
  span?: 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("min-w-0", span >= 2 && "md:col-span-2", span >= 3 && "xl:col-span-3")}
      data-span={span}
    >
      {children}
    </div>
  );
}
