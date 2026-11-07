import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, MoreHorizontal, RefreshCw, Shield, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
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

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "preferences", label: "Preferences" },
  { id: "identity", label: "Identity" },
  { id: "relations", label: "Relations" },
] as const;

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm leading-5">
      <dt className="text-[#7A6B58]">{label}</dt>
      <dd className="max-w-[62%] text-right font-medium text-[#251605]">{value ?? "—"}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">{title}</h2>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </section>
  );
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function verificationLabel(status: string | null | undefined): string {
  if (!status) return "—";
  if (status === "verified") return "Verified";
  if (status === "rejected") return "Rejected";
  return status.replaceAll("_", " ");
}

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

  useEffect(() => {
    setTab("overview");
  }, [previewId]);

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

  const companyLink = links.find((l) => l.masterType === "company");
  const travelAgentLink = links.find((l) => l.masterType === "travel_agent");
  const groupLink = links.find((l) => l.masterType === "group");
  const otherLinks = links.filter(
    (l) => l.masterType !== "company" && l.masterType !== "travel_agent" && l.masterType !== "group",
  );

  const primaryDoc = docs[0];
  const profileNo = previewId ? displayProfileNumber(previewId, guest?.profileNumber) : "—";
  const statusLabel = guest?.guestStatus
    ? guest.guestStatus.charAt(0).toUpperCase() + guest.guestStatus.slice(1)
    : "Active";
  const vipLabel = guest?.vipStatus ? "VIP" : "Standard";

  function openFullProfile() {
    if (!previewId) return;
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
      to: "/restaurant/pms/reservations",
      search: { create: "new", guestId: previewId },
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="guest-quick-view-drawer"
        className="z-[60] flex h-fit max-h-[85vh] w-[min(92vw,820px)] max-w-[820px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[820px] [&>button.absolute]:hidden"
      >
        <header className="relative shrink-0 bg-[#1F140A] px-4 py-2 pr-3 text-[#F3E9D8]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
                <span className="truncate">
                  {guestQuery.isLoading ? (
                    <Skeleton className="inline-block h-4 w-48 bg-white/10" />
                  ) : (
                    <>
                      {profileNo}
                      <span className="text-[#8A7A61]"> · </span>
                      {guest?.fullName ?? "Guest"}
                    </>
                  )}
                </span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                  {statusLabel}
                </span>
                <span
                  className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold"
                  data-testid="guest-quick-view-vip"
                >
                  {vipLabel}
                </span>
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                    aria-label="Guest actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]">
                  <DropdownMenuItem
                    onSelect={openFullProfile}
                    data-testid="guest-quick-view-open-full"
                  >
                    Open Full Profile
                  </DropdownMenuItem>
                  {onEditGuest && previewId ? (
                    <DropdownMenuItem
                      onSelect={() => onEditGuest(previewId)}
                      data-testid="guest-quick-view-edit"
                    >
                      Edit Guest
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={openNewReservation}
                    data-testid="guest-quick-view-new-res"
                  >
                    New Reservation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <DialogTitle className="sr-only">
            {profileNo} · {guest?.fullName ?? "Guest"}
          </DialogTitle>
          <DialogDescription className="sr-only">Guest profile preview</DialogDescription>
        </header>
        <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
        <div className="flex min-h-0 flex-col bg-[#F7F4EE]">
          <nav
            className="shrink-0 overflow-x-auto border-b border-[#E8DFD0] bg-[#FBF7F1]"
            aria-label="Guest sections"
          >
            <ul role="tablist" className="flex min-w-max items-center gap-0.5 px-3">
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(item.id)}
                      data-testid={`guest-quick-view-tab-${item.id}`}
                      className={cn(
                        "relative whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors",
                        "outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                        active
                          ? "text-[#251605] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#C89933]"
                          : "text-[#5C5346] hover:text-[#251605]",
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-h-0 overflow-y-auto p-3">
            {guestQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : !guest ? (
              <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-white p-4 text-center text-sm text-[#7A6B58]">
                Guest details could not be loaded.
              </div>
            ) : tab === "overview" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Card title="Guest Identity">
                  <Fact label="Full Name" value={guest.fullName} />
                  <Fact
                    label="Profile No."
                    value={displayProfileNumber(guest.id, guest.profileNumber)}
                  />
                  <Fact label="Status" value={statusLabel} />
                  <Fact label="VIP Status" value={vipLabel} />
                </Card>
                <Card title="Primary Contact">
                  <Fact label="Phone" value={dash(guest.phone)} />
                  <Fact label="Email" value={dash(guest.email)} />
                  <Fact
                    label="Nationality"
                    value={
                      guest.nationality ? countryNameFromInput(guest.nationality) || guest.nationality : "—"
                    }
                  />
                </Card>
                <Card title="Stay Snapshot">
                  <Fact label="Last Stay" value={lastStayDate ? date(lastStayDate) : "—"} />
                  <Fact
                    label="Upcoming Stay"
                    value={nextStay ? `${date(nextStay.arrivalDate)} (${nextStay.nights}n)` : "—"}
                  />
                  <Fact label="Total Stays" value={totalStaysCount} />
                  <Fact label="Total Nights" value={totalNightsCount} />
                </Card>
                <Card title="Key Preferences">
                  <Fact label="Room Type" value={dash(preferences?.roomPreference)} />
                  <Fact label="Floor" value={dash(preferences?.floorPreference)} />
                  <Fact label="Bed Type" value={dash(preferences?.bedPreference)} />
                  <Fact
                    label="Smoking"
                    value={preferences?.smokingAllowed ? "Smoking" : "Non-smoking"}
                  />
                </Card>
                <Card title="Identity Status">
                  {docsQuery.isLoading ? (
                    <Skeleton className="h-6 w-full" />
                  ) : docsQuery.isError ? (
                    <p className="text-xs text-amber-700">Identity status unavailable</p>
                  ) : primaryDoc ? (
                    <>
                      <Fact
                        label="Document Type"
                        value={primaryDoc.typeName || primaryDoc.kind || "Document"}
                      />
                      <Fact
                        label="Verification Status"
                        value={verificationLabel(primaryDoc.verificationStatus)}
                      />
                      <Fact
                        label="Expiry"
                        value={primaryDoc.expiryDate ? date(primaryDoc.expiryDate) : "—"}
                      />
                    </>
                  ) : hasLegacyDoc ? (
                    <>
                      <Fact
                        label="Document Type"
                        value={guest.idDocumentType?.replaceAll("_", " ") || "Document"}
                      />
                      <Fact label="Verification Status" value="Recorded" />
                      <Fact
                        label="Expiry"
                        value={guest.idDocumentExpiry ? date(guest.idDocumentExpiry) : "—"}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-[#7A6B58]">No identity document recorded.</p>
                  )}
                </Card>
                <Card title="Relationships">
                  {linksQuery.isLoading ? (
                    <Skeleton className="h-6 w-full" />
                  ) : linksQuery.isError ? (
                    <p className="text-xs text-amber-700">Relationships unavailable</p>
                  ) : (
                    <>
                      <Fact label="Company" value={companyLink?.masterName || "—"} />
                      <Fact label="Travel Agency" value={travelAgentLink?.masterName || "—"} />
                      <Fact label="Group" value={groupLink?.masterName || "—"} />
                      {otherLinks.map((link) => (
                        <Fact
                          key={link.id}
                          label={link.masterType.replaceAll("_", " ")}
                          value={link.masterName}
                        />
                      ))}
                    </>
                  )}
                </Card>
              </div>
            ) : tab === "preferences" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Card title="Room">
                  <Fact label="Room Type" value={dash(preferences?.roomPreference)} />
                  <Fact label="Bed Type" value={dash(preferences?.bedPreference)} />
                  <Fact label="Floor" value={dash(preferences?.floorPreference)} />
                  <Fact label="View" value={dash(preferences?.viewPreference)} />
                </Card>
                <Card title="Stay">
                  <Fact
                    label="Smoking"
                    value={preferences?.smokingAllowed ? "Smoking" : "Non-smoking"}
                  />
                  <Fact label="Food & Dining" value={dash(preferences?.foodPreference)} />
                  <Fact
                    label="Preferred Channel"
                    value={dash(preferences?.communicationPreference)}
                  />
                  <Fact
                    label="Special Requests"
                    value={dash(preferences?.specialRequests) === "—"
                      ? "No special requests on file."
                      : preferences?.specialRequests}
                  />
                </Card>
              </div>
            ) : tab === "identity" ? (
              <div className="space-y-2" data-testid="guest-quick-view-identity-content">
                {docsQuery.isLoading ? (
                  <Skeleton className="h-28 w-full rounded-lg" />
                ) : docsQuery.isError ? (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50/50 p-4 text-center"
                    data-testid="guest-quick-view-identity-error"
                  >
                    <AlertCircle className="mx-auto mb-2 size-5 text-red-500" />
                    <p className="text-xs font-semibold text-red-900">
                      Identity information couldn't be loaded.
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
                ) : docs.length > 0 ? (
                  docs.map((doc) => (
                    <Card key={doc.id} title={doc.typeName || doc.kind || "Document"}>
                      {!doc.typeActive ? (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Inactive
                        </p>
                      ) : null}
                      <Fact label="Document Type" value={doc.typeName || doc.kind || "Document"} />
                      <Fact label="Document Number" value={doc.documentNumberMasked || "—"} />
                      <Fact
                        label="Verification"
                        value={
                          <span className="inline-flex items-center gap-1">
                            {doc.verificationStatus === "verified" ? (
                              <CheckCircle2 className="size-3 text-emerald-700" />
                            ) : null}
                            {verificationLabel(doc.verificationStatus)}
                          </span>
                        }
                      />
                      <Fact
                        label="Expiry"
                        value={doc.expiryDate ? date(doc.expiryDate) : "—"}
                      />
                      {doc.issuingCountry ? (
                        <Fact
                          label="Issuing Country"
                          value={countryNameFromInput(doc.issuingCountry)}
                        />
                      ) : null}
                      {doc.issueDate ? (
                        <Fact label="Issued" value={date(doc.issueDate)} />
                      ) : null}
                    </Card>
                  ))
                ) : hasLegacyDoc ? (
                  <Card title={guest.idDocumentType?.replaceAll("_", " ") || "Identity Document"}>
                    <Fact
                      label="Document Type"
                      value={guest.idDocumentType?.replaceAll("_", " ") || "Document"}
                    />
                    <Fact
                      label="Document Number"
                      value={maskedDocumentNumber(guest.idDocumentNumber) || "—"}
                    />
                    <Fact label="Verification" value="Recorded" />
                    <Fact
                      label="Expiry"
                      value={guest.idDocumentExpiry ? date(guest.idDocumentExpiry) : "—"}
                    />
                  </Card>
                ) : (
                  <div
                    className="rounded-lg border border-dashed border-[#DDD4C5] bg-white p-4 text-center text-xs"
                    data-testid="guest-quick-view-identity-empty"
                  >
                    <Shield className="mx-auto mb-2 size-5 text-[#A09383]" />
                    <p className="font-medium text-[#251605]">No identity document recorded.</p>
                    <p className="mt-1 text-[11px] text-[#7A6B58]">
                      No identity documents have been recorded for this guest profile.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {linksQuery.isLoading ? (
                  <Skeleton className="h-16 w-full rounded-lg" />
                ) : linksQuery.isError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-center text-xs text-amber-800">
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
                  <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-white p-4 text-center text-xs text-[#7A6B58]">
                    No company, agency or group associations linked to this guest.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {links.map((link) => (
                      <Card key={link.id} title={link.masterType.replaceAll("_", " ")}>
                        <Fact label="Name" value={link.masterName} />
                        <Fact label="Role" value={link.role} />
                        <Fact label="Linked" value={date(link.createdAt)} />
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
