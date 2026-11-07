import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, MoreHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export const CARD5_CREATE_BTN_CLASS =
  "h-9 shrink-0 bg-[#C89933] font-medium text-[#251605] shadow-none hover:bg-[#C89933]/90";
export const CARD5_SEARCH_CLASS = "h-9 min-w-[12rem] flex-1 border-[#DDD4C5] bg-white";
export const CARD5_FILTER_CLASS =
  "h-9 shrink-0 border-[#DDD4C5] bg-white text-[#251605] shadow-none hover:bg-[#F7F4EE] focus:ring-1 focus:ring-[#C89933]";
export const CARD5_SELECT_CONTENT_CLASS = "border-[#DDD4C5] bg-white text-[#251605] shadow-md";
export const CARD5_SELECT_ITEM_CLASS =
  "cursor-pointer text-[#251605] focus:bg-[#F4E9D0] focus:text-[#251605] data-[state=checked]:bg-[#F4E9D0] [&_svg]:text-[#C89933]";
export const CARD5_TOOLBAR_CLASS = "flex min-w-0 flex-wrap items-center gap-2";
export const CARD5_TH_CLASS =
  "px-3 py-2 text-xs font-medium uppercase tracking-wide text-[#756A5B]";
export const CARD5_STATUS_TH_CLASS =
  "w-[7.5rem] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[#756A5B]";
export const CARD5_STATUS_TD_CLASS = "w-[7.5rem] px-3 py-2";
export const CARD5_ACTIONS_TH_CLASS =
  "w-[4.5rem] px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-[#756A5B]";
export const CARD5_ACTIONS_TD_CLASS = "w-[4.5rem] px-3 py-2 text-center";
export const CARD5_THEAD_CLASS = "border-b border-[#E6E1D8] bg-[#F7F4EE]";
export const CARD5_ROW_MENU_BTN_CLASS =
  "size-8 rounded-[6px] text-[#251605] shadow-none hover:bg-[#F4EDE0] hover:text-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933] data-[state=open]:bg-[#F4EDE0]";

export function Card5CreateButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <Button type="button" className={cn(CARD5_CREATE_BTN_CLASS, className)} {...props}>
      {children}
    </Button>
  );
}

export function Card5RowMenuButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(CARD5_ROW_MENU_BTN_CLASS, className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
    </Button>
  );
}

export function Card5Status({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        active
          ? "border-[#E8D7A8] bg-[#FBF6E8] text-[#8A641A]"
          : "border-[#E6E1D8] bg-[#F4F1EA] text-[#756A5B]",
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function Card5TableShell({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="min-w-0 overflow-x-auto rounded-xl border border-[#DDD4C5] bg-white md:overflow-x-hidden"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function Card5ConfigNotice({
  loading,
  blockers,
  warnings,
}: {
  loading?: boolean;
  blockers?: readonly string[];
  warnings?: readonly string[];
}) {
  if (loading) return null;
  const issues = [...(blockers ?? []), ...(warnings ?? [])].filter(Boolean);
  if (issues.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-[#E8D7A8] bg-[#FBF6E8] px-3 py-1.5 text-xs text-[#8A641A]"
      data-testid="pms-card5-config-notice"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
        <AlertTriangle className="size-3.5" aria-hidden />
        {issues.length} configuration {issues.length === 1 ? "issue" : "issues"}
      </span>
      <span>{issues[0]}</span>
    </div>
  );
}

export function PmsPropertySetupCard5Workspace({
  search,
  drawer: _drawer,
  status,
  actions,
  validate: _validate,
  children,
}: {
  search?: ReactNode;
  drawer?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  validate?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3" data-testid="pms-card5-tab-workspace">
      <div className="sr-only" data-testid="pms-card5-validate-slot">
        Validate action slot
      </div>

      {search ? (
        <div data-testid="pms-card5-search-slot">{search}</div>
      ) : (
        <div className="sr-only" data-testid="pms-card5-search-slot">
          Search and filter slot
        </div>
      )}

      <div className="grid grid-cols-1" data-testid="pms-card5-workspace-layout">
        <div className="min-w-0" data-testid="pms-card5-content-slot">
          {children}
        </div>
        <aside className="sr-only" data-testid="pms-card5-drawer-slot">
          Right drawer slot
        </aside>
      </div>

      {status || actions ? (
        <footer className="flex flex-wrap items-center justify-between gap-3">
          <div data-testid="pms-card5-status-slot">{status}</div>
          <div data-testid="pms-card5-actions-slot">{actions}</div>
        </footer>
      ) : (
        <>
          <div className="sr-only" data-testid="pms-card5-status-slot">
            Configuration status slot
          </div>
          <div className="sr-only" data-testid="pms-card5-actions-slot">
            Workspace actions slot
          </div>
        </>
      )}
    </div>
  );
}
