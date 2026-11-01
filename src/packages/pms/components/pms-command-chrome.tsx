import type { ReactNode } from "react";

/**
 * The dark top bar that used to live here has been removed. The application
 * header (AppTopHeader, rendered by RestaurantShell) is now the only top bar.
 *
 * Every prop is still accepted so existing callers compile unchanged; the ones
 * that only fed the old bar (nav, overflow, onGuestSearch, notifications,
 * quick actions, help button, activity, rightControls) are no longer used.
 */
export function PmsCommandChrome({
  mobile,
  helpSheet,
  children,
  contentClassName = "p-3 sm:p-4",
  shellTestId = "fo-command-shell",
}: {
  nav?: ReactNode;
  overflow?: ReactNode;
  mobile?: ReactNode;
  onGuestSearch?: () => void;
  exceptionBadge?: number;
  notificationCount?: number;
  notificationsComingSoon?: boolean;
  onNotifications?: () => void;
  onQuickAction?: (actionId: string) => void;
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
  return (
    <div data-testid={shellTestId} className="flex min-h-0 flex-1 flex-col">
      {helpSheet}

      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {mobile}
        <div className={`min-h-0 flex-1 overflow-auto ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}