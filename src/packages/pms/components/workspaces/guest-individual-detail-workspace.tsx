import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, RefreshCw } from "lucide-react";

import { GuestProfileHeader } from "@/packages/pms/components/guests/guest-profile-header";
import { GuestIndividualOverview } from "@/packages/pms/components/guests/guest-individual-overview";
import { GuestPersonalContactView } from "@/packages/pms/components/guests/guest-personal-contact-view";
import { GuestIdentityCard } from "@/packages/pms/components/guests/guest-identity-card";
import { GuestPreferencesView } from "@/packages/pms/components/guests/guest-preferences-view";
import { GuestStaysReservationsView } from "@/packages/pms/components/guests/guest-stays-reservations-view";
import { GuestRelationshipsView } from "@/packages/pms/components/guests/guest-relationships-view";
import { GuestServicesView } from "@/packages/pms/components/guests/guest-services-view";
import { GuestCommunicationNotesView } from "@/packages/pms/components/guests/guest-communication-notes-view";
import { GuestPrivacyAdministrationView } from "@/packages/pms/components/guests/guest-privacy-administration-view";
import { GuestActivityHistoryView } from "@/packages/pms/components/guests/guest-activity-history-view";
import { GuestLoyaltyValueView } from "@/packages/pms/components/guests/guest-loyalty-value-view";
import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import {
  MORE_GUEST_DETAIL_VIEWS,
  PRIMARY_GUEST_DETAIL_VIEWS,
  legacyParamsForDetailView,
  type GuestDetailViewId,
} from "@/packages/pms/lib/guest-detail-view";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/shared/lib/utils";

