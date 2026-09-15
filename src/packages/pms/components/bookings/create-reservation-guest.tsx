import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserPlus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { GuestRestrictionBadges, GuestRestrictionWarn, VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS } from "@/packages/pms/lib/create-reservation-phase1";
import { getGuest, listGuests, type GuestProfile, type GuestSummary } from "@/packages/pms/lib/guests.functions";

export type PickedReservationGuest = GuestSummary & { restrictionReason?: string | null };

function toPickedGuest(guest: GuestProfile | GuestSummary): PickedReservationGuest {
  const picked: PickedReservationGuest = { ...guest };
  if ("restrictionReason" in guest && guest.restrictionReason != null) {
    picked.restrictionReason = guest.restrictionReason;
  }
  return picked;
}

export function CreateReservationGuest({
  restaurantId,
  canCreateGuest,
  guest,
  onGuestChange,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  guest: PickedReservationGuest | null;
  onGuestChange: (guest: PickedReservationGuest | null) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
  const [guestSearch, setGuestSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(guestSearch),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [guestSearch]);

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, debouncedSearch, "reservation-picker"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: 8,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
      }),
  });

  const peekQuery = useQuery({
    queryKey: ["guest", restaurantId, guest?.id, "reservation-peek"],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guest!.id } }),
    enabled: peekOpen && !!guest,
  });

  async function selectById(guestId: string) {
    try {
      const result = await fetchGuest({ data: { restaurantId, guestId } });
      onGuestChange(toPickedGuest(result.guest));
    } catch {
      const match = (guestsQuery.data ?? []).find((row) => row.id === guestId) ?? null;
      onGuestChange(match);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4" data-testid="create-reservation-guest">
      <h2 className="font-display text-lg">Guest</h2>
      {guest ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
          data-testid="selected-guest-card"
        >
          <div>
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {guest.fullName}
              {guest.vipStatus ? <VipBadge /> : null}
              <GuestRestrictionBadges guest={guest} />
            </p>
            <p className="text-xs text-muted-foreground">
              {[guest.phone, guest.email].filter(Boolean).join(" · ") || "No contact details"}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" data-testid="view-guest" onClick={() => setPeekOpen(true)}>
              View guest
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="change-guest"
              onClick={() => {
                onGuestChange(null);
                setGuestSearch("");
              }}
            >
              Change guest
            </Button>
          </div>
        </div>
      ) : null}
      {guest ? (
        <div className="mt-3">
          <GuestRestrictionWarn guest={guest} />
        </div>
      ) : null}
      {!guest ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                data-testid="guest-search"
                placeholder="Search guests by name, phone or email"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
              />
            </div>
            {canCreateGuest ? (
              <Button type="button" variant="outline" data-testid="create-guest-inline" onClick={() => setFormOpen(true)}>
                <UserPlus className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Create guest</span>
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2" data-testid="guest-search-results">
            {(guestsQuery.data ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onGuestChange(toPickedGuest(row))}
                  className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                >
                  <span className="inline-flex flex-wrap items-center gap-2 font-medium">
                    {row.fullName}
                    {row.vipStatus ? <VipBadge /> : null}
                    <GuestRestrictionBadges guest={row} />
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {[row.phone, row.email].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
            {guestsQuery.data?.length === 0 ? (
              <li className="text-sm text-muted-foreground">No matching guests — create one without leaving this page.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <GuestFormDialog
        restaurantId={restaurantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(guestId) => void selectById(guestId)}
        onOpenExisting={(guestId) => void selectById(guestId)}
      />

      <Sheet open={peekOpen} onOpenChange={setPeekOpen}>
        <SheetContent side="right" className="overflow-y-auto" data-testid="guest-peek-drawer">
          <SheetHeader>
            <SheetTitle>{guest?.fullName ?? "Guest"}</SheetTitle>
            <SheetDescription>Reservation draft stays on this page.</SheetDescription>
          </SheetHeader>
          {peekQuery.isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading guest…</p>
          ) : peekQuery.data?.guest ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {peekQuery.data.guest.fullName}
                {peekQuery.data.guest.vipStatus ? <VipBadge /> : null}
                <GuestRestrictionBadges guest={peekQuery.data.guest} />
              </p>
              <p className="text-muted-foreground">
                {[peekQuery.data.guest.phone, peekQuery.data.guest.email].filter(Boolean).join(" · ") ||
                  "No contact details"}
              </p>
              <GuestRestrictionWarn guest={peekQuery.data.guest} />
              {peekQuery.data.guest.nationality ? (
                <p className="text-muted-foreground">Nationality: {peekQuery.data.guest.nationality}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Guest details could not be loaded.</p>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
