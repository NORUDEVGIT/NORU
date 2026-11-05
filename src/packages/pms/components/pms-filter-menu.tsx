import { useState, type ReactNode } from "react";
import { Filter } from "lucide-react";

import { PMS_ICON_BUTTON } from "@/packages/pms/components/pms-week-controls";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

export const PMS_FILTER_ROW =
  "rounded-md px-2 py-2 text-sm font-medium text-[#4a2c1a] focus:bg-[#F7F4EE] data-[state=open]:bg-[#F7F4EE]";
export const PMS_FILTER_SUB =
  "max-h-80 min-w-52 overflow-y-auto rounded-md border border-[#DDD4C5] bg-white p-1 text-[#4a2c1a] shadow-md";
export const PMS_FILTER_ITEM =
  "rounded-md text-sm text-[#4a2c1a] focus:bg-[#F7F4EE] focus:text-[#251605]";
export const PMS_FILTER_MENU_CLASS =
  "w-72 rounded-md border border-[#DDD4C5] bg-white p-1.5 text-[#4a2c1a] shadow-md";

const COUNT_BADGE =
  "absolute -right-1 -top-1 min-w-4 rounded-full bg-[#C89933] px-1 text-center text-[10px] leading-4 text-[#251605]";

/**
 * Shared Filter button and menu shell used by Front Office and Reservations.
 * Each workspace supplies its own rows.
 */
export function PmsFilterMenu({
  activeCount,
  onClear,
  open,
  onOpenChange,
  buttonTestId,
  countTestId,
  menuTestId,
  children,
}: {
  activeCount: number;
  onClear?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  buttonTestId?: string;
  countTestId?: string;
  menuTestId?: string;
  children: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (open === undefined) setUncontrolledOpen(next);
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={PMS_ICON_BUTTON}
          aria-label="Filters"
          title="Filters"
          data-testid={buttonTestId}
        >
          <Filter className="size-4" />
          {activeCount > 0 ? (
            <span data-testid={countTestId} className={COUNT_BADGE}>
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={PMS_FILTER_MENU_CLASS} data-testid={menuTestId}>
        {children}
        {activeCount > 0 && onClear ? (
          <>
            <DropdownMenuSeparator className="bg-[#DDD4C5]" />
            <button
              type="button"
              className="w-full rounded-md px-2 py-2 text-left text-sm font-medium text-[#4a2c1a] hover:bg-[#F7F4EE]"
              onClick={onClear}
            >
              Clear
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PmsFilterChoiceRow({
  label,
  value,
  current,
  options,
  neutralValue = "all",
  onChange,
}: {
  label: string;
  value: string;
  current: string;
  options: ReadonlyArray<readonly [string, string]>;
  neutralValue?: string;
  onChange: (value: string) => void;
}) {
  const active = value !== neutralValue && value !== "all";
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={PMS_FILTER_ROW}>
        <span className="flex-1 text-left">{label}</span>
        {active && current ? (
          <span className="max-w-28 truncate text-xs font-normal capitalize text-[#8C6D23]">
            {current}
          </span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={PMS_FILTER_SUB}>
        <DropdownMenuRadioGroup value={value || neutralValue} onValueChange={onChange}>
          {options.map(([id, name]) => (
            <DropdownMenuRadioItem
              key={id}
              value={id}
              className={PMS_FILTER_ITEM}
              onSelect={(event) => event.preventDefault()}
            >
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function PmsFilterNoteRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={PMS_FILTER_ROW}>
        <span className="flex-1 text-left">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={cn(PMS_FILTER_SUB, "w-64 overflow-visible p-3")}>
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
