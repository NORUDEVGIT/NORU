import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { PREFERENCE_TEXT_MAX } from "@/packages/pms/lib/guest-preferences-workspace";
import { PREFERENCE_SETUP_HREF } from "@/packages/pms/lib/guest-profile-wave2";
import {
  listGuestPreferenceWorkspace,
  type GuestPreferenceWorkspaceType,
} from "@/packages/pms/lib/guests.functions";

export interface GuestRegistrationPreferencesProps {
  restaurantId: string;
  answers: Record<string, string[]>;
  onChange: (typeId: string, values: string[]) => void;
  errors?: Record<string, string>;
  preferenceTypeIds?: string[];
  disabled?: boolean;
}

const NONE = "__none__";

function RegistrationTypeControl({
  type,
  values,
  onChange,
  disabled = false,
}: {
  type: GuestPreferenceWorkspaceType;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  // 1. MULTI SELECT
  if (type.valueType === "multi" || (type.valueType as string) === "multiselect") {
    if (type.options.length === 0) {
      return (
        <p className="text-xs text-[#756A5B] italic py-1">No active options configured.</p>
      );
    }

    const selectable = type.options.filter((opt) => opt.active);
    return (
      <div className="flex flex-wrap gap-2 pt-1" data-testid={`reg-pref-multi-${type.code}`}>
        {selectable.map((option) => {
          const checked = values.includes(option.value);
          return (
            <label
              key={option.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer select-none",
                checked
                  ? "border-[#C89933] bg-[#FBF7EE] text-[#8A641A] font-medium"
                  : "border-[#DDD4C5] bg-white text-[#756A5B] hover:border-[#8A641A]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => {
                  if (disabled) return;
                  if (next) {
                    onChange([...values, option.value]);
                  } else {
                    onChange(values.filter((item) => item !== option.value));
                  }
                }}
                className="size-3.5 border-[#DDD4C5] data-[state=checked]:bg-[#8A641A] data-[state=checked]:border-[#8A641A]"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // 2. YES / NO
  if (type.valueType === "yes_no") {
    const isYes = values[0] === "yes" || values[0] === "true";
    return (
      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={isYes}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked ? ["yes"] : ["no"])}
        />
        <span className="text-xs font-medium text-[#251605]">{isYes ? "Yes" : "No"}</span>
      </div>
    );
  }

  // 3. SINGLE SELECT
  if (type.valueType === "single") {
    const selected = values[0] ?? "";
    const selectable = type.options.filter((opt) => opt.active);
    return (
      <Select
        value={selected || NONE}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE ? [] : [next])}
      >
        <SelectTrigger className="bg-white border-[#DDD4C5] focus:ring-[#C89933]">
          <SelectValue placeholder="Choose a preference..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {selectable.map((option) => (
            <SelectItem key={option.id} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 4. NUMBER
  if (type.valueType === "number") {
    return (
      <Input
        type="number"
        value={values[0] ?? ""}
        disabled={disabled}
        placeholder="Enter number..."
        onChange={(e) => {
          const val = e.target.value.trim();
          onChange(val ? [val] : []);
        }}
        className="bg-white border-[#DDD4C5] focus-visible:ring-[#C89933]"
      />
    );
  }

  // 5. TEXT
  return (
    <Textarea
      value={values[0] ?? ""}
      disabled={disabled}
      maxLength={PREFERENCE_TEXT_MAX}
      placeholder="Special preferences or instructions..."
      onChange={(e) => {
        const val = e.target.value;
        onChange(val.trim() ? [val] : []);
      }}
      className="bg-white border-[#DDD4C5] focus-visible:ring-[#C89933] min-h-[60px]"
    />
  );
}

export function GuestRegistrationPreferences({
  restaurantId,
  answers,
  onChange,
  errors = {},
  preferenceTypeIds,
  disabled = false,
}: GuestRegistrationPreferencesProps) {
  const loadFn = useServerFn(listGuestPreferenceWorkspace);
  const query = useQuery({
    queryKey: ["guest-preferences-catalogue", restaurantId],
    queryFn: () => loadFn({ data: { restaurantId } }),
    staleTime: 5 * 60 * 1000,
  });

  const categories = query.data?.categories ?? [];

  // Filter for active preference types applicable to the individual profile type
  const activeTypes = useMemo(() => {
    const list: GuestPreferenceWorkspaceType[] = [];
    const allowedSet = preferenceTypeIds && preferenceTypeIds.length > 0 ? new Set(preferenceTypeIds) : null;

    for (const cat of categories) {
      if (!cat.active) continue;
      for (const t of cat.types) {
        if (!t.active) continue;
        if (allowedSet && !allowedSet.has(t.id)) continue;
        list.push(t);
      }
    }
    return list;
  }, [categories, preferenceTypeIds]);

  if (activeTypes.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-[#EBE5DA] bg-[#FAF8F5]/60 p-4" data-testid="guest-registration-preferences">
      <div className="border-b border-[#EBE5DA] pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">Preferences</h4>
        <p className="text-[11px] text-[#756A5B] mt-0.5">
          Select stay preferences for this guest. (Applies dynamically to future reservations)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {activeTypes.map((type) => {
          const vals = answers[type.id] ?? [];
          const err = errors[type.id] ?? null;

          return (
            <div key={type.id} className="space-y-1.5">
              <Label className="text-xs font-medium text-[#251605]">
                {type.name} {type.required ? <span className="text-destructive">*</span> : null}
              </Label>
              <RegistrationTypeControl
                type={type}
                values={vals}
                onChange={(next) => onChange(type.id, next)}
                disabled={disabled}
              />
              {err && <p className="text-xs text-destructive">{err}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
