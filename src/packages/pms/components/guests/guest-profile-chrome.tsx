/**
 * Persistent Workspace Chrome for Guest Profile Module
 * Phase 1 Foundation
 *
 * Provides consistent top-level header, primary section navigation with NORU gold active indicator,
 * action slots, and Property Setup status banners.
 */
import { type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

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
      className="flex min-h-[calc(100vh-4rem)] flex-col gap-3"
      data-testid="guest-profile-chrome"
    >
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
            to="/restaurant/settings"
            hash="guest-services"
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
        activeModule="Guest Profile"
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
