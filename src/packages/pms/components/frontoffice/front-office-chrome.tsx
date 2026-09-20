import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { FoHelpSheet } from "@/packages/pms/components/frontoffice/fo-help-sheet";
import { PmsCommandChrome } from "@/packages/pms/components/pms-command-chrome";
import {
  FO_ESCAPE_MODULES,
  FO_NAV_ITEMS,
  type FoNavId,
} from "@/packages/pms/lib/front-office-shell";
import { cn } from "@/shared/lib/utils";

function FoPmsModulesEscape({ variant }: { variant: "overflow" | "phone" }) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="fo-pms-modules-escape"
          className={
            variant === "overflow"
              ? "inline-flex items-center rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
              : "mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
          }
        >
          <span>PMS modules</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "overflow" ? "end" : "start"}
        side="bottom"
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="fo-exit-pms"
          onSelect={() => {
            void navigate({ to: "/restaurant/pms/dashboard" });
          }}
        >
          Exit FO → PMS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FrontOfficeChrome({
  active,
  onNavigate,
  onQuickAction,
  onGuestSearch,
  exceptionBadge = 0,
  notificationCount = 0,
  notificationsComingSoon = false,
  onNotifications,
  onFoActivity,
  helpOpen,
  onHelpOpenChange,
  canOpenCashiering = false,
  children,
}: {
  active: FoNavId;
  onNavigate: (id: FoNavId) => void;
  onQuickAction: (actionId: string) => void;
  onGuestSearch: () => void;
  exceptionBadge?: number;
  notificationCount?: number;
  notificationsComingSoon?: boolean;
  onNotifications?: () => void;
  onFoActivity?: () => void;
  helpOpen?: boolean;
  onHelpOpenChange?: (open: boolean) => void;
  canOpenCashiering?: boolean;
  children: ReactNode;
}) {
  return (
    <PmsCommandChrome
      onGuestSearch={onGuestSearch}
      exceptionBadge={exceptionBadge}
      notificationCount={notificationCount}
      notificationsComingSoon={notificationsComingSoon}
      onNotifications={onNotifications}
      onQuickAction={onQuickAction}
      onHelpOpenChange={onHelpOpenChange}
      onActivity={onFoActivity}
      helpSheet={
        <FoHelpSheet
          open={!!helpOpen}
          onOpenChange={(open) => onHelpOpenChange?.(open)}
          onNavigate={onNavigate}
          canOpenCashiering={canOpenCashiering}
        />
      }
      nav={
        <nav
          data-testid="fo-top-nav"
          className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
          aria-label="Front Office"
        >
          {FO_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`fo-nav-${item.id}`}
              onClick={() => onNavigate(item.id)}
              aria-current={active === item.id ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                active === item.id
                  ? "bg-[#C89933] text-[#251605]"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              <span>{item.label}</span>
              {item.id === "exceptions" ? (
                <span
                  data-testid="fo-exceptions-badge"
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[10px] leading-5",
                    active === item.id ? "bg-[#251605] text-white" : "bg-white/15 text-white",
                  )}
                >
                  {exceptionBadge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      }
      overflow={
        <div className="hidden shrink-0 items-center gap-1 md:flex" data-testid="fo-top-overflow">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="More Front Office destinations"
              >
                <MoreHorizontal className="size-4" />
                <span>More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-[14rem]"
              data-testid="fo-top-overflow-menu"
            >
              <DropdownMenuLabel>Front Office</DropdownMenuLabel>
              {FO_NAV_ITEMS.map((item) => (
                <DropdownMenuItem key={item.id} onSelect={() => onNavigate(item.id)}>
                  {item.label}
                  {item.id === "exceptions" ? ` (${exceptionBadge})` : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <FoPmsModulesEscape variant="overflow" />
        </div>
      }
      mobile={
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
                {item.id === "exceptions" ? `${item.label} (${exceptionBadge})` : item.label}
              </option>
            ))}
          </select>
          <FoPmsModulesEscape variant="phone" />
        </div>
      }
    >
      {children}
    </PmsCommandChrome>
  );
}
