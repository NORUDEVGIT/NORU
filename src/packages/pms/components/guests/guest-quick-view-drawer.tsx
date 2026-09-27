import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Plus,
  PlusCircle,
  RefreshCw,
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
import { getGuestWorkspaceAccess } from "@/packages/pms/lib/guest-workspace-access.functions";
import { countryNameFromInput } from "@/packages/pms/lib/pms-geography";
import { maskedDocumentNumber } from "@/packages/pms/lib/guest-identity-documents";
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
  const fetchAccess = useServerFn(getGuestWorkspaceAccess);

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

  const accessQuery = useQuery({
    queryKey: ["guest-workspace-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    staleTime: 60_000,
  });

  const guest = guestQuery.data?.guest;
  const preferences = guestQuery.data?.preferences;
  const stays = staysQuery.data?.stays ?? [];
  const links = linksQuery.data ?? [];
  const docs = docsQuery.data?.documents ?? [];
  const canEdit = accessQuery.data?.canEdit ?? false;
  const hasLegacyDoc = Boolean(guest?.idDocumentNumber || guest?.idDocumentType);

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

  function openIdentity() {
    if (!previewId) return;
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: previewId },
      search: guestProfileSearch({
        ...searchParams,
        preview: undefined,
        type: "individual",
        card: "identity",
        nav: "identity",
      }),
    });
  }

  function openNewReservation() {
    if (!previewId) return;
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { create: "new", guestId: previewId },
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
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                    Identity Status
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab("identity")}
                    className="text-xs font-medium text-[#8C6D23] hover:underline"
                  >
                    View identity
                  </button>
                </div>
                {docsQuery.isLoading ? (
                  <Skeleton className="mt-2 h-6 w-full" />
                ) : docsQuery.isError ? (
                  <p className="mt-2 text-xs text-amber-700">Identity status unavailable</p>
                ) : primaryDoc ? (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Shield className="size-3.5 text-[#8C6D23]" />
                      <span className="font-medium capitalize text-[#251605]">
                        {primaryDoc.typeName || primaryDoc.kind || "Document"}
                      </span>
                      {!primaryDoc.typeActive ? (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Inactive
                        </span>
                      ) : null}
                      {primaryDoc.verificationStatus === "verified" ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="size-2.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium capitalize text-neutral-600">
                          {primaryDoc.verificationStatus.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <span className="text-[#7A6B58]">
                      Expires {primaryDoc.expiryDate ? date(primaryDoc.expiryDate) : "—"}
                    </span>
                  </div>
                ) : hasLegacyDoc ? (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Shield className="size-3.5 text-[#8C6D23]" />
                      <span className="font-medium capitalize text-[#251605]">
                        {guest?.idDocumentType?.replace("_", " ") || "Document"}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                        Recorded
                      </span>
                    </div>
                    <span className="text-[#7A6B58]">
                      Expires {guest?.idDocumentExpiry ? date(guest.idDocumentExpiry) : "—"}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#7A6B58]">No identity document recorded.</p>
                )}
              </section>

              {/* Relationships */}
              <section className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A6B58]">
                    Relationships
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab("relations")}
                    className="text-xs font-medium text-[#8C6D23] hover:underline"
                  >
                    View relations
                  </button>
                </div>
                {linksQuery.isLoading ? (
                  <Skeleton className="mt-2 h-6 w-full" />
                ) : linksQuery.isError ? (
                  <p className="mt-2 text-xs text-amber-700">Relationships unavailable</p>
                ) : (
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
                )}
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
            <div className="space-y-3" data-testid="guest-quick-view-identity-content">
              {docsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : docsQuery.isError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center"
                  data-testid="guest-quick-view-identity-error"
                >
                  <AlertCircle className="mx-auto mb-2 size-6 text-red-500" />
                  <p className="text-xs font-semibold text-red-900">
                    Identity information couldn't be loaded.
                  </p>
                  <p className="mt-1 text-[11px] text-red-700">
                    An error occurred while fetching the guest's identity records.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => docsQuery.refetch()}
                    className="mt-3 h-8 border-red-300 text-xs font-medium text-red-800 hover:bg-red-100"
                    data-testid="guest-quick-view-identity-retry"
                  >
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Try Again
                  </Button>
                </div>
              ) : docs.length === 1 ? (
                (() => {
                  const doc = docs[0];
                  if (!doc) return null;
                  return (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-5 shadow-sm">
                        <div className="flex items-center justify-between border-b border-[#F0ECE3] pb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold capitalize text-[#251605]">
                              {doc.typeName || doc.kind}
                            </h3>
                            {!doc.typeActive ? (
                              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Inactive
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                              doc.verificationStatus === "verified"
                                ? "bg-emerald-50 text-emerald-700"
                                : doc.verificationStatus === "rejected"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700",
                            )}
                          >
                            {doc.verificationStatus === "verified" ? (
                              <CheckCircle2 className="size-3" />
                            ) : null}
                            {doc.verificationStatus === "verified"
                              ? "Verified"
                              : doc.verificationStatus === "rejected"
                                ? "Rejected"
                                : "Pending review"}
                          </span>
                        </div>

                        <dl className="mt-4 space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <dt className="text-[#7A6B58]">Document No.</dt>
                            <dd className="font-mono font-medium text-[#251605]">
                              {doc.documentNumberMasked || "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-[#7A6B58]">Status</dt>
                            <dd className="font-medium capitalize text-[#251605]">
                              {doc.verificationStatus === "verified"
                                ? "Verified"
                                : doc.verificationStatus.replace("_", " ")}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-[#7A6B58]">Issuing Country</dt>
                            <dd className="font-medium text-[#251605]">
                              {doc.issuingCountry ? countryNameFromInput(doc.issuingCountry) : "—"}
                            </dd>
                          </div>
                          {doc.issueDate ? (
                            <div className="flex justify-between">
                              <dt className="text-[#7A6B58]">Issued</dt>
                              <dd className="font-medium text-[#251605]">{date(doc.issueDate)}</dd>
                            </div>
                          ) : null}
                          <div className="flex justify-between">
                            <dt className="text-[#7A6B58]">Expires</dt>
                            <dd className="font-medium text-[#251605]">
                              {doc.expiryDate ? date(doc.expiryDate) : "—"}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openIdentity}
                        className="w-full border-[#D8D2C5] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5]"
                        data-testid="guest-quick-view-open-identity"
                      >
                        <ExternalLink className="mr-1.5 size-3.5" />
                        Open Identity & Documents
                      </Button>
                    </div>
                  );
                })()
              ) : docs.length > 1 ? (
                (() => {
                  const primary = docs[0];
                  if (!primary) return null;
                  const others = docs.slice(1);
                  return (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4 shadow-sm">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#7A6B58]">
                          Primary Document
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#251605]">
                              {primary.typeName || primary.kind}
                            </span>
                            {!primary.typeActive ? (
                              <span className="rounded border border-border bg-muted px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                Inactive
                              </span>
                            ) : null}
                            <span className="text-[#7A6B58]">·</span>
                            <span
                              className={cn(
                                "font-medium capitalize",
                                primary.verificationStatus === "verified"
                                  ? "text-emerald-700"
                                  : primary.verificationStatus === "rejected"
                                    ? "text-red-700"
                                    : "text-amber-700",
                              )}
                            >
                              {primary.verificationStatus === "verified"
                                ? "Verified"
                                : primary.verificationStatus.replace("_", " ")}
                            </span>
                            <span className="text-[#7A6B58]">·</span>
                            <span className="text-[#7A6B58]">
                              {primary.expiryDate
                                ? `Expires ${date(primary.expiryDate)}`
                                : "No expiry"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 font-mono text-xs text-[#251605]">
                          {primary.documentNumberMasked || "—"}
                        </div>
                      </div>

                      {others.length > 0 ? (
                        <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-4 shadow-sm">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#7A6B58]">
                            Other Documents
                          </div>
                          <div className="divide-y divide-[#F0ECE3]">
                            {others.map((other) => (
                              <div
                                key={other.id}
                                className="flex items-center justify-between py-2 text-xs"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-[#251605]">
                                    {other.typeName || other.kind}
                                  </span>
                                  {!other.typeActive ? (
                                    <span className="rounded border border-border bg-muted px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Inactive
                                    </span>
                                  ) : null}
                                  <span className="text-[#7A6B58]">·</span>
                                  <span className="capitalize text-[#7A6B58]">
                                    {other.verificationStatus === "verified"
                                      ? "Verified"
                                      : "Not verified"}
                                  </span>
                                </div>
                                <span className="font-mono text-[#7A6B58]">
                                  {other.documentNumberMasked || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openIdentity}
                        className="w-full border-[#D8D2C5] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5]"
                        data-testid="guest-quick-view-open-identity"
                      >
                        <ExternalLink className="mr-1.5 size-3.5" />
                        Open Identity & Documents
                      </Button>
                    </div>
                  );
                })()
              ) : hasLegacyDoc ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#E8E4DC] bg-[#FFFFFF] p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#F0ECE3] pb-3">
                      <h3 className="text-sm font-semibold capitalize text-[#251605]">
                        {guest?.idDocumentType?.replace("_", " ") || "Identity Document"}
                      </h3>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                        Recorded
                      </span>
                    </div>
                    <dl className="mt-4 space-y-2.5 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-[#7A6B58]">Document No.</dt>
                        <dd className="font-mono font-medium text-[#251605]">
                          {maskedDocumentNumber(guest?.idDocumentNumber) || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[#7A6B58]">Status</dt>
                        <dd className="font-medium text-[#251605]">Recorded</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[#7A6B58]">Expires</dt>
                        <dd className="font-medium text-[#251605]">
                          {guest?.idDocumentExpiry ? date(guest.idDocumentExpiry) : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openIdentity}
                    className="w-full border-[#D8D2C5] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5]"
                    data-testid="guest-quick-view-open-identity"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    Open Identity & Documents
                  </Button>
                </div>
              ) : (
                <div
                  className="rounded-xl border border-dashed border-[#E8E4DC] bg-white p-6 text-center text-xs"
                  data-testid="guest-quick-view-identity-empty"
                >
                  <Shield className="mx-auto mb-2 size-6 text-[#A09383]" />
                  <p className="font-medium text-[#251605]">No identity document recorded.</p>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={openIdentity}
                      className="mt-3 border-[#D6D0C4] text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5]"
                      data-testid="guest-quick-view-add-identity"
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Add Identity Document
                    </Button>
                  ) : (
                    <p className="mt-1 text-[11px] text-[#7A6B58]">
                      No identity documents have been recorded for this guest profile.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {linksQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : linksQuery.isError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center text-xs text-amber-800">
                  <p className="font-medium">Unable to load relationship links.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => linksQuery.refetch()}
                    className="mt-2 h-7 border-amber-300 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              ) : links.length === 0 ? (
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
              className="flex-1 bg-[#251605] font-semibold text-white hover:bg-[#3D2C1D] text-xs h-9"
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
              className="border-[#D6D0C4] text-[#251605] hover:bg-[#FAF8F5] text-xs h-9"
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
                className="border-[#D6D0C4] text-[#7A6B58] hover:text-[#251605] hover:bg-[#FAF8F5] text-xs h-9"
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
