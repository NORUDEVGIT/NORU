import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Crown,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  PlusCircle,
  Shield,
  X,
} from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { displayProfileNumber } from "@/packages/pms/lib/guest-profile-listing";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GuestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { getGuest, listGuestDocuments, listGuestStays } from "@/packages/pms/lib/guests.functions";
import { listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";

type QuickViewTab = "overview" | "preferences" | "identity" | "relations";

export function GuestQuickViewDrawer({
  restaurantId,
  previewId,
  onClose,
  searchParams,
  onEditGuest,
}: {
  restaurantId: string;
  previewId: string | null | undefined;
  onClose: () => void;
  searchParams?: GuestProfileSearch;
  onEditGuest?: (guestId: string) => void;
}) {
  const navigate = useNavigate();
  const { date } = useRestaurantTime();
  const [tab, setTab] = useState<QuickViewTab>("overview");

  const isOpen = Boolean(previewId);

  const fetchGuest = useServerFn(getGuest);
  const fetchStays = useServerFn(listGuestStays);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchDocs = useServerFn(listGuestDocuments);

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, previewId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: previewId! } }),
    enabled: Boolean(previewId),
    staleTime: 30_000,
  });

  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, previewId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId: previewId! } }),
    enabled: Boolean(previewId),
    staleTime: 30_000,
  });

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, previewId],
    queryFn: () => fetchLinks({ data: { restaurantId, guestId: previewId! } }),
    enabled: Boolean(previewId),
    staleTime: 30_000,
  });

  const docsQuery = useQuery({
    queryKey: ["guest-documents", restaurantId, previewId],
    queryFn: () => fetchDocs({ data: { restaurantId, guestId: previewId! } }),
    enabled: Boolean(previewId),
    staleTime: 30_000,
  });

  const guest = guestQuery.data?.guest;
  const preferences = guestQuery.data?.preferences;
  const stays = staysQuery.data?.stays ?? [];
  const links = linksQuery.data ?? [];
  const docs = docsQuery.data ?? [];

  // Derived stay metrics
  const today = new Date().toISOString().slice(0, 10);
  const completedStays = stays.filter((s) => s.status === "checked_out");
  const totalStaysCount = completedStays.length;
  const totalNightsCount = completedStays.reduce((sum, s) => sum + (s.nights || 0), 0);

  const pastStays = stays
    .filter((s) => (s.departureDate || s.arrivalDate) <= today)
    .sort((a, b) =>
      (b.departureDate || b.arrivalDate).localeCompare(a.departureDate || a.arrivalDate),
    );
  const lastStayDate = pastStays[0]?.departureDate || pastStays[0]?.arrivalDate;

  const upcomingStays = stays
    .filter(
      (s) =>
        s.arrivalDate >= today &&
        s.status !== "cancelled" &&
        s.status !== "no_show" &&
        s.status !== "checked_out",
    )
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
  const nextStay = upcomingStays[0];

  // Linked accounts
  const companyLink = links.find((l) => l.masterType === "company");
  const travelAgentLink = links.find((l) => l.masterType === "travel_agent");
  const groupLink = links.find((l) => l.masterType === "group");

  // Primary identity document
  const primaryDoc = docs[0];

  function openFullProfile() {
    if (!previewId) return;
    // Preserve current directory state when navigating to full profile
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: previewId },
      search: guestProfileSearch({
        ...searchParams,
        preview: undefined,
        type: "individual",
        card: "information",
      }),
    });
  }

  function openNewReservation() {
    if (!previewId) return;
    void navigate({
      to: "/restaurant/bookings/new",
      search: { guestId: previewId },
    });
  }

  const initials = guest
    ? [guest.firstName?.[0], guest.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "GP"
    : "";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[#E8E4DC] bg-[#FAF8F5] p-0 sm:max-w-lg lg:max-w-xl text-[#251605]"
        data-testid="guest-quick-view-drawer"
      >
        {/* Drawer Header */}
        <SheetHeader className="border-b border-[#E8E4DC] bg-[#FFFFFF] px-6 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#E8E4DC] bg-[#FAF8F5] text-sm font-bold text-[#251605]">
                {guestQuery.isLoading ? <Skeleton className="size-8 rounded-full" /> : initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SheetTitle className="truncate font-display text-lg font-bold text-[#251605]">
                    {guestQuery.isLoading ? (
                      <Skeleton className="h-5 w-32" />
                    ) : (
                      (guest?.fullName ?? "Guest")
                    )}
                  </SheetTitle>
                  {guest?.vipStatus ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-[#ECD9A8] bg-[#FAF3E0] px-2 py-0.5 text-[11px] font-semibold text-[#8C6D23]"
                      data-testid="guest-quick-view-vip"
                    >
                      <Crown className="size-3 fill-[#8C6D23]" />
                      VIP
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs">
                  <span className="font-mono text-[#7A6B58]">
                    {previewId ? displayProfileNumber(previewId, guest?.profileNumber) : "—"}
                  </span>
                  <span className="text-[#D6D0C4]">·</span>
                  <span
                    className={cn(
                      "font-medium capitalize",
                      guest?.guestStatus === "active" ? "text-emerald-700" : "text-neutral-500",
                    )}
                  >
                    {guest?.guestStatus ?? "Active"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="size-8 text-[#7A6B58] hover:bg-[#FAF8F5] hover:text-[#251605]"
              data-testid="guest-quick-view-close"
              aria-label="Close drawer"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Sub-nav tabs */}
          <div className="mt-4 flex gap-1 border-t border-[#F0ECE3] pt-3 text-xs" role="tablist">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "preferences", label: "Preferences" },
                { id: "identity", label: "Identity" },
                { id: "relations", label: "Relations" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative px-3 py-1.5 font-medium transition-colors",
                  tab === t.id
                    ? "font-semibold text-[#251605]"
                    : "text-[#7A6B58] hover:text-[#251605]",
                )}
                data-testid={`guest-quick-view-tab-${t.id}`}
              >
                {t.label}
                {tab === t.id ? (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded bg-[#C89933]" />
                ) : null}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {guestQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : !guest ? (
            <div className="rounded-xl border border-dashed border-[#E8E4DC] p-6 text-center text-sm text-[#7A6B58]">
              Guest details could not be loaded.
            </div>
          ) : tab === "overview" ? (
            <div className="space-y-4">
              {/* Guest Identity */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Guest Identity
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[#7A6B58]">Full Name</dt>
                    <dd className="font-medium text-[#251605]">{guest.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Profile No.</dt>
                    <dd className="font-mono font-medium text-[#251605]">
                      {displayProfileNumber(guest.id, guest.profileNumber)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Status</dt>
                    <dd className="font-medium capitalize text-emerald-700">{guest.guestStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">VIP Status</dt>
                    <dd className="font-medium text-[#251605]">
                      {guest.vipStatus ? "👑 VIP" : "Standard"}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Primary Contact */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Primary Contact
                </h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5 text-[#7A6B58]" />
                    <span className="font-medium text-[#251605]">{guest.phone || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 text-[#7A6B58]" />
                    <span className="font-medium text-[#251605]">{guest.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-[#7A6B58]" />
                    <span className="font-medium text-[#251605]">{guest.nationality || "—"}</span>
                  </div>
                </div>
              </section>

              {/* Stay Snapshot */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Stay Snapshot
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[#7A6B58]">Last Stay</dt>
                    <dd className="font-medium text-[#251605]">
                      {lastStayDate ? date(lastStayDate) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Upcoming</dt>
                    <dd className="font-medium text-[#251605]">
                      {nextStay ? `${date(nextStay.arrivalDate)} (${nextStay.nights}n)` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Total Stays</dt>
                    <dd className="font-medium text-[#251605]">{totalStaysCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Total Nights</dt>
                    <dd className="font-medium text-[#251605]">{totalNightsCount}</dd>
                  </div>
                </dl>
              </section>

              {/* Key Preferences */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                    Key Preferences
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab("preferences")}
                    className="text-xs font-medium text-[#8C6D23] hover:underline"
                  >
                    View all
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[#7A6B58]">Room Type</dt>
                    <dd className="font-medium text-[#251605]">
                      {preferences?.roomPreference || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Floor</dt>
                    <dd className="font-medium text-[#251605]">
                      {preferences?.floorPreference || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Bed Type</dt>
                    <dd className="font-medium text-[#251605]">
                      {preferences?.bedPreference || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#7A6B58]">Smoking</dt>
                    <dd className="font-medium text-[#251605]">
                      {preferences?.smokingAllowed ? "Smoking" : "Non-smoking"}
                    </dd>
                  </div>
                </div>
              </section>

              {/* Identity Status */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Identity Status
                </h3>
                {primaryDoc ? (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Shield className="size-3.5 text-[#8C6D23]" />
                      <span className="font-medium capitalize text-[#251605]">
                        {primaryDoc.kind || "Document"}
                      </span>
                      {primaryDoc.verificationStatus === "verified" ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="size-2.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                          {primaryDoc.verificationStatus}
                        </span>
                      )}
                    </div>
                    <span className="text-[#7A6B58]">
                      Expires {primaryDoc.expiryDate ? date(primaryDoc.expiryDate) : "—"}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#7A6B58]">No identity document recorded.</p>
                )}
              </section>

              {/* Relationships */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                  Relationships
                </h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#7A6B58]">Company</span>
                    <span className="font-medium text-[#251605]">
                      {companyLink?.masterName || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7A6B58]">Travel Agency</span>
                    <span className="font-medium text-[#251605]">
                      {travelAgentLink?.masterName || "—"}
                    </span>
                  </div>
                  {groupLink ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[#7A6B58]">Group</span>
                      <span className="font-medium text-[#251605]">{groupLink.masterName}</span>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : tab === "preferences" ? (
            <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                Preferences Detail
              </h3>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Room Type</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.roomPreference || "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Bed Preference</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.bedPreference || "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Floor</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.floorPreference || "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">View</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.viewPreference || "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Food & Dining</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.foodPreference || "—"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Smoking</dt>
                  <dd className="font-medium text-[#251605]">
                    {preferences?.smokingAllowed ? "Smoking" : "Non-smoking"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[#F0ECE3] pb-2">
                  <dt className="text-[#7A6B58]">Preferred Channel</dt>
                  <dd className="font-medium capitalize text-[#251605]">
                    {preferences?.communicationPreference || "—"}
                  </dd>
                </div>
                <div className="pt-1">
                  <dt className="text-[#7A6B58]">Special Requests</dt>
                  <dd className="mt-1 font-medium text-[#251605]">
                    {preferences?.specialRequests || "No special requests on file."}
                  </dd>
                </div>
              </dl>
            </div>
          ) : tab === "identity" ? (
            <div className="space-y-3">
              {docs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E8E4DC] p-6 text-center text-xs text-[#7A6B58]">
                  No identity documents uploaded yet.
                </div>
              ) : (
                docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize text-[#251605]">{doc.kind}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          doc.verificationStatus === "verified"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-neutral-100 text-neutral-600",
                        )}
                      >
                        {doc.verificationStatus}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[#7A6B58]">
                      <div>
                        Document No:{" "}
                        <span className="font-mono text-[#251605]">
                          {doc.documentNumber || "—"}
                        </span>
                      </div>
                      <div>
                        Issuing Country:{" "}
                        <span className="text-[#251605]">{doc.issuingCountry || "—"}</span>
                      </div>
                      <div>
                        Expiry:{" "}
                        <span className="text-[#251605]">
                          {doc.expiryDate ? date(doc.expiryDate) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {links.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E8E4DC] p-6 text-center text-xs text-[#7A6B58]">
                  No company, agency or group associations linked to this guest.
                </div>
              ) : (
                links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#251605]">{link.masterName}</div>
                      <div className="text-[11px] capitalize text-[#7A6B58]">
                        {link.masterType.replace("_", " ")} · {link.role}
                      </div>
                    </div>
                    <span className="text-[11px] text-[#7A6B58]">
                      Linked {date(link.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-[#E8E4DC] bg-[#FFFFFF] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={openFullProfile}
              className="flex-1 bg-[#C89933] font-semibold text-white hover:bg-[#B38728]"
              data-testid="guest-quick-view-open-full"
            >
              <ExternalLink className="mr-1.5 size-3.5" />
              Open Full Profile
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewReservation}
              className="border-[#D6D0C4] text-[#251605] hover:bg-[#FAF8F5]"
              data-testid="guest-quick-view-new-res"
            >
              <PlusCircle className="mr-1.5 size-3.5" />
              New Reservation
            </Button>
            {onEditGuest && previewId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onEditGuest(previewId)}
                className="border-[#D6D0C4] text-[#251605] hover:bg-[#FAF8F5]"
                data-testid="guest-quick-view-edit"
              >
                Edit Guest
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
