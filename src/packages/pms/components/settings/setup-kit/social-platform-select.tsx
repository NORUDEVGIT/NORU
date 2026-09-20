import { useState } from "react";
import { Check, ChevronsUpDown, Link2 } from "lucide-react";
import {
  siFacebook,
  siInstagram,
  siTelegram,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";

import {
  PROPERTY_SETUP_SOCIAL_PLATFORMS,
  type PropertySetupSocialPlatformId,
} from "@/packages/pms/lib/pms-property-setup-social";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

const BRAND_ICONS: Partial<Record<PropertySetupSocialPlatformId, SimpleIcon>> = {
  facebook: siFacebook,
  instagram: siInstagram,
  x: siX,
  youtube: siYoutube,
  tiktok: siTiktok,
  telegram: siTelegram,
  whatsapp: siWhatsapp,
};

export type SocialPlatformOption = { id: string; label: string };

export function SocialBrandMark({ id, className }: { id: string; className?: string }) {
  const icon = BRAND_ICONS[id as PropertySetupSocialPlatformId];
  if (!icon) {
    return <Link2 className={cn("size-4 shrink-0 text-muted-foreground", className)} aria-hidden />;
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  );
}

export function SocialPlatformSelect({
  id = "property-setup-social",
  value,
  onChange,
  disabled,
  placeholder = "Select platform",
  options = PROPERTY_SETUP_SOCIAL_PLATFORMS,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  options?: readonly SocialPlatformOption[];
}) {
  const [open, setOpen] = useState(false);
  const listed = options.some((row) => row.id === value)
    ? options
    : value
      ? [...options, { id: value, label: value }]
      : options;
  const selected = listed.find((row) => row.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(PROPERTY_SETUP_CONTROL_CLASS, "justify-between")}
          data-testid="property-setup-social-select"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <SocialBrandMark id={selected.id} />
            ) : (
              <Link2 className="size-4 text-muted-foreground" aria-hidden />
            )}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search platforms" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {listed.map((row) => (
                <CommandItem
                  key={row.id}
                  value={`${row.label} ${row.id}`}
                  onSelect={() => {
                    onChange(row.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === row.id ? "opacity-100" : "opacity-0")}
                  />
                  <SocialBrandMark id={row.id} />
                  <span className="ml-2">{row.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
