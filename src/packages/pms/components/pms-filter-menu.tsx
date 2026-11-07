import { useState, type ReactNode } from "react";

import {
  PMS_FILTER_CASCADE_DATE,
  PMS_FILTER_CASCADE_MENU,
  PMS_FILTER_CASCADE_SUB,
  PMS_FILTER_ITEM,
  PMS_FILTER_ROW,
  PmsFilterTrigger,
} from "@/packages/pms/components/pms-filter-popover";
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

export { PMS_FILTER_ITEM, PMS_FILTER_ROW };
export const PMS_FILTER_SUB = PMS_FILTER_CASCADE_SUB;
export const PMS_FILTER_MENU_CLASS = PMS_FILTER_CASCADE_MENU;

/**
 * Pattern A — compact cascading filter menu (Reservations and other high-count categorical filters).
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
        <PmsFilterTrigger
          activeCount={activeCount}
          buttonTestId={buttonTestId}
          countTestId={countTestId}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={12}
        className={PMS_FILTER_CASCADE_MENU}
        data-testid={menuTestId}
      >
        {children}
        {activeCount > 0 && onClear ? (
          <>
            <DropdownMenuSeparator className="bg-[#DDD4C5]" />
            <button
              type="button"
              className={cn(PMS_FILTER_ROW, "w-full text-left")}
              onClick={onClear}
            >
              Clear filters
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
          <span className="max-w-28 truncate text-xs font-normal text-[#8C6D23]">{current}</span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent collisionPadding={12} className={PMS_FILTER_CASCADE_SUB}>
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
      <DropdownMenuSubContent
        collisionPadding={12}
        className={cn(PMS_FILTER_CASCADE_DATE, "w-64")}
      >
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
