import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { GuestDetailWorkspace } from "@/packages/pms/components/workspaces/guest-detail-workspace";
import { GuestDirectoryWorkspace } from "@/packages/pms/components/workspaces/guest-directory-workspace";
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

  function selectCard(next: GuestProfileCardId) {
    if (next === "directory" && guestId) {
      void navigate({ to: GUEST_PROFILE_DIRECTORY_PATH });
      return;
    }
    setCard(next);
  }

  return (
    <div className="space-y-6" data-testid="guest-profile-shell">
      <div>
        <h1 className="font-display text-2xl">{GUEST_PROFILE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">
          Individual directory and information. Other cards are labelled until their wave is LIVE.
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
              <span className="ml-2 text-[11px] uppercase tracking-wide">not LIVE · Wave {type.wave}</span>
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
      ) : card === "information" && guestId ? (
        <GuestDetailWorkspace membership={membership} guestId={guestId} backTo="guest-profile" />
      ) : card === "information" ? (
        <ComingCard
          title="Information"
          copy="Open a guest from Directory to view and edit Information. No guest is selected yet."
        />
      ) : (
        <ComingCard title={selected.title} copy={selected.copy ?? comingInWaveLabel(selected.wave)} />
      )}
    </div>
  );
}

function ComingCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-profile-coming">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
