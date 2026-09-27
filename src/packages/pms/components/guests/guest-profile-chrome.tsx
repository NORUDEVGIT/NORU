/**
 * Persistent Workspace Chrome for Guest Profile Module
 * Phase 1 Foundation
 *
 * Provides consistent top-level header, primary section navigation with NORU gold active indicator,
 * action slots, and Property Setup status banners.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  GUEST_WORKSPACE_SECTIONS,
  type GuestWorkspaceSectionId,
} from "@/packages/pms/lib/guest-profile-domains";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  type GuestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import type { GuestWorkspaceConfig } from "@/packages/pms/lib/guest-workspace-config.functions";
import type { GuestWorkspaceAccess } from "@/packages/pms/lib/guest-workspace-access.functions";

interface SectionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const SectionButton = forwardRef<HTMLButtonElement, SectionButtonProps>(
  ({ active = false, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
          active ? "font-semibold text-[#251605]" : "text-[#7A6B58] hover:text-[#251605]",
          className,
        )}
        {...props}
      >
        {children}
        {active ? (
          <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
        ) : null}
      </button>
    );
  },
);
SectionButton.displayName = "SectionButton";

export function GuestProfileChrome({
  membership,
  directorySearch,
  onGuestSearch,
  activeSection,
  onSelectSection,
  config,
  access,
  isRefreshing = false,
  onRefresh,
  primaryAction,
  secondaryNav,
  children,
}: {
  membership?: RestaurantMembership | undefined;
  directorySearch?: GuestProfileSearch | undefined;
  onGuestSearch?: ((value: string) => void) | undefined;
  activeSection: GuestWorkspaceSectionId;
  onSelectSection: (section: GuestWorkspaceSectionId) => void;
  config?: GuestWorkspaceConfig | undefined;
  access?: GuestWorkspaceAccess | undefined;
  isRefreshing?: boolean | undefined;
  onRefresh?: (() => void) | undefined;
  primaryAction?: ReactNode | undefined;
  secondaryNav?: ReactNode | undefined;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const currentSectionDef =
    GUEST_WORKSPACE_SECTIONS.find((s) => s.id === activeSection) ?? GUEST_WORKSPACE_SECTIONS[0];
  const typeConfig = config?.types.find((t) => t.domain === currentSectionDef.domain);
  const isTypeInactive = typeConfig ? !typeConfig.active : false;

  function handleCommandSearch(value: string) {
    if (onGuestSearch) {
      onGuestSearch(value);
      return;
    }
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({
        ...(directorySearch ?? {}),
        section: activeSection,
        q: value.trim() || undefined,
        page: 0,
      }),
    });
  }

  const innerContent = (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col space-y-4"
      data-testid="guest-profile-chrome"
    >
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8E4DC] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
              Guest Profiles
            </h1>
            <span className="inline-flex items-center rounded-full bg-[#F4EFE6] px-2.5 py-0.5 text-xs font-semibold text-[#8C6D23] border border-[#C89933]/30">
              Master Identity
            </span>
          </div>
          <p className="mt-1 text-xs text-[#7A6B58]">{currentSectionDef.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-8 border-[#D8D2C5] bg-white text-[#251605] hover:bg-[#F9F7F2]"
              title="Refresh workspace records"
            >
              <RefreshCw
                className={cn("size-3.5 mr-1.5", isRefreshing && "animate-spin text-[#C89933]")}
              />
              <span className="text-xs">Refresh</span>
            </Button>
          ) : null}

          {primaryAction}
        </div>
      </div>

      {/* Primary Navigation Row */}
      <div className="flex items-center justify-between border-b border-[#E8E4DC] bg-[#FAF8F5] px-1 rounded-t-lg">
        <nav
          className="flex items-center gap-1 overflow-x-auto pb-px"
          role="tablist"
          aria-label="Guest Profile domains"
        >
          {GUEST_WORKSPACE_SECTIONS.map((section) => {
            const active = section.id === activeSection;
            const secTypeConfig = config?.types.find((t) => t.domain === section.domain);
            const inactive = secTypeConfig ? !secTypeConfig.active : false;

            return (
              <SectionButton
                key={section.id}
                role="tab"
                aria-selected={active}
                active={active}
                onClick={() => onSelectSection(section.id)}
                data-testid={`guest-nav-section-${section.id}`}
              >
                <span>{section.title}</span>
                {inactive ? (
                  <span
                    className="ml-1 rounded px-1.5 py-0.2 text-[10px] uppercase font-bold tracking-wider bg-muted text-muted-foreground border border-border"
                    title="This profile type is inactive in Property Setup"
                  >
                    Inactive
                  </span>
                ) : null}
              </SectionButton>
            );
          })}
        </nav>
      </div>

      {/* Inactive Profile Type Advisory Banner */}
      {isTypeInactive ? (
        <div
          className="flex items-center justify-between rounded-lg border border-[#E5C158] bg-[#FDF9EE] px-4 py-2.5 text-xs text-[#825B00]"
          data-testid="guest-inactive-type-banner"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-[#C89933]" />
            <span>
              <strong>{currentSectionDef.title}</strong> is marked inactive in Property Setup.
              Existing historical records remain visible, but new record creation is blocked.
            </span>
          </div>
          <Link
            to="/restaurant/pms/setup"
            search={{ card: "guest-services", step: "profile-types" }}
            className="ml-4 font-semibold text-[#8C6D23] underline hover:text-[#251605]"
          >
            Review Setup Rules
          </Link>
        </div>
      ) : null}

      {/* Secondary Nav Slot (Detail Sub-Tabs / Extra Filters) */}
      {secondaryNav ? <div className="border-b border-[#E8E4DC] pb-2">{secondaryNav}</div> : null}

      {/* Content Container */}
      <div className="flex-1 w-full" data-testid="guest-workspace-content">
        {children}
      </div>
    </div>
  );

  if (membership) {
    return (
      <RoomInventoryChrome
        membership={membership}
        activeModule="Guest Profiles"
        searchPlaceholder="Search guest profile…"
        searchTestId="guest-command-search"
        initialSearch={directorySearch?.q ?? ""}
        helpLabel="Guest Profiles operational workspace"
        shellTestId="guest-profile-command-shell"
        onRoomSearch={handleCommandSearch}
      >
        <div className="min-w-0 bg-[#FAF8F5] p-3 sm:p-5" data-testid="guest-profile-workspace-root">
          {innerContent}
        </div>
      </RoomInventoryChrome>
    );
  }

  return innerContent;
}
