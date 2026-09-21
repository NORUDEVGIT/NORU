import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestAccountDetail } from "@/packages/pms/components/guests/guest-account-detail";
import { GuestAccountDirectory } from "@/packages/pms/components/guests/guest-account-directory";
import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";
import { GuestDashboardCard } from "@/packages/pms/components/guests/guest-dashboard-card";
import { GuestDirectoryOpenButton } from "@/packages/pms/components/guests/guest-directory-open-button";
import { GuestIdentityCard } from "@/packages/pms/components/guests/guest-identity-card";
import { GuestLoyaltyCard } from "@/packages/pms/components/guests/guest-loyalty-card";
import { GuestProfileHeader } from "@/packages/pms/components/guests/guest-profile-header";
import { GuestPrivacyCard } from "@/packages/pms/components/guests/guest-privacy-card";
import { GuestRelationshipsCard } from "@/packages/pms/components/guests/guest-relationships-card";
import { GuestStayHistoryCard } from "@/packages/pms/components/guests/guest-stay-history-card";
import { GuestDetailWorkspace } from "@/packages/pms/components/workspaces/guest-detail-workspace";
import { GuestListingWorkspace } from "@/packages/pms/components/workspaces/guest-listing-workspace";
import {
  GUEST_PROFILE_CARDS,
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  GUEST_PROFILE_TYPES,
  comingInWaveLabel,
  guestProfileCard,
  guestProfileSearch,
  initialGuestProfileCard,
  isGuestProfileNavCard,
  isGuestRequiredProfileCard,
  showEmptyDirectoryCta,
  type GuestListingPlaceholderType,
  type GuestProfileCardId,
  type GuestProfileTypeId,
} from "@/packages/pms/lib/guest-profile-wave1";
import { guestListingSection, operationalProfileType } from "@/packages/pms/lib/guest-profile-listing";
import { profileTypeToAccountType } from "@/packages/pms/lib/guest-profile-wave4";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestProfileWorkspace({
  membership,
  guestId,
  returnCard,
  profileType = "individual",
}: {
  membership: RestaurantMembership;
  guestId?: string | undefined;
  /** Guest-required card to reopen after Directory-back (Spec §5.15). */
  returnCard?: GuestProfileCardId | undefined;
  profileType?: GuestProfileTypeId | GuestListingPlaceholderType | undefined;
}) {
  const navigate = useNavigate();
  const [card, setCard] = useState<GuestProfileCardId>(
    initialGuestProfileCard(Boolean(guestId), returnCard),
  );
  const [emptyReturnCard, setEmptyReturnCard] = useState<GuestProfileCardId | undefined>();
  const selected = guestProfileCard(card);
  const restaurantId = membership.restaurant.id;
  const operationalType = operationalProfileType(guestListingSection(profileType));
  const accountType = profileTypeToAccountType(operationalType);
  const isAccount = accountType !== null;
  const fetchGuest = useServerFn(getGuest);
  const fetchAccount = useServerFn(getGuestAccount);
  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(guestId) && !isAccount,
    retry: false,
  });
  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, guestId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: guestId! } }),
    enabled:
      Boolean(guestId) &&
      isAccount &&
      (card === "loyalty" ||
        card === "relationships" ||
        card === "notes-comms" ||
        card === "admin-privacy"),
    retry: false,
  });

  function selectType(next: GuestProfileTypeId) {
    const live = GUEST_PROFILE_TYPES.find((type) => type.id === next)?.live;
    if (!live) return;
    setCard("directory");
    void navigate({
      to: GUEST_PROFILE_DIRECTORY_PATH,
      search: guestProfileSearch({ type: next }),
    });
  }

  function selectCard(next: GuestProfileCardId) {
    if (next === "directory" && guestId) {
      void navigate({
        to: GUEST_PROFILE_DIRECTORY_PATH,
        search: guestProfileSearch({ card, type: profileType }),
      });
      return;
    }
    setCard(next);
    if (guestId && isGuestRequiredProfileCard(next)) {
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId },
        search: guestProfileSearch({ card: next, type: profileType }),
      });
    }
  }

  const detailSection = card === "preferences" ? "preferences" : "overview";
  const emptyDirectoryFrom = showEmptyDirectoryCta(Boolean(guestId), card) ? card : undefined;
  const partyName = isAccount
    ? (accountQuery.data?.name ?? "")
    : (guestQuery.data?.guest.fullName ?? "");

  function openDirectoryFromEmpty() {
    if (!emptyDirectoryFrom) return;
    setEmptyReturnCard(emptyDirectoryFrom);
    setCard("directory");
  }

  const typeSwitcher = (
    <div
      className="flex w-full gap-2 overflow-x-auto pb-1"
      data-testid="guest-profile-type-switcher"
      role="tablist"
      aria-label="Profile type"
    >
      {GUEST_PROFILE_TYPES.map((type) => {
        const active = type.id === profileType;
        return (
          <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!type.live}
            data-testid={`guest-profile-type-${type.id}`}
            onClick={() => selectType(type.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
              type.live && active
                ? "border-primary bg-primary text-primary-foreground"
                : type.live
                  ? "border-border bg-card text-foreground hover:border-primary/50"
                  : "cursor-not-allowed border-dashed border-border text-muted-foreground",
            )}
            title={type.live ? `${type.title} profiles are LIVE` : `${type.title} is not LIVE`}
          >
            {type.title}
            {type.live ? null : (
              <span className="ml-2 text-[11px] uppercase tracking-wide">
                not LIVE · Wave {type.wave}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (!guestId && card === "directory") {
    return (
      <div className="space-y-6" data-testid="guest-profile-shell">
        <GuestListingWorkspace
          membership={membership}
          listingType={profileType}
          returnCard={returnCard ?? emptyReturnCard}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="guest-profile-shell">
      {!isAccount && guestQuery.data ? (
        <>
          <GuestProfileHeader
            restaurantId={restaurantId}
            guest={guestQuery.data.guest}
            returnCard={card}
            profileType={operationalType}
          />
          <GuestDashboardCard
            restaurantId={restaurantId}
            guestId={guestId!}
            guestName={guestQuery.data.guest.fullName}
            timezone={membership.restaurant.timezone}
            vipStatus={guestQuery.data.guest.vipStatus}
            showQuickActions={card === "dashboard"}
          />
        </>
      ) : (
        <div>
          <h1 className="font-display text-2xl">Guest Profiles</h1>
          <p className="text-sm text-muted-foreground">Search, manage and open guest profiles.</p>
        </div>
      )}

      {typeSwitcher}

      {guestId ? (
        <nav
          aria-label="Guest profile sections"
          className="flex w-full gap-1 overflow-x-auto border-b border-border pb-px"
          role="tablist"
          data-testid="guest-profile-section-nav"
        >
          {GUEST_PROFILE_CARDS.filter((item) => isGuestProfileNavCard(item.id)).map((item) => {
            const active = item.id === card;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`guest-profile-card-${item.id}`}
                onClick={() => selectCard(item.id)}
                role="tab"
                aria-selected={active}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {profileSectionLabel(item.id)}
              </button>
            );
          })}
        </nav>
      ) : null}

      {card === "directory" ? (
        isAccount ? (
          <GuestAccountDirectory
            membership={membership}
            accountType={accountType}
            returnCard={returnCard ?? emptyReturnCard}
          />
        ) : (
          <GuestDirectoryWorkspace
            membership={membership}
            compact
            returnCard={returnCard ?? emptyReturnCard}
          />
        )
      ) : (
        <>
          {(card === "information" || card === "preferences") && guestId && !isAccount ? (
            <GuestDetailWorkspace
              membership={membership}
              guestId={guestId}
              backTo="guest-profile"
              section={detailSection}
              hideHeader
              onSectionChange={(next) => {
                const nextCard = next === "preferences" ? "preferences" : "information";
                setCard(nextCard);
                void navigate({
                  to: GUEST_PROFILE_DETAIL_PATH,
                  params: { guestId },
                  search: guestProfileSearch({ card: nextCard, type: profileType }),
                });
              }}
            />
          ) : card === "information" && guestId && isAccount ? (
            <GuestAccountDetail
              restaurantId={restaurantId}
              accountId={guestId}
              expectedType={accountType}
            />
          ) : card === "information" || card === "preferences" ? (
            <ComingCard
              title={selected.title}
              copy={
                isAccount && card === "preferences"
                  ? "Preferences are for individual guests. Open an Individual from Directory or Relationships."
                  : "Open a guest from Directory to view and edit this card. No guest is selected yet."
              }
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "identity" && guestId && !isAccount && guestQuery.data ? (
            <GuestIdentityCard restaurantId={restaurantId} guest={guestQuery.data.guest} />
          ) : card === "identity" && isAccount ? (
            <ComingCard
              title={selected.title}
              copy="Identity & Documents is for individual guests. Open an Individual from Directory."
            />
          ) : card === "identity" && !guestId ? (
            <ComingCard
              title={selected.title}
              copy="Open a guest from Directory to use this card. No guest is selected yet."
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "identity" && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "identity" && guestQuery.isError ? (
            <ComingCard
              title={selected.title}
              copy="That guest could not be found for this property."
            />
          ) : (card === "dashboard" || card === "stay-history") && isAccount ? (
            <ComingCard
              title={selected.title}
              copy="Dashboard and Stay History are for individual guests. Linked members appear on Relationships and Loyalty & Value."
            />
          ) : (card === "dashboard" || card === "stay-history") && guestId && guestQuery.data ? (
            card === "dashboard" ? null : (
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
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : card === "loyalty" && guestId && !isAccount && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "relationships" && guestId && !isAccount && guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : card === "loyalty" && guestId && (isAccount || guestQuery.data) ? (
            <GuestLoyaltyCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              partyName={partyName || (isAccount ? "Account" : "Guest")}
            />
          ) : card === "relationships" && guestId && (isAccount || guestQuery.data) ? (
            <GuestRelationshipsCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              accountType={accountType ?? undefined}
            />
          ) : (card === "notes-comms" || card === "admin-privacy") &&
            guestId &&
            !isAccount &&
            guestQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading guest…</p>
          ) : (card === "notes-comms" || card === "admin-privacy") &&
            guestId &&
            isAccount &&
            accountQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading account…</p>
          ) : card === "notes-comms" && guestId && (isAccount || guestQuery.data) ? (
            <GuestActivityHubCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              partyName={partyName || (isAccount ? "Account" : "Guest")}
            />
          ) : card === "admin-privacy" && guestId && (isAccount || guestQuery.data) ? (
            <GuestPrivacyCard
              restaurantId={restaurantId}
              guestId={isAccount ? undefined : guestId}
              accountId={isAccount ? guestId : undefined}
              partyName={partyName || (isAccount ? "Account" : "Guest")}
            />
          ) : card === "loyalty" ||
            card === "relationships" ||
            card === "notes-comms" ||
            card === "admin-privacy" ? (
            <ComingCard
              title={selected.title}
              copy={
                guestId
                  ? "That profile could not be found for this property."
                  : "Open a guest or account from Directory to use this card."
              }
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          ) : (
            <ComingCard
              title={selected.title}
              copy={selected.copy ?? comingInWaveLabel(selected.wave)}
              directoryFromCard={emptyDirectoryFrom}
              profileType={profileType}
              onOpenDirectory={openDirectoryFromEmpty}
            />
          )}
        </>
      )}
    </div>
  );
}

function ComingCard({
  title,
  copy,
  directoryFromCard,
  profileType,
  onOpenDirectory,
}: {
  title: string;
  copy: string;
  directoryFromCard?: GuestProfileCardId | undefined;
  profileType?: GuestProfileTypeId | undefined;
  onOpenDirectory?: (() => void) | undefined;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-card p-6"
      data-testid="guest-profile-coming"
    >
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
      {directoryFromCard ? (
        <GuestDirectoryOpenButton
          fromCard={directoryFromCard}
          profileType={profileType}
          onOpen={onOpenDirectory}
        />
      ) : null}
    </div>
  );
}

function profileSectionLabel(id: GuestProfileCardId): string {
  const labels: Record<GuestProfileCardId, string> = {
    dashboard: "Overview",
    directory: "Directory",
    information: "Information",
    identity: "Documents",
    "stay-history": "Stay History",
    preferences: "Preferences",
    loyalty: "Loyalty & Value",
    relationships: "Relationships",
    "notes-comms": "Notes & Activity",
    "admin-privacy": "Admin & Privacy",
  };
  return labels[id];
}
