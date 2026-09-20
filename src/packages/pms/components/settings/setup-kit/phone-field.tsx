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
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
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
import { PropertySetupField } from "./form-grid";

export function PropertySetupPhoneField({
  id = "property-setup-phone",
  label = "Phone",
  value,
  onChange,
  required,
  helper,
  error,
  disabled,
  readOnly,
  defaultIso,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  helper?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  defaultIso?: string | null;
}) {
  const parsed = useMemo(() => decomposeSetupPhone(value), [value]);
  const iso = setupPhoneDisplayIso(value, defaultIso);
  const country = iso ? propertySetupCallingCountry(iso) : undefined;
  const [open, setOpen] = useState(false);

  function emit(nextIso: string | null, localNumber: string) {
    onChange(composeSetupPhone(nextIso, localNumber));
  }

  return (
    <PropertySetupField
      id={id}
      label={label}
      icon="phone"
      required={required}
      helper={helper}
      error={error}
      disabled={disabled}
    >
      <div className="flex min-w-0 gap-2" data-testid="property-setup-phone">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-label="Country calling code"
              disabled={disabled || readOnly}
              className={cn(PROPERTY_SETUP_CONTROL_CLASS, "w-[9.5rem] justify-between px-2")}
            >
              <span className="truncate text-left">
                {country ? `${country.flag} +${country.dialCode}` : "Code"}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[22rem] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country" />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {PROPERTY_SETUP_CALLING_COUNTRIES.map((row) => (
                    <CommandItem
                      key={row.iso}
                      value={`${row.name} ${row.iso} ${row.dialCode}`}
                      onSelect={() => {
                        emit(row.iso, parsed.localNumber);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 size-4", iso === row.iso ? "opacity-100" : "opacity-0")}
                      />
                      <span className="mr-2">{row.flag}</span>
                      <span className="flex-1 truncate">{row.name}</span>
                      <span className="text-muted-foreground">+{row.dialCode}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-invalid={Boolean(error)}
          disabled={disabled}
          readOnly={readOnly}
          value={parsed.localNumber}
          placeholder="Local number"
          className={PROPERTY_SETUP_CONTROL_CLASS}
          onChange={(event) => {
            emit(setupPhoneDisplayIso(value, defaultIso), filterPhoneDigits(event.target.value));
          }}
        />
      </div>
    </PropertySetupField>
  );
}
