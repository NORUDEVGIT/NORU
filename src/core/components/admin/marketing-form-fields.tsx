import type { ReactNode } from "react";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  MARKETING_ADMIN_STATUS_LABELS,
  MARKETING_ITEM_STATUSES,
  MARKETING_NAV_HREFS,
  MARKETING_NAV_PLACEMENTS,
  MARKETING_PACKAGE_ICON_KEYS,
  type MarketingItemStatus,
  type MarketingNavHref,
  type MarketingNavPlacement,
  type MarketingPackageIconKey,
} from "@/core/lib/marketing";
import { cn } from "@/shared/lib/utils";

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <Input
        id={id}
        value={value}
        {...(placeholder ? { placeholder } : {})}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function StatusSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: MarketingItemStatus;
  onChange: (value: MarketingItemStatus) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as MarketingItemStatus)}
      {...(disabled ? { disabled: true } : {})}
    >
      <SelectTrigger id={id} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARKETING_ITEM_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {MARKETING_ADMIN_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function HrefSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: MarketingNavHref;
  onChange: (value: MarketingNavHref) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as MarketingNavHref)}
      {...(disabled ? { disabled: true } : {})}
    >
      <SelectTrigger id={id} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARKETING_NAV_HREFS.map((href) => (
          <SelectItem key={href} value={href}>
            {href}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlacementSelect({
  value,
  onChange,
  disabled,
}: {
  value: MarketingNavPlacement;
  onChange: (value: MarketingNavPlacement) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as MarketingNavPlacement)}
      {...(disabled ? { disabled: true } : {})}
    >
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARKETING_NAV_PLACEMENTS.map((placement) => (
          <SelectItem key={placement} value={placement}>
            {placement}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function IconSelect({
  value,
  onChange,
}: {
  value: MarketingPackageIconKey;
  onChange: (value: MarketingPackageIconKey) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as MarketingPackageIconKey)}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARKETING_PACKAGE_ICON_KEYS.map((icon) => (
          <SelectItem key={icon} value={icon}>
            {icon.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
