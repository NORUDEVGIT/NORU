import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Ellipsis, Loader2, Plus, Save, Search, X } from "lucide-react";

import { PropertySetupPanel } from "@/packages/pms/components/settings/setup-kit";
import type { PropertySetupFieldIconKey } from "@/packages/pms/lib/pms-property-setup-field-icons";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { COMMON_CURRENCIES } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";

const ISO_CURRENCY_FLAGS: Record<string, string> = {
  GBP: "🇬🇧",
  EUR: "🇪🇺",
  USD: "🇺🇸",
  ETB: "🇪🇹",
  AED: "🇦🇪",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  INR: "🇮🇳",
  KES: "🇰🇪",
  NGN: "🇳🇬",
  ZAR: "🇿🇦",
};

export type Card3CurrencyCatalogMeta = {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  flag: string;
};

export function card3CurrencyFlag(code: string): string {
  return ISO_CURRENCY_FLAGS[code.trim().toUpperCase()] ?? "🏳️";
}

export function card3CurrencyCatalogMeta(code: string): Card3CurrencyCatalogMeta | null {
  const normalized = code.trim().toUpperCase();
  const row = COMMON_CURRENCIES.find((item) => item.code === normalized);
  if (!row) return null;
  const match = row.label.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
  return {
    code: row.code,
    name: (match?.[1] ?? row.label).trim(),
    symbol: (match?.[2] ?? row.code).trim(),
    decimalPlaces: 2,
    flag: card3CurrencyFlag(row.code),
  };
}

export type Card3DraftSave = {
  save: () => void | Promise<void>;
  dirty: boolean;
  pending?: boolean;
};

const Card3DraftSaveContext = createContext<{
  register: (value: Card3DraftSave | null) => void;
}>({
  register: () => undefined,
});

export function Card3DraftSaveProvider({
  register,
  children,
}: {
  register: (value: Card3DraftSave | null) => void;
  children: ReactNode;
}) {
  return (
    <Card3DraftSaveContext.Provider value={{ register }}>{children}</Card3DraftSaveContext.Provider>
  );
}

export function useCard3DraftSave(value: Card3DraftSave | null) {
  const { register } = useContext(Card3DraftSaveContext);
  useEffect(() => {
    register(value);
    return () => register(null);
  }, [register, value]);
}

export function Card3InheritedStrip({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-[8px] border border-[#E6D7B8] bg-[#F4EDE0] p-3 text-sm text-[#251605]"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function Card3StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[#251605]">
      <span
        className={cn("size-2 rounded-full", active ? "bg-[#436436]" : "bg-red-600")}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function Card3SearchAddBar({
  value,
  onChange,
  placeholder,
  addLabel,
  onAdd,
  canEdit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  addLabel: string;
  onAdd: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(PROPERTY_SETUP_CONTROL_CLASS, "pl-9")}
        />
      </div>
      {canEdit ? (
        <Button
          type="button"
          className="h-11 rounded-[6px] border border-[#C89933] bg-[#F4EDE0] px-3 text-sm font-medium text-[#251605] hover:bg-[#C89933]/20"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function Card3Table({
  headers,
  children,
  empty,
  minWidthClass = "min-w-[40rem]",
}: {
  headers: readonly string[];
  children?: ReactNode;
  empty?: string;
  minWidthClass?: string;
}) {
  return (
    <div className="max-w-5xl overflow-x-auto rounded-[8px] border border-[#CCCCCC] bg-white">
      <table className={cn("w-full text-left text-sm", minWidthClass)}>
        <thead className="border-b border-[#E6E1D8] bg-[#F7F4EE] text-xs font-medium uppercase tracking-wide text-[#6B6458]">
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? <p className="sr-only">{empty}</p> : null}
    </div>
  );
}

export type Card3ListRow = {
  id: string;
  cells: ReactNode[];
  active?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  actionsLocked?: boolean;
};

export function Card3ListSection({
  title,
  helper,
  icon,
  testId,
  search,
  onSearch,
  placeholder,
  addLabel,
  onAdd,
  canEdit,
  columns,
  rows,
  empty,
}: {
  title: string;
  helper?: string;
  icon: PropertySetupFieldIconKey;
  testId?: string;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  addLabel: string;
  onAdd: () => void;
  canEdit: boolean;
  columns: readonly string[];
  rows: readonly Card3ListRow[];
  empty: string;
}) {
  const headers = [...columns, ""];
  return (
    <Card3Section title={title} helper={helper} icon={icon} testId={testId}>
      <Card3SearchAddBar
        value={search}
        onChange={onSearch}
        placeholder={placeholder}
        addLabel={addLabel}
        onAdd={onAdd}
        canEdit={canEdit}
      />
      <Card3Table headers={headers}>
        {rows.length === 0 ? (
          <Card3EmptyRow colSpan={headers.length}>{empty}</Card3EmptyRow>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-t border-[#E6E1D8]">
              {row.cells.map((cell, index) => (
                <td key={`${row.id}-${index}`} className="px-3 py-2 text-[#251605]">
                  {cell}
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                {row.actionsLocked ? null : (
                  <Card3RowActions
                    label={`Actions for ${title}`}
                    onEdit={row.onEdit}
                    onDelete={row.onDelete}
                    editDisabled={!canEdit}
                    deleteDisabled={!canEdit}
                  />
                )}
              </td>
            </tr>
          ))
        )}
      </Card3Table>
    </Card3Section>
  );
}

export function Card3RowActions({
  label,
  onEdit,
  onDelete,
  editDisabled,
  deleteDisabled,
}: {
  label: string;
  onEdit?: () => void;
  onDelete?: () => void;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-[6px] text-[#251605] hover:bg-[#F4EDE0]"
          aria-label={label}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        {onEdit ? (
          <DropdownMenuItem disabled={editDisabled} onSelect={onEdit}>
            Edit
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem
            disabled={deleteDisabled}
            className="text-red-600 focus:text-red-600"
            onSelect={onDelete}
          >
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Card3OverlapSheet({
  open,
  title,
  description,
  onClose,
  onSubmit,
  submitLabel = "Save",
  pending,
  canEdit,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  pending?: boolean;
  canEdit?: boolean;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-[min(100vw-1.25rem,28rem)] overflow-y-auto rounded-l-[8px] border border-[#CCCCCC] bg-white p-5 sm:max-w-md"
      >
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="font-sans text-lg font-semibold text-[#251605]">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-sm text-muted-foreground">
              {description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {children}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="size-4" />
              Cancel
            </Button>
            {canEdit && onSubmit ? (
              <Button
                type="button"
                disabled={pending}
                className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
                onClick={() => {
                  if (!pending) onSubmit();
                }}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {submitLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Card3Section({
  title,
  helper,
  icon,
  testId,
  children,
}: {
  title: string;
  helper?: string;
  icon: PropertySetupFieldIconKey;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <PropertySetupPanel title={title} helper={helper} icon={icon} testId={testId}>
      {children}
    </PropertySetupPanel>
  );
}

export function Card3EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
