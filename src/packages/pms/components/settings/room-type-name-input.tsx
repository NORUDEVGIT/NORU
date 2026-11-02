import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export const PREDEFINED_ROOM_TYPE_NAMES = [
  "Standard Single Room",
  "Standard Double Room",
  "Standard Twin Room",
  "Superior Room",
  "Deluxe Room",
  "Deluxe King Room",
  "Deluxe Twin Room",
  "Executive Room",
  "Junior Suite",
  "Executive Suite",
  "Family Room",
  "Family Suite",
  "Presidential Suite",
  "Apartment Villa",
  "Accessible Room",
] as const;

export type PredefinedRoomTypeName = (typeof PREDEFINED_ROOM_TYPE_NAMES)[number];

function normalizeSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/delux\b/g, "deluxe")
    .replace(/excutive/g, "executive")
    .replace(/presedential/g, "presidential")
    .trim();
}

export interface RoomTypeNameInputProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}

export const RoomTypeNameInput = React.forwardRef<HTMLInputElement, RoomTypeNameInputProps>(
  (
    {
      value,
      onChange,
      disabled,
      placeholder = "e.g. Deluxe King Room",
      error,
      className,
      id,
      onFocus,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1);
    const listRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // Merge internal and forwarded refs
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [ref],
    );

    const normQuery = normalizeSearch(value);

    const filteredOptions = React.useMemo(() => {
      if (!normQuery) {
        return PREDEFINED_ROOM_TYPE_NAMES;
      }
      const matches = PREDEFINED_ROOM_TYPE_NAMES.filter((name) =>
        normalizeSearch(name).includes(normQuery),
      );
      return matches.length > 0 ? matches : PREDEFINED_ROOM_TYPE_NAMES;
    }, [normQuery]);

    const isCustom =
      Boolean(value.trim()) &&
      !PREDEFINED_ROOM_TYPE_NAMES.some(
        (name) => name.toLowerCase() === value.trim().toLowerCase(),
      );

    const handleSelect = (optionName: string) => {
      onChange(optionName);
      setOpen(false);
      setHighlightedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(0);
        } else {
          setHighlightedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0,
          );
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlightedIndex(filteredOptions.length - 1);
        } else {
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1,
          );
        }
      } else if (e.key === "Enter") {
        if (open && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          e.preventDefault();
          handleSelect(filteredOptions[highlightedIndex]);
        }
      } else if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
          setHighlightedIndex(-1);
        }
      }
      onKeyDown?.(e);
    };

    // Scroll active item into view
    React.useEffect(() => {
      if (open && highlightedIndex >= 0 && listRef.current) {
        const item = listRef.current.children[highlightedIndex] as HTMLElement;
        if (item) {
          item.scrollIntoView({ block: "nearest" });
        }
      }
    }, [highlightedIndex, open]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative w-full">
            <Input
              {...props}
              ref={setRefs}
              id={id}
              disabled={disabled}
              placeholder={placeholder}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                setHighlightedIndex(-1);
                if (!open) setOpen(true);
              }}
              onFocus={(e) => {
                setOpen(true);
                onFocus?.(e);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                "bg-white pr-9 transition-colors",
                error &&
                  "border-red-500 bg-red-50/10 ring-1 ring-red-500 focus-visible:ring-red-500",
                className,
              )}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label="Toggle room type suggestions"
              onClick={() => {
                if (disabled) return;
                setOpen((prev) => !prev);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-[#251605] focus:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform duration-200 text-[#8A641A]",
                  open && "rotate-180",
                )}
              />
            </button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[80] w-[var(--radix-popover-anchor-width)] min-w-[240px] rounded-lg border border-[#CCCCCC] bg-white p-1 shadow-lg"
        >
          {isCustom && normQuery && filteredOptions === PREDEFINED_ROOM_TYPE_NAMES ? (
            <div className="border-b border-[#EDE6D8] px-2.5 py-1.5 text-[11px] font-medium text-[#8A641A]">
              Using custom name &middot; Standard options below:
            </div>
          ) : null}

          {/* Max height limited to ~5 visible items (~190px), smoothly scrollable */}
          <div
            ref={listRef}
            className="max-h-[190px] overflow-y-auto overscroll-contain py-0.5 text-sm"
          >
            {filteredOptions.map((option, index) => {
              const isSelected = value.trim().toLowerCase() === option.toLowerCase();
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={option}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    // Prevent input blur before click finishes
                    e.preventDefault();
                    handleSelect(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-[#251605] transition-colors",
                    isHighlighted && "bg-[#F7F4EE]",
                    isSelected && "bg-[#F4EDE0] font-medium text-[#251605]",
                  )}
                >
                  <span className="truncate">{option}</span>
                  {isSelected ? (
                    <Check className="ml-2 size-4 shrink-0 text-[#8A641A]" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

RoomTypeNameInput.displayName = "RoomTypeNameInput";
