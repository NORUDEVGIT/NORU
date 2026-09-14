import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestDashboardCard } from "@/packages/pms/components/guests/guest-dashboard-card";
import { GuestDetailWorkspace } from "@/packages/pms/components/workspaces/guest-detail-workspace";
import { GuestDirectoryWorkspace } from "@/packages/pms/components/workspaces/guest-directory-workspace";
import { GuestIdentityCard } from "@/packages/pms/components/guests/guest-identity-card";
import { GuestStayHistoryCard } from "@/packages/pms/components/guests/guest-stay-history-card";
import {
  GUEST_PROFILE_CARDS,
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_TITLE,
  GUEST_PROFILE_TYPES,
  comingInWaveLabel,
  defaultGuestProfileCard,
  guestProfileCard,
  type GuestProfileCardId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestProfileWorkspace({
  membership,
  guestId,
}: {
  membership: RestaurantMembership;
  guestId?: string;
}) {
  const navigate = useNavigate();
  const [card, setCard] = useState<GuestProfileCardId>(defaultGuestProfileCard(Boolean(guestId)));
  const selected = guestProfileCard(card);
  const restaurantId = membership.restaurant.id;
  const fetchGuest = useServerFn(getGuest);
  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled:
      Boolean(guestId) && (card === "identity" || card === "dashboard" || card === "stay-history"),
    retry: false,
  });

  function selectCard(next: GuestProfileCardId) {
    if (next === "directory" && guestId) {
      void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
      return;
    }
    setCard(next);
  }

  const detailSection = card === "preferences" ? "preferences" : "overview";

  return (
    <div className="space-y-6" data-testid="guest-profile-shell">
      <div>
        <h1 className="font-display text-2xl">{GUEST_PROFILE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">
          Individual directory, information, identity, preferences, stay history and honest
          dashboard figures. Later cards stay labelled until their wave is LIVE.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        data-testid="guest-profile-type-switcher"
        role="tablist"
        aria-label="Profile type"
      >
        {GUEST_PROFILE_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={type.live}
            disabled={!type.live}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              type.live
                ? "border-primary bg-primary text-primary-foreground"
                : "cursor-not-allowed border-dashed border-border text-muted-foreground",
            )}
            title={type.live ? "Individual profiles are LIVE" : `${type.title} is not LIVE`}
          >
            {type.title}
            {type.live ? null : (
              <span className="ml-2 text-[11px] uppercase tracking-wide">
                not LIVE · Wave {type.wave}
              </span>
            )}
          </button>
        ))}
      </div>

      <nav aria-label="Guest profile cards" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {GUEST_PROFILE_CARDS.map((item) => {
          const active = item.id === card;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`guest-profile-card-${item.id}`}
              onClick={() => selectCard(item.id)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {item.live ? "LIVE" : comingInWaveLabel(item.wave)}
              </p>
            </button>
          );
        })}
      </nav>

      {card === "directory" ? (
        <GuestDirectoryWorkspace membership={membership} compact />
      ) : (card === "information" || card === "preferences") && guestId ? (
        <GuestDetailWorkspace
          membership={membership}
          guestId={guestId}
          backTo="guest-profile"
          section={detailSection}
          onSectionChange={(next) =>
            setCard(next === "preferences" ? "preferences" : "information")
          }
        />
      ) : card === "information" || card === "preferences" ? (
        <ComingCard
          title={selected.title}
          copy="Open a guest from Directory to view and edit this card. No guest is selected yet."
        />
      ) : card === "identity" && guestId && guestQuery.data ? (
        <GuestIdentityCard restaurantId={restaurantId} guest={guestQuery.data.guest} />
      ) : card === "identity" && !guestId ? (
        <ComingCard
          title={selected.title}
          copy="Open a guest from Directory to use this card. No guest is selected yet."
        />
      ) : card === "identity" && guestQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading guest…</p>
      ) : card === "identity" && guestQuery.isError ? (
        <ComingCard
          title={selected.title}
          copy="That guest could not be found for this property."
        />
      ) : (card === "dashboard" || card === "stay-history") && guestId && guestQuery.data ? (
        card === "dashboard" ? (
          <GuestDashboardCard
            restaurantId={restaurantId}
            guestId={guestId}
            guestName={guestQuery.data.guest.fullName}
            timezone={membership.restaurant.timezone}
          />
        ) : (
          <GuestStayHistoryCard
            restaurantId={restaurantId}
            guestId={guestId}
            guestName={guestQuery.data.guest.fullName}
            timezone={membership.restaurant.timezone}
          />
        )
      ) : card === "dashboard" || card === "stay-history" ? (
        <ComingCard
          title={selected.title}
          copy={
            guestId
              ? guestQuery.isLoading
                ? "Loading guest…"
                : "That guest could not be found for this property."
              : "Open a guest from Directory to view this card. No guest is selected yet."
          }
        />
      ) : (
        <ComingCard
          title={selected.title}
          copy={selected.copy ?? comingInWaveLabel(selected.wave)}
        />
      )}
    </div>
  );
}

function ComingCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card p-6"
      data-testid="guest-profile-coming"
    >
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
