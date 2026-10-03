import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  CalendarPlus,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { getGuestAccount, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import { listTravelAgentContacts, listTravelAgentCommissionPlans } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { TA_BILLING_COPY } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

export type TravelAgentQuickViewTab = "overview" | "contacts" | "travelers" | "commercial";

export function GuestTravelAgentQuickViewDrawer({
  restaurantId,
  agencyId,
  onClose,
  onEditAgency,
}: {
  restaurantId: string;
  agencyId: string | null | undefined;
  onClose: () => void;
  onEditAgency?: (agencyId: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TravelAgentQuickViewTab>("overview");
  const isOpen = Boolean(agencyId);

  const fetchAccount = useServerFn(getGuestAccount);
  const fetchContacts = useServerFn(listTravelAgentContacts);
  const fetchLinks = useServerFn(listGuestAccountLinks);
  const fetchPlans = useServerFn(listTravelAgentCommissionPlans);

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, agencyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: agencyId! } }),
    enabled: Boolean(agencyId),
    staleTime: 30_000,
  });

  const contactsQuery = useQuery({
    queryKey: ["travel-agent-contacts", restaurantId, agencyId, "quick-view"],
    queryFn: () => fetchContacts({ data: { restaurantId, agencyId: agencyId!, limit: 10, offset: 0 } }),
    enabled: Boolean(agencyId) && (tab === "contacts" || tab === "overview"),
    staleTime: 30_000,
  });

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, agencyId],
    queryFn: () => fetchLinks({ data: { restaurantId, accountId: agencyId! } }),
    enabled: Boolean(agencyId) && (tab === "travelers" || tab === "overview"),
    staleTime: 30_000,
  });

  const plansQuery = useQuery({
    queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
    queryFn: () => fetchPlans({ data: { restaurantId, agencyId: agencyId! } }),
    enabled: Boolean(agencyId) && (tab === "commercial" || tab === "overview"),
    staleTime: 30_000,
  });

  const agency = accountQuery.data;
  const activePlan = plansQuery.data?.items.find((p) => p.active);

  function handleOpenFullProfile() {
    if (!agencyId) return;
    onClose();
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: agencyId },
      search: guestProfileSearch({ type: "travel-agent", nav: "overview" }),
    });
  }

  function handleCreateReservation() {
    if (!agencyId) return;
    onClose();
    void navigate({
      to: "/restaurant/pms/reservations",
      search: { create: "new", travelAgentId: agencyId },
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[#DDD4C5] bg-[#FCFBF9] p-0 sm:max-w-md md:max-w-lg"
        data-testid="travel-agent-quick-view-drawer"
      >
        <SheetHeader className="border-b border-[#DDD4C5] bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#F4E9D0] font-display text-lg font-bold text-[#8A641A] ring-2 ring-[#E5DECE]">
                {agency?.name ? agency.name.slice(0, 1).toUpperCase() : <Building2 className="size-5" />}
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate font-display text-xl font-bold text-[#251605]">
                  {accountQuery.isLoading ? <Skeleton className="h-6 w-40" /> : agency?.name ?? "Travel Agency"}
                </SheetTitle>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#756A5B]">
                  {agency?.accountStatus === "active" ? (
                    <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2 py-0.5 text-[11px] font-medium text-[#2E7D32]">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] font-medium text-[#616161]">
                      Inactive
                    </span>
                  )}
                  {agency?.agencyType ? (
                    <span className="inline-flex items-center rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[11px] font-medium text-[#8A641A] uppercase">
                      {agency.agencyType}
                    </span>
                  ) : null}
                  {agency?.code ? (
                    <span className="font-mono font-medium text-[#8A641A]">
                      {agency.code}
                    </span>
                  ) : null}
                  {agency?.iataLicenseNumber ? (
                    <span className="inline-flex items-center gap-1 rounded bg-[#FAF8F5] border border-[#DDD4C5] px-1.5 py-0.5 text-[10px] font-mono text-[#52483E]">
                      IATA {agency.iataLicenseNumber}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-[#756A5B] hover:bg-[#F7F4EE] hover:text-[#251605]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1 bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
              onClick={handleCreateReservation}
              data-testid="travel-agent-quick-view-new-reservation"
            >
              <CalendarPlus className="mr-1.5 size-3.5" />
              New Booking
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              onClick={handleOpenFullProfile}
              data-testid="travel-agent-quick-view-open-full"
            >
              <ExternalLink className="mr-1.5 size-3.5" />
              Full Workspace
            </Button>
            {onEditAgency && agencyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                onClick={() => onEditAgency(agencyId)}
                data-testid="travel-agent-quick-view-edit"
              >
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            )}
          </div>

          {/* Tab Navigation */}
          <nav className="mt-3 flex gap-2 border-t border-[#F0EAE1] pt-2 text-xs" aria-label="Quick View Tabs">
            {[
              { id: "overview", label: "Overview" },
              { id: "contacts", label: "Contacts" },
              { id: "travelers", label: "Travelers" },
              { id: "commercial", label: "Commercial" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as TravelAgentQuickViewTab)}
                data-testid={`travel-agent-quick-tab-${item.id}`}
                className={cn(
                  "px-2 py-1 font-medium transition-colors border-b-2 text-xs",
                  tab === item.id
                    ? "border-[#8A641A] text-[#251605]"
                    : "border-transparent text-[#756A5B] hover:text-[#251605]",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </SheetHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {accountQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : !agency ? (
            <p className="text-sm text-[#8C827A] italic">Agency details unavailable.</p>
          ) : (
            <>
              {tab === "overview" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-2.5 text-xs">
                    <h3 className="font-display text-sm font-bold text-[#251605] mb-2">Agency Overview</h3>
                    {agency.primaryContactName && (
                      <div className="flex items-center gap-2 text-[#251605]">
                        <Users className="size-3.5 text-[#8A641A]" />
                        <span className="font-medium">{agency.primaryContactName}</span>
                        <span className="text-[#8C827A] text-[11px]">(Primary Contact)</span>
                      </div>
                    )}
                    {agency.phone && (
                      <div className="flex items-center gap-2 text-[#251605]">
                        <Phone className="size-3.5 text-[#8A641A]" />
                        <span>{agency.phone}</span>
                      </div>
                    )}
                    {agency.email && (
                      <div className="flex items-center gap-2 text-[#251605]">
                        <Mail className="size-3.5 text-[#8A641A]" />
                        <span>{agency.email}</span>
                      </div>
                    )}
                    {(agency.addressLine1 || agency.city) && (
                      <div className="flex items-center gap-2 text-[#756A5B]">
                        <MapPin className="size-3.5 text-[#8A641A]" />
                        <span>{[agency.addressLine1, agency.city, agency.country].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {agency.website && (
                      <div className="flex items-center gap-2 text-[#756A5B]">
                        <Globe className="size-3.5 text-[#8A641A]" />
                        <span className="truncate">{agency.website}</span>
                      </div>
                    )}
                  </div>

                  {agency.notes && (
                    <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm text-xs">
                      <h4 className="font-semibold text-[#251605] mb-1">Notes</h4>
                      <p className="whitespace-pre-wrap text-[#756A5B]">{agency.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {tab === "contacts" && (
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-bold text-[#251605]">Agency Contacts</h3>
                  {contactsQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : !contactsQuery.data?.items.length ? (
                    <p className="text-xs text-[#8C827A] italic">No agency contacts registered.</p>
                  ) : (
                    <div className="space-y-2">
                      {contactsQuery.data.items.map((c) => (
                        <div key={c.id} className="rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#251605]">{c.name}</span>
                            {c.isPrimary && (
                              <span className="rounded-full bg-[#E8F5E9] px-2 py-0.5 text-[10px] font-medium text-[#2E7D32]">
                                Primary
                              </span>
                            )}
                          </div>
                          {c.position && <p className="text-[#756A5B]">{c.position}</p>}
                          {c.email && <p className="text-[#756A5B] mt-1">{c.email}</p>}
                          {c.phone && <p className="text-[#756A5B]">{c.phone}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "travelers" && (
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-bold text-[#251605]">Linked Travelers</h3>
                  {linksQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : !linksQuery.data?.length ? (
                    <p className="text-xs text-[#8C827A] italic">No travelers linked to this travel agency.</p>
                  ) : (
                    <div className="space-y-2">
                      {linksQuery.data.map((l) => (
                        <div key={l.id} className="rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs shadow-sm flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-[#251605]">{l.guestName}</span>
                            <p className="text-[#756A5B] text-[11px]">{l.role.replaceAll("_", " ")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "commercial" && (
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-bold text-[#251605]">Commercial Summary</h3>
                  <div className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3 text-xs">
                    <div>
                      <span className="text-[#756A5B]">Active Commission Plan:</span>
                      <p className="font-semibold text-[#251605]">
                        {activePlan
                          ? `${activePlan.commissionType === "percent" ? `${activePlan.rateValue}%` : `${activePlan.rateValue} ${activePlan.currency}`} · Effective ${activePlan.effectiveOn}`
                          : "No commission plan configured"}
                      </p>
                    </div>
                    {agency.paymentTerms && (
                      <div>
                        <span className="text-[#756A5B]">Payment Terms:</span>
                        <p className="font-semibold text-[#251605]">{agency.paymentTerms}</p>
                      </div>
                    )}
                    {agency.creditLimitNote && (
                      <div>
                        <span className="text-[#756A5B]">Credit Terms:</span>
                        <p className="text-[#251605]">{agency.creditLimitNote}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-[#756A5B]">Booking Access:</span>
                      <p className="font-semibold text-[#251605] capitalize">
                        {agency.bookingAccess ?? "Open"}
                      </p>
                    </div>
                    {agency.preferredCurrency && (
                      <div>
                        <span className="text-[#756A5B]">Preferred Currency:</span>
                        <p className="font-semibold text-[#251605]">{agency.preferredCurrency}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3 text-[11px] text-amber-900">
                    <p>{TA_BILLING_COPY}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
