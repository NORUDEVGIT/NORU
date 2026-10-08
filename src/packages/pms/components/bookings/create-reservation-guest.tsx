import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserPlus } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
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
import {
  GuestRestrictionBadges,
  GuestRestrictionWarn,
  VipBadge,
} from "@/packages/pms/components/guests/guest-bits";
import {
  CREATE_RESERVATION_GUEST_PAGE_SIZE,
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  guestPickerPageCount,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  PMS_OP_BTN_COMPACT,
  PMS_OP_BTN_OUTLINE,
  PMS_OP_BTN_PAGINATION,
  PMS_OP_INSET_PANEL,
  PMS_OP_INPUT,
  PMS_OP_PANEL,
  PMS_OP_TABLE_HEAD,
  PMS_OP_TABLE_ROW,
  PMS_OP_TABLE_SHELL,
} from "@/packages/pms/lib/pms-operational-surface";
import { cn } from "@/shared/lib/utils";
import {
  getGuest,
  guestListItems,
  listGuests,
  type GuestProfile,
  type GuestSummary,
} from "@/packages/pms/lib/guests.functions";

export type PickedReservationGuest = GuestSummary & { restrictionReason?: string | null };

export function toPickedGuest(guest: GuestProfile | GuestSummary): PickedReservationGuest {
  const picked: PickedReservationGuest = { ...guest };
  if ("restrictionReason" in guest && guest.restrictionReason != null) {
    picked.restrictionReason = guest.restrictionReason;
  }
  return picked;
}

function formatLastStay(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const day = value.trim().slice(0, 10);
  return day.length === 10 ? formatStayDate(day) : value;
}

export function CreateReservationGuest({
  restaurantId,
  canCreateGuest,
  guest,
  onGuestChange,
  listEnabled = true,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  guest: PickedReservationGuest | null;
  onGuestChange: (guest: PickedReservationGuest | null) => void;
  /** When false, skip listGuests pages (e.g. off step 0 or guest already selected). */
  listEnabled?: boolean;
}) {
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
  const [guestSearch, setGuestSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(guestSearch),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [guestSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const offset = (page - 1) * CREATE_RESERVATION_GUEST_PAGE_SIZE;

  const guestsQuery = useQuery({
    queryKey: [
      "guests",
      restaurantId,
      debouncedSearch,
      "reservation-picker",
      offset,
      CREATE_RESERVATION_GUEST_PAGE_SIZE,
    ],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: CREATE_RESERVATION_GUEST_PAGE_SIZE,
          offset,
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        },
      }),
    enabled: listEnabled && !guest,
  });

  const listPage = guestsQuery.data && !Array.isArray(guestsQuery.data) ? guestsQuery.data : null;
  const total = listPage?.total ?? guestListItems(guestsQuery.data).length;
  const pageCount = guestPickerPageCount(total, CREATE_RESERVATION_GUEST_PAGE_SIZE);
  const rows = guestListItems(guestsQuery.data);

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
      const match = rows.find((row) => row.id === guestId) ?? null;
      onGuestChange(match);
    }
  }

  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="create-reservation-guest">
      <h2 className="font-display text-lg text-[#251605]">Guest</h2>
      {guest ? (
        <div className={cn(PMS_OP_INSET_PANEL, "mt-3 p-3")} data-testid="selected-guest-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected Guest
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {guest.fullName}
                {guest.vipStatus ? <VipBadge /> : null}
                <GuestRestrictionBadges guest={guest} />
              </p>
              <dl className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide">Guest ID</dt>
                  <dd>{guest.profileNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide">Phone</dt>
                  <dd>{guest.phone ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide">Email</dt>
                  <dd>{guest.email ?? "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className={PMS_OP_BTN_COMPACT}
                data-testid="view-guest"
                onClick={() => setPeekOpen(true)}
              >
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={PMS_OP_BTN_COMPACT}
                data-testid="change-guest"
                onClick={() => {
                  onGuestChange(null);
                  setGuestSearch("");
                  setPage(1);
                }}
              >
                Change Guest
              </Button>
            </div>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B5E4E]" />
              <label className="sr-only" htmlFor="guest-search">
                Search guests by name, phone or email
              </label>
              <Input
                id="guest-search"
                className={cn(PMS_OP_INPUT, "pl-9")}
                data-testid="guest-search"
                placeholder="Search name, phone, email, guest ID..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
              />
            </div>
            {canCreateGuest ? (
              <Button
                type="button"
                variant="outline"
                className={cn(PMS_OP_BTN_OUTLINE, "shrink-0")}
                data-testid="create-guest-inline"
                onClick={() => setFormOpen(true)}
              >
                <UserPlus className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">Create New Guest</span>
                <span className="sr-only">Create guest</span>
              </Button>
            ) : null}
          </div>
          <div className={PMS_OP_TABLE_SHELL} data-testid="guest-search-results">
            <table className="w-full border-collapse text-left text-sm">
              <thead className={PMS_OP_TABLE_HEAD}>
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Guest</th>
                  <th className="px-3 py-2.5 font-semibold">Guest ID</th>
                  <th className="px-3 py-2.5 font-semibold">Phone</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th className="px-3 py-2.5 font-semibold">VIP</th>
                  <th className="px-3 py-2.5 font-semibold">Last Stay</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="text-[#251605]">
                {guestsQuery.isLoading ? (
                  <tr className={PMS_OP_TABLE_ROW}>
                    <td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground">
                      Loading guests…
                    </td>
                  </tr>
                ) : null}
                {!guestsQuery.isLoading
                  ? rows.map((row) => (
                      <tr key={row.id} className={PMS_OP_TABLE_ROW}>
                        <td className="px-3 py-2.5 align-middle font-medium">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {row.fullName}
                            <GuestRestrictionBadges guest={row} />
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {row.profileNumber ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {row.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {row.email ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {row.vipStatus ? "Yes" : "—"}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-muted-foreground">
                          {formatLastStay(row.lastStayAt)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-middle">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={PMS_OP_BTN_COMPACT}
                            onClick={() => onGuestChange(toPickedGuest(row))}
                          >
                            Select
                          </Button>
                        </td>
                      </tr>
                    ))
                  : null}
                {!guestsQuery.isLoading && rows.length === 0 ? (
                  <tr className={PMS_OP_TABLE_ROW}>
                    <td colSpan={7} className="px-3 py-3 text-sm text-muted-foreground">
                      No matching guests — create one without leaving this page.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div
            className="flex flex-wrap items-center justify-center gap-3 text-sm"
            data-testid="guest-picker-pagination"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={PMS_OP_BTN_PAGINATION}
              disabled={page <= 1 || guestsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="min-w-[7rem] text-center text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={PMS_OP_BTN_PAGINATION}
              disabled={page >= pageCount || guestsQuery.isFetching}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Next
            </Button>
          </div>
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
                {[peekQuery.data.guest.phone, peekQuery.data.guest.email]
                  .filter(Boolean)
                  .join(" · ") || "No contact details"}
              </p>
              <GuestRestrictionWarn guest={peekQuery.data.guest} />
              {peekQuery.data.guest.nationality ? (
                <p className="text-muted-foreground">
                  Nationality: {peekQuery.data.guest.nationality}
                </p>
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
