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
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((row) => row.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          className={cn("h-11 w-full justify-between font-normal", error ? "border-red-500" : "")}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((row) => (
                <CommandItem
                  key={row.value}
                  value={`${row.label} ${row.value}`}
                  onSelect={() => {
                    onChange(row.value);
                    setOpen(false);
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
