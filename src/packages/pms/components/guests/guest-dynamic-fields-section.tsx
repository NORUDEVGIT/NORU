import type { ResolvedGuestFieldRule } from "@/packages/pms/lib/guest-field-rules";
import { GuestDynamicFieldControl } from "./guest-dynamic-field-control";

export interface GuestDynamicFieldsSectionProps {
  fields: ResolvedGuestFieldRule[];
  values: Record<string, unknown>;
  onChange: (fieldIdOrCode: string, value: unknown) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
  title?: string;
  description?: string;
  isCreateMode?: boolean;
}

export function GuestDynamicFieldsSection({
  fields,
  values,
  onChange,
  disabled = false,
  errors = {},
  title = "Additional Information",
  description = "Custom operational information configured for this property.",
  isCreateMode = false,
}: GuestDynamicFieldsSectionProps) {
  // Only display fields that are relevant:
  // - in create mode: only active fields
  // - in edit mode: active fields, OR inactive fields if they have an existing value
  const visibleFields = fields.filter((f) => {
    if (f.category !== "custom_value") return false;
    if (isCreateMode) return f.active;
    const val = values[f.id] ?? values[f.code] ?? values[f.code.toLowerCase()];
    const hasValue = val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
    return f.active || hasValue;
  });

  if (visibleFields.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-[#EBE5DA] bg-[#FAF8F5]/60 p-4" data-testid="guest-dynamic-fields-section">
      <div className="border-b border-[#EBE5DA] pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">{title}</h4>
        {description && <p className="text-[11px] text-[#756A5B] mt-0.5">{description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleFields.map((field) => {
          const val = values[field.id] ?? values[field.code] ?? values[field.code.toLowerCase()] ?? null;
          const err = errors[field.id] ?? errors[field.code] ?? null;
          return (
            <GuestDynamicFieldControl
              key={field.id}
              field={field}
              value={val}
              onChange={(newVal) => onChange(field.id, newVal)}
              disabled={disabled || (!field.active && !isCreateMode)}
              error={err}
            />
          );
        })}
      </div>
    </div>
  );
}
