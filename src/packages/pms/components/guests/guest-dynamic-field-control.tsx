import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { NormalizedFieldOption, ResolvedGuestFieldRule } from "@/packages/pms/lib/guest-field-rules";

export interface DynamicFieldControlProps {
  field: {
    id: string;
    code: string;
    label: string;
    fieldType: string;
    options: NormalizedFieldOption[];
    minValue?: number | null;
    maxValue?: number | null;
    required?: boolean;
    active?: boolean;
  };
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error?: string | null;
}

export function GuestDynamicFieldControl({
  field,
  value,
  onChange,
  disabled = false,
  error,
}: DynamicFieldControlProps) {
  const inputId = `dynamic-field-${field.id}`;

  const renderControl = () => {
    const inputClass =
      "h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70";

    switch (field.fieldType) {
      case "text":
      case "address": {
        const strVal = typeof value === "string" ? value : "";
        return (
          <Input
            id={inputId}
            value={strVal}
            disabled={disabled}
            placeholder={`Enter ${field.label.toLowerCase()}`}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        );
      }
      case "phone": {
        const strVal = typeof value === "string" ? value : "";
        return (
          <Input
            id={inputId}
            type="tel"
            value={strVal}
            disabled={disabled}
            placeholder="+1 555 000 0000"
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        );
      }
      case "email": {
        const strVal = typeof value === "string" ? value : "";
        return (
          <Input
            id={inputId}
            type="email"
            value={strVal}
            disabled={disabled}
            placeholder="guest@example.com"
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        );
      }
      case "number": {
        const numVal = typeof value === "number" || typeof value === "string" ? String(value) : "";
        return (
          <Input
            id={inputId}
            type="number"
            value={numVal}
            disabled={disabled}
            min={field.minValue ?? undefined}
            max={field.maxValue ?? undefined}
            placeholder={field.minValue != null ? `Min ${field.minValue}` : "0"}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === "" ? null : Number(val));
            }}
            className={inputClass}
          />
        );
      }
      case "date": {
        const dateVal = typeof value === "string" ? value : "";
        return (
          <Input
            id={inputId}
            type="date"
            value={dateVal}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          />
        );
      }
      case "select": {
        const selectVal = typeof value === "string" && value ? value : "none";
        return (
          <Select
            value={selectVal}
            disabled={disabled}
            onValueChange={(val) => onChange(val === "none" ? null : val)}
          >
            <SelectTrigger
              id={inputId}
              className="h-10 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between"
            >
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not set</SelectItem>
              {field.options
                .filter((opt) => opt.active || opt.value === value)
                .map((opt) => (
                  <SelectItem key={opt.id} value={opt.value}>
                    {opt.label} {!opt.active ? "(Inactive)" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        );
      }
      case "multi_select": {
        const selectedList = Array.isArray(value) ? (value as string[]) : [];
        const toggleOption = (optVal: string) => {
          if (disabled) return;
          if (selectedList.includes(optVal)) {
            onChange(selectedList.filter((v) => v !== optVal));
          } else {
            onChange([...selectedList, optVal]);
          }
        };

        return (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {field.options
              .filter((opt) => opt.active || selectedList.includes(opt.value))
              .map((opt) => {
                const isSelected = selectedList.includes(opt.value);
                return (
                  <Badge
                    key={opt.id}
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => toggleOption(opt.value)}
                    className={cn(
                      "cursor-pointer select-none rounded-[4px] text-xs transition-colors",
                      isSelected
                        ? "bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 border-transparent font-medium"
                        : "bg-white text-[#554A3D] hover:bg-[#F7F4EE] border-[#CCCCCC]",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {opt.label} {!opt.active ? "(Inactive)" : ""}
                  </Badge>
                );
              })}
            {field.options.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No options configured</span>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId} className="text-xs font-medium text-[#251605]">
          {field.label} {field.required ? <span className="text-destructive">*</span> : null}
          {field.active === false ? (
            <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(Inactive)</span>
          ) : null}
        </Label>
      </div>
      {renderControl()}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