export function GuestIndividualDetailWorkspace({
  membership,
  guestId,
  activeView = "overview",
  onViewChange,
  directorySearch,
}: {
  membership: RestaurantMembership;
  guestId: string;
  activeView?: GuestDetailViewId;
  onViewChange: (view: GuestDetailViewId) => void;
  directorySearch?: Record<string, unknown>;
  canCreate?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actions = useOptionalGuestProfileActions();
  const fetchGuest = useServerFn(getGuest);

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const isMoreActive = MORE_GUEST_DETAIL_VIEWS.some((def) => def.id === activeView);
  const activeMoreDef = MORE_GUEST_DETAIL_VIEWS.find((def) => def.id === activeView);

  if (guestQuery.isLoading) {
    return (
      <div className="space-y-6" data-testid="guest-individual-detail-loading">
        <div className="flex items-center gap-2 text-xs text-[#756A5B]">
          <RefreshCw className="size-3.5 animate-spin text-[#8A641A]" />
          <span>Loading guest profile…</span>
        </div>
        <div className="h-28 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (guestQuery.isError || !guestQuery.data) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-8 text-center space-y-4 shadow-sm"
        data-testid="guest-individual-detail-error"
      >
        <p className="font-display text-lg font-semibold text-[#251605]">
          That guest could not be found for this property.
        </p>
        <p className="text-xs text-[#756A5B]">
          The requested profile may have been merged, deleted, or belongs to another property.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
          onClick={() =>
            void navigate({
              to: GUEST_PROFILE_DIRECTORY_PATH,
              search: guestProfileSearch({ card: "directory", type: "guest", ...directorySearch }),
            })
          }
        >
          <ArrowLeft className="mr-1.5 size-3.5" /> Back to Guest Directory
        </Button>
      </div>
    );
  }

  const { guest, history, preferences } = guestQuery.data;
  const legacyCard = legacyParamsForDetailView(activeView).card;

  return (
    <div
      className="space-y-4"
      data-testid="guest-individual-detail-workspace"
      data-guest-id={guestId}
      data-active-view={activeView}
    >
      {/* Compact Operational Identity Header */}
      <GuestProfileHeader
        restaurantId={restaurantId}
        guest={guest}
        returnCard={legacyCard}
        profileType="guest"
        directorySearch={directorySearch}
      />

      {/* Simplified Unified Detail Navigation Bar matching Reservations & Rooms */}
      <nav
        aria-label="Guest profile sections"
        className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#DDD4C5] pb-px"
        role="tablist"
        data-testid="guest-detail-section-nav"
      >
        {/* Primary Visible Tabs */}
        {PRIMARY_GUEST_DETAIL_VIEWS.map((def) => {
          const isActive = def.id === activeView;
          return (
            <button
              key={def.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`guest-detail-tab-${def.id}`}
              onClick={() => onViewChange(def.id)}
              className={cn(
                "shrink-0 border-b-2 px-3.5 py-2 text-xs transition-colors",
                isActive
                  ? "border-[#C89933] font-semibold text-[#251605]"
                  : "border-transparent text-[#756A5B] hover:border-[#DDD4C5] hover:text-[#251605]",
              )}
            >
              {def.label}
            </button>
          );
        })}

        {/* More ▾ Dropdown Menu for Secondary Tabs */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="guest-detail-tab-more"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 border-b-2 px-3.5 py-2 text-xs transition-colors",
                isMoreActive
                  ? "border-[#C89933] font-semibold text-[#8A641A]"
                  : "border-transparent text-[#756A5B] hover:border-[#DDD4C5] hover:text-[#251605]",
              )}
              aria-label="More guest profile views"
            >
              <span>{isMoreActive && activeMoreDef ? activeMoreDef.label : "More"}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52 border-[#DDD4C5] bg-white text-[#251605] shadow-xl"
          >
            {MORE_GUEST_DETAIL_VIEWS.map((def) => {
              const isSelected = def.id === activeView;
              return (
                <DropdownMenuItem
                  key={def.id}
                  data-testid={`guest-detail-more-item-${def.id}`}
                  onSelect={() => onViewChange(def.id)}
                  className={cn(
                    "cursor-pointer text-xs py-2",
                    isSelected ? "bg-[#F4E9D0] text-[#8A641A] font-semibold" : "text-[#251605] hover:bg-[#F7F4EE]",
                  )}
                >
                  <div className="flex flex-col">
                    <span>{def.label}</span>
                    <span className="text-[10px] text-[#756A5B] line-clamp-1">{def.description}</span>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* Active View Container */}
      <div className="pt-1" data-testid={`guest-detail-view-content-${activeView}`}>
        {activeView === "overview" && (
          <GuestIndividualOverview
            restaurantId={restaurantId}
            guest={guest}
            timezone={membership.restaurant.timezone}
            history={history}
            onNavigateView={onViewChange}
          />
        )}

        {activeView === "personal-contact" && (
          <GuestPersonalContactView
            restaurantId={restaurantId}
            guest={guest}
            onEdit={actions?.openEdit}
          />
        )}

        {activeView === "identity" && (
          <GuestIdentityCard restaurantId={restaurantId} guest={guest} />
        )}

        {activeView === "preferences" && (
          <GuestPreferencesView
            restaurantId={restaurantId}
            guestId={guest.id}
            guest={guest}
            preferences={preferences}
            onSaved={() => {
              void queryClient.invalidateQueries({
                queryKey: ["guest", restaurantId, guest.id],
              });
            }}
          />
        )}

        {activeView === "stays" && (
          <GuestStaysReservationsView
            restaurantId={restaurantId}
            guestId={guest.id}
            guestName={guest.fullName}
            guestProfileNumber={guest.profileNumber}
            timezone={membership.restaurant.timezone}
            onOpenFinancial={() => onViewChange("loyalty")}
          />
        )}

        {activeView === "relationships" && (
          <GuestRelationshipsView restaurantId={restaurantId} guestId={guest.id} />
        )}

        {activeView === "services" && (
          <GuestServicesView
            restaurantId={restaurantId}
            guestId={guest.id}
            guestName={guest.fullName}
            guestProfileNumber={guest.profileNumber}
            timezone={membership.restaurant.timezone}
            onOpenBookings={() => onViewChange("stays")}
          />
        )}

        {activeView === "communication-notes" && (
          <GuestCommunicationNotesView
            restaurantId={restaurantId}
            guestId={guest.id}
            partyName={guest.fullName}
          />
        )}

        {activeView === "privacy" && (
          <GuestPrivacyAdministrationView
            restaurantId={restaurantId}
            guestId={guest.id}
            guest={guest}
            partyName={guest.fullName}
          />
        )}

        {activeView === "activity" && (
          <GuestActivityHistoryView
            restaurantId={restaurantId}
            guestId={guest.id}
            partyName={guest.fullName}
          />
        )}

        {activeView === "loyalty" && (
          <GuestLoyaltyValueView
            restaurantId={restaurantId}
            guestId={guest.id}
            partyName={guest.fullName}
          />
        )}
      </div>
    </div>
  );
}
