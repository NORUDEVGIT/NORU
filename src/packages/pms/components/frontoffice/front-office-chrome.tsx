import type { ReactNode } from "react";
import { Bell, ChevronUp, HelpCircle, Plus, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { ComingSoonChip } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  FO_BRAND,
  FO_ESCAPE_MODULES,
  FO_NAV_ITEMS,
  FO_PRIMARY_TITLE,
  actionsForMenu,
  type FoNavId,
} from "@/packages/pms/lib/front-office-shell";
import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import { cn } from "@/shared/lib/utils";

function FoPmsModulesEscape({
  variant,
}: {
  variant: "desktop" | "phone";
}) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="fo-pms-modules-escape"
          className={
            variant === "desktop"
              ? "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
              : "mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
          }
        >
          <span>PMS modules</span>
          <ChevronUp className="size-3.5 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={variant === "desktop" ? "top" : "bottom"}
        className="min-w-[12rem]"
        data-testid="fo-pms-modules-menu"
      >
        {FO_ESCAPE_MODULES.map((item) => (
          <DropdownMenuItem
            key={item.to}
            onSelect={() => {
              void navigate({ to: item.to });
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FrontOfficeChrome({
  propertyName,
  userLabel,
  roleLabel,
  businessDate,
  active,
  onNavigate,
  onQuickAction,
  onGuestSearch,
  children,
}: {
  propertyName: string;
  userLabel: string;
  roleLabel: string;
  businessDate: string;
  active: FoNavId;
  onNavigate: (id: FoNavId) => void;
  onQuickAction: (actionId: string) => void;
  onGuestSearch: () => void;
  children: ReactNode;
}) {
  const quick = actionsForMenu("quick");

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-testid="fo-command-shell"
        className="flex min-h-[calc(100dvh-7rem)] flex-col overflow-hidden rounded-2xl border"
        style={{ borderColor: FO_BRAND.gray }}
      >
        <header
          className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-white sm:px-4"
          style={{ backgroundColor: FO_BRAND.chrome }}
        >
          <div className="min-w-0">
            <p className="truncate font-display text-base leading-tight">{propertyName}</p>
            <p className="text-[11px] text-white/70">{FO_PRIMARY_TITLE}</p>
          </div>
          <p className="text-xs text-white/80">{formatStayDate(businessDate)}</p>
          <button
            type="button"
            onClick={onGuestSearch}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">Guest search</span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Notifications">
                <Bell className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Notifications — Coming soon</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                <Plus className="size-4 sm:mr-1" />
                <span className="hidden sm:inline">Quick Action</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-testid="fo-quick-action-menu">
              {quick.map((action) =>
                action.lane === "coming_soon" ? (
                  <DropdownMenuItem
                    key={action.id}
                    data-testid={`fo-quick-${action.id}`}
                    onSelect={() => onQuickAction(action.id)}
                    className="text-muted-foreground"
                  >
                    {action.label}
                    <span className="ml-auto text-[10px] uppercase tracking-wide">Coming soon</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={action.id}
                    data-testid={`fo-quick-${action.id}`}
                    onSelect={() => onQuickAction(action.id)}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden text-right sm:block">
            <p className="max-w-[160px] truncate text-xs">{userLabel}</p>
            <p className="text-[11px] capitalize text-white/60">{roleLabel}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Help">
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Help — Coming soon</TooltipContent>
          </Tooltip>
          <NoruLogo size="sm" wordmarkClassName="text-white" />
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            className="hidden w-56 shrink-0 flex-col md:flex"
            style={{ backgroundColor: FO_BRAND.chrome }}
            aria-label="Front Office"
          >
            <nav data-testid="fo-sidebar-nav" className="flex-1 space-y-1 p-3">
              {FO_NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`fo-nav-${item.id}`}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    active === item.id ? "bg-[#C89933] text-[#251605]" : "text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="border-t border-white/10 p-3">
              <FoPmsModulesEscape variant="desktop" />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-background">
            <div className="border-b border-[#CCCCCC] px-3 py-2 md:hidden">
              <label className="sr-only" htmlFor="fo-mobile-nav">
                Front Office
              </label>
              <select
                id="fo-mobile-nav"
                data-testid="fo-mobile-nav"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                value={active}
                onChange={(e) => onNavigate(e.target.value as FoNavId)}
              >
                {FO_NAV_ITEMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <FoPmsModulesEscape variant="phone" />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
          </div>
        </div>

        <footer
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] text-white/70"
          style={{ backgroundColor: FO_BRAND.chrome }}
        >
          <span>Front Office · {FO_PRIMARY_TITLE}</span>
          <ComingSoonChip label="Guest request queue" className="border-white/30 text-white/70" />
        </footer>
      </div>
    </TooltipProvider>
  );
}
