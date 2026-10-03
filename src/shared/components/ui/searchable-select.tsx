import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export function SearchableSelect({
  id,
  value,
  options,
  disabled,
  placeholder = "Select",
  searchPlaceholder = "Search",
  emptyText = "No matches.",
  error,
  onChange,
  className,
  onSearchChange,
  allowCustomValue = false,
  shouldFilter = true,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean | undefined;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  error?: string | undefined;
  onChange: (value: string) => void;
  className?: string;
  onSearchChange?: (search: string) => void;
  allowCustomValue?: boolean;
  shouldFilter?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((row) => row.value === value);

  const displayLabel = selected?.label ?? (allowCustomValue && value ? value : placeholder);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      onSearchChange?.("");
    }
  };

  const handleSearchChange = (query: string) => {
    setSearch(query);
    onSearchChange?.(query);
  };

  const trimmedSearch = search.trim();
  const showCustomOption =
    allowCustomValue &&
    trimmedSearch.length > 0 &&
    !options.some(
      (o) =>
        o.label.toLowerCase() === trimmedSearch.toLowerCase() ||
        o.value.toLowerCase() === trimmedSearch.toLowerCase(),
    );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          className={cn("h-11 w-full justify-between font-normal", error ? "border-red-500" : "", className)}
        >
          <span className={cn("truncate", !selected && !value && "text-muted-foreground")}>{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={shouldFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showCustomOption ? (
                <CommandItem
                  value={`custom-entry-${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                    setSearch("");
                    onSearchChange?.("");
                  }}
                  className="text-[#8A641A] font-medium"
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  Use "{trimmedSearch}"
                </CommandItem>
              ) : null}
              {options.map((row) => (
                <CommandItem
                  key={row.value || "__none__"}
                  value={`${row.label} ${row.value || "none"}`}
                  onSelect={() => {
                    onChange(row.value);
                    setOpen(false);
                    setSearch("");
                    onSearchChange?.("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === row.value ? "opacity-100" : "opacity-0")} />
                  {row.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
