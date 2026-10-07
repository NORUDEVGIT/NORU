import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  composeSetupPhone,
  decomposeSetupPhone,
  filterPhoneDigits,
  PROPERTY_SETUP_CALLING_COUNTRIES,
  propertySetupCallingCountry,
  setupPhoneDisplayIso,
} from "@/packages/pms/lib/pms-property-setup-phone";
import { Button } from "@/shared/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export interface CanonicalPhoneInputProps {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  error?: boolean | string | null;
  disabled?: boolean;
  readOnly?: boolean;
  defaultIso?: string | null;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  containerClassName?: string;
  size?: "sm" | "default" | "modal";
  "data-testid"?: string;
}

/**
 * Canonical phone number input used across all guest profile modules:
 * Guest (Individual), Company, Travel Agency, and Group profiles.
 *
 * Sourced from the Property Setup Card 1 calling code catalogue:
 * - Searchable country dropdown with flags, ISO codes, and dialing codes.
 * - Local numeric entry with automatic digits filtering.
 * - Composes standard E.164 canonical phone values (+<dialCode><number>).
 */
export function CanonicalPhoneInput({
  id,
  value = "",
  onChange,
  error,
  disabled = false,
  readOnly = false,
  defaultIso = "ET",
  placeholder = "Local number",
  className,
  triggerClassName,
  containerClassName,
  size = "modal",
  "data-testid": testId,
}: CanonicalPhoneInputProps) {
  const [open, setOpen] = useState(false);
  const safeValue = value ?? "";

  const parsed = useMemo(() => decomposeSetupPhone(safeValue), [safeValue]);

  const effectiveIso = useMemo(() => {
    if (parsed.iso) return parsed.iso;
    if (!safeValue || !safeValue.trim()) return defaultIso || "ET";
    return setupPhoneDisplayIso(safeValue, defaultIso || "ET") || defaultIso || "ET";
  }, [parsed.iso, safeValue, defaultIso]);

  const country = effectiveIso ? propertySetupCallingCountry(effectiveIso) : undefined;

  function emit(nextIso: string | null, localNumber: string) {
    const digits = filterPhoneDigits(localNumber);
    if (!digits) {
      onChange("");
      return;
    }
    const isoToUse = nextIso || effectiveIso || defaultIso || "ET";
    onChange(composeSetupPhone(isoToUse, digits));
  }

  const heightClass =
    size === "sm" ? "h-8" : size === "modal" ? "h-9" : "h-10";

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5", containerClassName)}
      data-testid={testId ? `${testId}-container` : "canonical-phone-input"}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Country calling code"
            disabled={disabled || readOnly}
            className={cn(
              heightClass,
              "w-[4.75rem] shrink-0 justify-between px-1.5 font-normal text-xs bg-white border-[#CCCCCC] rounded-[6px] transition-colors hover:border-[#8A641A] focus-visible:border-[#8A641A] focus-visible:ring-[#8A641A]",
              Boolean(error) && "!border-destructive ring-1 !ring-destructive/30",
              triggerClassName,
            )}
          >
            <span className="truncate text-left flex items-center gap-0.5">
              <span className="text-sm leading-none shrink-0">{country?.flag || "🌐"}</span>
              <span className="font-mono text-xs text-[#251605]">
                {country ? `+${country.dialCode}` : "+Code"}
              </span>
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-40 ml-0.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem] p-0 z-50 bg-white shadow-md border-[#CCCCCC]" align="start">
          <Command>
            <CommandInput placeholder="Search country or dial code..." className="text-xs" />
            <CommandList className="max-h-60">
              <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                No matching country.
              </CommandEmpty>
              <CommandGroup>
                {PROPERTY_SETUP_CALLING_COUNTRIES.map((row) => (
                  <CommandItem
                    key={row.iso}
                    value={`${row.name} ${row.iso} ${row.dialCode}`}
                    onSelect={() => {
                      emit(row.iso, parsed.localNumber);
                      setOpen(false);
                    }}
                    className="cursor-pointer text-xs"
                  >
                    <Check
                      className={cn("mr-2 size-4", effectiveIso === row.iso ? "opacity-100" : "opacity-0")}
                    />
                    <span className="mr-2 text-base leading-none">{row.flag}</span>
                    <span className="flex-1 truncate text-xs">{row.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">+{row.dialCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        data-testid={testId}
        type="text"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-invalid={Boolean(error)}
        disabled={disabled}
        readOnly={readOnly}
        value={parsed.localNumber}
        placeholder={placeholder}
        className={cn(
          heightClass,
          "flex-1 font-mono text-xs bg-white border-[#CCCCCC] rounded-[6px] transition-colors hover:border-[#8A641A] focus-visible:border-[#8A641A] focus-visible:ring-[#8A641A]",
          Boolean(error) && "!border-destructive ring-1 !ring-destructive/30",
          className,
        )}
        onChange={(event) => {
          emit(effectiveIso, filterPhoneDigits(event.target.value));
        }}
      />
    </div>
  );
}
