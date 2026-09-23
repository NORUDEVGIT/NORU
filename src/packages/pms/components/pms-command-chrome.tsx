import type { ReactNode } from "react";
import { Bell, HelpCircle, History, Plus, Search } from "lucide-react";

import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { FO_BRAND, actionsForMenu } from "@/packages/pms/lib/front-office-shell";

export function PmsCommandChrome({
  nav,
  overflow,
  mobile,
  onGuestSearch,
  exceptionBadge: _exceptionBadge = 0,
  notificationCount = 0,
  notificationsComingSoon = false,
  onNotifications,
  onQuickAction,
  helpSheet,
  onHelpOpenChange,
  onActivity,
  activityLabel = "FO activity",
  rightControls,
  useDefaultControls = true,
  children,
  contentClassName = "p-3 sm:p-4",
  shellTestId = "fo-command-shell",
}: {
  nav: ReactNode;
  overflow?: ReactNode;
  mobile?: ReactNode;
  onGuestSearch: () => void;
  exceptionBadge?: number;
  notificationCount?: number;
  notificationsComingSoon?: boolean;
  onNotifications?: () => void;
  onQuickAction: (actionId: string) => void;
  helpSheet?: ReactNode;
  onHelpOpenChange?: (open: boolean) => void;
  onActivity?: () => void;
  activityLabel?: string;
  rightControls?: ReactNode;
  useDefaultControls?: boolean;
  children: ReactNode;
  contentClassName?: string;
  shellTestId?: string;
}) {
  const quick = actionsForMenu("quick");

  return (
    <TooltipProvider delayDuration={200}>
      <div data-testid={shellTestId} className="flex min-h-[calc(100dvh-3.75rem)] flex-1 flex-col">
        <header
          className="flex items-center gap-2 px-3 py-2 text-white sm:px-4"
          style={{ backgroundColor: FO_BRAND.chrome }}
          data-testid="fo-top-command"
        >
          {nav}
          {overflow}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {rightControls}
            {useDefaultControls ? (
              <>
                <button
                  type="button"
                  data-testid="fo-guest-search"
                  onClick={onGuestSearch}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
                >
                  <Search className="size-3.5" />
                  <span className="hidden sm:inline">Guest search</span>
                </button>
                {notificationsComingSoon ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-testid="fo-notifications"
                        className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                        aria-label="Notifications"
                      >
                        <Bell className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Notifications — Coming soon</TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    data-testid="fo-notifications"
                    className="relative rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                    aria-label="Notifications"
                    onClick={onNotifications}
                  >
                    <Bell className="size-4" />
                    {notificationCount > 0 ? (
                      <span
                        data-testid="fo-notifications-badge"
                        className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 text-[#251605]"
                        style={{ backgroundColor: FO_BRAND.gold }}
                      >
                        {notificationCount}
                      </span>
                    ) : null}
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
                    >
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
                          <span className="ml-auto text-[10px] uppercase tracking-wide">
                            Coming soon
                          </span>
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
                <button
                  type="button"
                  data-testid="fo-help"
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                  aria-label="Help"
                  onClick={() => onHelpOpenChange?.(true)}
                >
                  <HelpCircle className="size-4" />
                </button>
                <button
                  type="button"
                  data-testid="fo-activity"
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                  aria-label={activityLabel}
                  onClick={() => onActivity?.()}
                >
                  <History className="size-4" />
                </button>
                <NoruLogo size="sm" wordmarkClassName="text-white" />
              </>
            ) : null}
          </div>
        </header>
        {helpSheet}

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          {mobile}
          <div className={`min-h-0 flex-1 overflow-auto ${contentClassName}`}>{children}</div>
        </div>
      </div>
    </TooltipProvider>
  );
}
