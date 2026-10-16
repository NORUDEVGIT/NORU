import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Globe, Mail, Phone, Search, User, UserPlus } from "lucide-react";

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
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  PMS_OP_BTN_COMPACT,
  PMS_OP_BTN_OUTLINE,
  PMS_OP_INPUT,
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

function guestResultMeta(row: GuestSummary): string {
  return [row.profileNumber ? `Guest ID ${row.profileNumber}` : null, row.phone, row.email]
    .filter(Boolean)
    .join(" · ");
}

function guestInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "G";
}

const CARD = "min-w-0 h-full rounded-[6px] border border-[#CCCCCC] bg-white p-4 shadow-none";

function PanelHeading({ icon, title, helper }: { icon: ReactNode; title: string; helper: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#251605]">{title}</h2>
        <p className="text-xs text-[#6B5E4E]">{helper}</p>
      </div>
    </div>
  );
}

type GuestPicker = {
  canCreateGuest: boolean;
  guest: PickedReservationGuest | null;
  guestSearch: string;
  setGuestSearch: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showResults: boolean;
  searching: boolean;
  rows: GuestSummary[];
  selectListedGuest: (row: GuestSummary) => void;
  changeGuest: () => void;
  openCreate: () => void;
  openPeek: () => void;
  selectedPanelTitle: string;
};

const GuestPickerContext = createContext<GuestPicker | null>(null);

function useGuestPickerContext(): GuestPicker {
  const value = useContext(GuestPickerContext);
  if (!value) {
    throw new Error("Guest search panels must render inside CreateReservationGuest");
  }
  return value;
}

function useGuestPicker({
  restaurantId,
  canCreateGuest,
  guest,
  onGuestChange,
  listEnabled,
  selectedPanelTitle,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  guest: PickedReservationGuest | null;
  onGuestChange: (guest: PickedReservationGuest | null) => void;
  listEnabled: boolean;
  selectedPanelTitle: string;
}) {
  const fetchGuests = useServerFn(listGuests);
  const fetchGuest = useServerFn(getGuest);
  const [guestSearch, setGuestSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedSearch(guestSearch),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [guestSearch]);

  const trimmedSearch = debouncedSearch.trim();
  const guestsQuery = useQuery({
    queryKey: [
      "guests",
      restaurantId,
      "reservation-search",
      trimmedSearch,
      CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
    ],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
          offset: 0,
          search: trimmedSearch,
        },
      }),
    enabled: listEnabled && !guest && trimmedSearch.length > 0,
  });

  const rows = guestListItems(guestsQuery.data);
  const searchPending = guestSearch.trim() !== trimmedSearch;
  const searching =
    searchPending || guestsQuery.isLoading || (guestsQuery.isFetching && rows.length === 0);
  const showResults = !guest && guestSearch.trim().length > 0;

  const peekQuery = useQuery({
    queryKey: ["guest", restaurantId, guest?.id, "reservation-peek"],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guest!.id } }),
    enabled: peekOpen && !!guest,
  });

  function clearSearch() {
    setGuestSearch("");
    setDebouncedSearch("");
  }

  function selectListedGuest(row: GuestSummary) {
    onGuestChange(toPickedGuest(row));
    clearSearch();
  }

  async function selectById(guestId: string) {
    try {
      const result = await fetchGuest({ data: { restaurantId, guestId } });
      onGuestChange(toPickedGuest(result.guest));
    } catch {
      const match = rows.find((row) => row.id === guestId) ?? null;
      onGuestChange(match);
    }
    clearSearch();
  }

  function changeGuest() {
    onGuestChange(null);
    clearSearch();
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  const picker: GuestPicker = {
    canCreateGuest,
    guest,
    guestSearch,
    setGuestSearch,
    searchInputRef,
    showResults,
    searching,
    rows,
    selectListedGuest,
    changeGuest,
    openCreate: () => setFormOpen(true),
    openPeek: () => setPeekOpen(true),
    selectedPanelTitle,
  };

  return { picker, formOpen, setFormOpen, peekOpen, setPeekOpen, peekQuery, selectById };
}

export function CreateReservationGuest({
  restaurantId,
  canCreateGuest,
  guest,
  onGuestChange,
  listEnabled = true,
  selectedPanelTitle = "Selected Guest",
  children,
}: {
  restaurantId: string;
  canCreateGuest: boolean;
  guest: PickedReservationGuest | null;
  onGuestChange: (guest: PickedReservationGuest | null) => void;
  /** When false, skip listGuests (for example off step 0). */
  listEnabled?: boolean;
  selectedPanelTitle?: string;
  children?: ReactNode;
}) {
  const { picker, formOpen, setFormOpen, peekOpen, setPeekOpen, peekQuery, selectById } =
    useGuestPicker({
      restaurantId,
      canCreateGuest,
      guest,
      onGuestChange,
      listEnabled,
      selectedPanelTitle,
    });

  return (
    <GuestPickerContext.Provider value={picker}>
      {children ?? (
        <>
          <CreateReservationGuestSearch />
          <CreateReservationGuestSelected />
        </>
      )}
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
            <SheetDescription>
              Reservation draft stays on this page. Create guest without leaving this page.
            </SheetDescription>
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
    </GuestPickerContext.Provider>
  );
}

