import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Menu,
  Receipt,
  ScrollText,
  UsersRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

export const ACCOUNT_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "folios", label: "Source Folios", icon: Receipt },
  { id: "charges", label: "Charges", icon: Wallet },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "invoices", label: "Invoices & Documents", icon: FileText },
  { id: "statement", label: "Statement", icon: ScrollText },
  { id: "history", label: "History", icon: History },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];

export type AccountToolbarSearch = {
  value: string;
  placeholder: string;
  testId?: string;
  onChange: (value: string) => void;
};

const AccountToolbarSearchContext = createContext<
  ((search: AccountToolbarSearch | null) => void) | null
>(null);

export function AccountToolbarSearchProvider({
  publish,
  children,
}: {
  publish: (search: AccountToolbarSearch | null) => void;
  children: ReactNode;
}) {
  return (
    <AccountToolbarSearchContext.Provider value={publish}>
      {children}
    </AccountToolbarSearchContext.Provider>
  );
}

/** Puts this tab's search into the shared toolbar. Null keeps the company button there. */
export function useAccountToolbarSearch(search: AccountToolbarSearch | null) {
  const publish = useContext(AccountToolbarSearchContext);
  const onChangeRef = useRef(search?.onChange);
  onChangeRef.current = search?.onChange;
  const value = search?.value ?? "";
  const placeholder = search?.placeholder ?? "";
  const testId = search?.testId;
  const active = search != null;

  useLayoutEffect(() => {
    if (!publish) return;
    if (!active) {
      publish(null);
      return;
    }
    publish({
      value,
      placeholder,
      ...(testId ? { testId } : {}),
      onChange: (next) => onChangeRef.current?.(next),
    });
  }, [active, placeholder, publish, testId, value]);

  useLayoutEffect(() => {
    return () => publish?.(null);
  }, [publish]);
}

export function isAccountSection(value: string | undefined): value is AccountSectionId {
  return ACCOUNT_SECTIONS.some((section) => section.id === value);
}

export function AccountSectionBurger({
  active,
  onSelect,
}: {
  active: AccountSectionId;
  onSelect: (id: AccountSectionId) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Account sections"
          title="Account sections"
          data-testid="account-nav-trigger"
          className="size-8 text-[#251605] opacity-70 hover:bg-[#F3EEE4] hover:opacity-100 data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100"
        >
          <Menu className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-1.5"
        data-testid="account-workspace-nav"
        aria-label="Account sections"
      >
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Financial account
        </p>
        <div className="flex flex-col gap-0.5">
          {ACCOUNT_SECTIONS.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`account-tab-${item.id}-trigger`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-foreground hover:bg-[#F7F4EE]",
                )}
              >
                <item.icon className="size-4 shrink-0 text-[#8A6A24]" />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AccountDetailsSearch({
  accountNumber,
  name,
  kindLabel,
  isGroup,
  onOpen,
}: {
  accountNumber: string;
  name: string;
  kindLabel: string;
  isGroup: boolean;
  onOpen: () => void;
}) {
  const Icon = isGroup ? UsersRound : Building2;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="account-details"
      className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#DDD4C5] bg-white px-2.5 text-left hover:bg-[#F7F4EE]"
    >
      <Icon className="size-3.5 shrink-0 text-[#8A6A24]" />
      <span className="shrink-0 truncate text-xs font-semibold text-[#251605]">{accountNumber}</span>
      <span className="min-w-0 truncate text-xs text-[#756A5B]">
        {name} · {kindLabel}
      </span>
    </button>
  );
}