export function CreateReservationGuestSearch() {
  const picker = useGuestPickerContext();

  return (
    <section className={CARD} data-testid="guest-search-panel">
      <PanelHeading
        icon={<Search className="size-3.5" aria-hidden />}
        title="Guest Search"
        helper="Search for an existing guest or create a new one."
      />
      <div className="mt-3 space-y-2">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B5E4E]" />
          <label className="sr-only" htmlFor="guest-search">
            Search guest by name, phone, email or guest ID
          </label>
          <Input
            id="guest-search"
            ref={picker.searchInputRef}
            className={cn(PMS_OP_INPUT, "pl-9")}
            data-testid="guest-search"
            placeholder="Search by name, phone, email or guest ID..."
            value={picker.guestSearch}
            autoComplete="off"
            onChange={(event) => picker.setGuestSearch(event.target.value)}
          />
        </div>
        {picker.canCreateGuest ? (
          <Button
            type="button"
            variant="outline"
            className={cn(PMS_OP_BTN_OUTLINE, "w-full justify-center")}
            data-testid="create-guest-inline"
            onClick={picker.openCreate}
          >
            <UserPlus className="size-4" />
            Create New Guest
          </Button>
        ) : null}
        {picker.showResults ? (
          <div
            className="max-h-56 overflow-y-auto rounded-[6px] border border-[#CCCCCC] bg-white"
            data-testid="guest-search-results"
          >
            {picker.searching ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Searching guests…</p>
            ) : null}
            {!picker.searching && picker.rows.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No matching guests found.</p>
            ) : null}
            {!picker.searching ? (
              <ul>
                {picker.rows.map((row) => (
                  <li key={row.id} className="border-b border-[#E7E0D4] last:border-b-0">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#FAF8F4]"
                      onClick={() => picker.selectListedGuest(row)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#F3EDE3] text-[11px] font-semibold text-[#251605]">
                        {guestInitials(row.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-[#251605]">
                          {row.fullName}
                          {row.vipStatus ? <VipBadge /> : null}
                          <GuestRestrictionBadges guest={row} />
                        </span>
                        {guestResultMeta(row) ? (
                          <span className="mt-0.5 block truncate text-xs text-[#6B5E4E]">
                            {guestResultMeta(row)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CreateReservationGuestSelected() {
  const picker = useGuestPickerContext();
  const guest = picker.guest;

  return (
    <section className={CARD} data-testid="selected-guest-panel">
      <PanelHeading
        icon={<User className="size-3.5" aria-hidden />}
        title={picker.selectedPanelTitle || "Selected Guest"}
        helper={guest ? "Guest attached to this reservation." : "Select a guest to continue."}
      />
      {guest ? (
        <div className="mt-3" data-testid="selected-guest-card">
          <div className="flex items-start gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F3EDE3] text-xs font-semibold text-[#251605]">
              {guestInitials(guest.fullName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#251605]">{guest.fullName}</p>
              <p className="truncate text-xs text-[#6B5E4E]">
                {guest.profileNumber ? `Guest ID ${guest.profileNumber}` : "Guest ID —"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {guest.vipStatus ? <VipBadge /> : null}
                <GuestRestrictionBadges guest={guest} />
              </div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <GuestFact icon={<Mail className="size-3.5" aria-hidden />} label="Email">
              {guest.email ?? "—"}
            </GuestFact>
            <GuestFact icon={<Phone className="size-3.5" aria-hidden />} label="Phone">
              {guest.phone ?? "—"}
            </GuestFact>
            {guest.nationality ? (
              <GuestFact icon={<Globe className="size-3.5" aria-hidden />} label="Nationality">
                {guest.nationality}
              </GuestFact>
            ) : null}
            {formatLastStay(guest.lastStayAt) !== "—" ? (
              <GuestFact icon={<CalendarDays className="size-3.5" aria-hidden />} label="Last stay">
                {formatLastStay(guest.lastStayAt)}
              </GuestFact>
            ) : null}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={PMS_OP_BTN_COMPACT}
              data-testid="view-guest"
              onClick={picker.openPeek}
            >
              View Profile
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={PMS_OP_BTN_COMPACT}
              data-testid="change-guest"
              onClick={picker.changeGuest}
            >
              Change Guest
            </Button>
          </div>
          <div className="mt-3">
            <GuestRestrictionWarn guest={guest} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#6B5E4E]" data-testid="selected-guest-empty">
          No guest selected. Select a guest to continue.
        </p>
      )}
    </section>
  );
}

function GuestFact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <span className="mt-0.5 text-[#C89933]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wide text-[#6B5E4E]">{label}</dt>
        <dd className="truncate text-sm text-[#251605]">{children}</dd>
      </div>
    </div>
  );
}
