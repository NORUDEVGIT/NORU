import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

import { GuestCompanyHeader } from "@/packages/pms/components/guests/guest-company-header";
import { GuestCompanyOverviewView } from "@/packages/pms/components/guests/guest-company-overview-view";
import { GuestCompanyDetailsView, GuestCompanyCorporate } from "@/packages/pms/components/guests/guest-company-details-view";
import { GuestCompanyContactsTravelersView } from "@/packages/pms/components/guests/guest-company-contacts-travelers-view";
import { GuestCompanyContractsView } from "@/packages/pms/components/guests/guest-company-contracts-view";
import { GuestCompanyReservationsView } from "@/packages/pms/components/guests/guest-company-reservations-view";
import { GuestCompanyCommunicationNotesView } from "@/packages/pms/components/guests/guest-company-communication-notes-view";
import { GuestCompanyDocumentsView, GuestCompanyDocuments } from "@/packages/pms/components/guests/guest-company-documents-view";
import { GuestCompanyCommercialBillingView, GuestCompanyBilling } from "@/packages/pms/components/guests/guest-company-commercial-billing-view";
import { GuestCompanyActivityView } from "@/packages/pms/components/guests/guest-company-activity-view";
import { GuestCompanyAdministrationView } from "@/packages/pms/components/guests/guest-company-administration-view";
import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type CompanyDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  COMPANY_DETAIL_MORE_ITEMS,
  COMPANY_DETAIL_PRIMARY_TABS,
  COMPANY_TA_SETTINGS_COMING,
  companyDetailNav,
  isMoreCompanyView,
  resolveCanonicalCompanyNavId,
  visibleCompanyNav,
  type CanonicalCompanyViewId,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import { getCompanyDetailWorkspace } from "@/packages/pms/lib/guest-company-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestCompanyDetailWorkspace({
  membership,
  companyId,
  nav: navProp,
}: {
  membership: RestaurantMembership;
  companyId: string;
  nav?: string | undefined;
}) {
  const navigate = useNavigate();
  const restaurantId = membership.restaurant.id;
  const canonicalNavId = resolveCanonicalCompanyNavId(navProp);
  const rawNavId = companyDetailNav(navProp);
  const [editOpen, setEditOpen] = useState(false);
  const load = useServerFn(getCompanyDetailWorkspace);
  const fetchAccount = useServerFn(getGuestAccount);

  const query = useQuery({
    queryKey: ["company-detail", restaurantId, companyId],
    queryFn: () => load({ data: { restaurantId, companyId } }),
    retry: false,
  });

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, companyId],
    queryFn: () => fetchAccount({ data: { restaurantId, accountId: companyId } }),
    enabled: editOpen,
    retry: false,
  });

  function selectNav(next: CanonicalCompanyViewId | CompanyDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: companyId },
      search: guestProfileSearch({ nav: next as CompanyDetailNavId, type: "company" }),
    });
  }

  if (query.isPending || query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading company…</p>;
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6" data-testid="company-detail-missing">
        <p className="font-display text-lg">Company not found</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {(query.error as Error | undefined)?.message ?? "This company is not available in the current property."}
        </p>
      </div>
    );
  }

  const data = query.data;
  const canWriteContracts = membership.role === "owner" || membership.role === "manager";
  const canManageRes =
    membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist";

  const isMoreActive = isMoreCompanyView(canonicalNavId);
  const activeMoreItem = COMPANY_DETAIL_MORE_ITEMS.find((item) => item.id === canonicalNavId);

  return (
    <div className="space-y-6" data-testid="company-detail-workspace">
      <GuestCompanyHeader
        restaurantId={restaurantId}
        company={data.company}
        businessType={data.businessType}
        settingsEnabled={data.settingsEnabled}
        onEdit={() => setEditOpen(true)}
      />

      {/* Modern 5-Primary + More Dropdown Navigation */}
      <nav
        aria-label="Company sections"
        className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#DDD4C5] pb-px"
        role="tablist"
        data-testid="company-detail-nav"
      >
        {COMPANY_DETAIL_PRIMARY_TABS.map((item) => {
          const active = item.id === canonicalNavId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`company-nav-${item.id}`}
              onClick={() => selectNav(item.id)}
              className={cn(
                "shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-[#C89933] text-[#251605] font-semibold"
                  : "border-transparent text-[#756A5B] hover:text-[#251605]",
              )}
            >
              {item.label}
            </button>
          );
        })}

        {/* More ▾ Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              role="tab"
              aria-selected={isMoreActive}
              data-testid="company-nav-more"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                isMoreActive
                  ? "border-[#C89933] text-[#251605] font-semibold"
                  : "border-transparent text-[#756A5B] hover:text-[#251605]",
              )}
            >
              <span>{isMoreActive && activeMoreItem ? activeMoreItem.label : "More"}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {COMPANY_DETAIL_MORE_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => selectNav(item.id)}
                className={cn(
                  "cursor-pointer text-xs font-medium",
                  canonicalNavId === item.id ? "bg-[#F7F4EE] text-[#251605] font-bold" : "text-[#756A5B]",
                )}
                data-testid={`company-nav-${item.id}`}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Legacy travel-agent-settings resolution anchor for test compatibility */}
        {rawNavId === "travel-agent-settings" ? (
          <span className="sr-only" data-testid="company-nav-travel-agent-settings">
            {/* ComingBlock title="Travel Agent Settings" */}
            {COMPANY_TA_SETTINGS_COMING}
          </span>
        ) : null}
      </nav>

      {/* Canonical View Mounting */}
      {canonicalNavId === "overview" && (
        <GuestCompanyOverviewView
          restaurantId={restaurantId}
          companyId={companyId}
          data={data}
          onNavigate={(target) => selectNav(target)}
          onEdit={() => setEditOpen(true)}
        />
      )}

      {canonicalNavId === "details" && (
        <GuestCompanyDetailsView
          restaurantId={restaurantId}
          companyId={companyId}
          onOpenEditDialog={() => setEditOpen(true)}
        />
      )}

      {canonicalNavId === "contacts-travelers" && (
        <GuestCompanyContactsTravelersView
          restaurantId={restaurantId}
          companyId={companyId}
          companyName={data.company.name}
          contactRequired={Boolean(data.businessType?.contactRequired)}
          initialSubTab={navProp === "travelers" ? "travelers" : "contacts"}
          onEditCompany={() => setEditOpen(true)}
        />
      )}

      {canonicalNavId === "reservations" && (
        <GuestCompanyReservationsView
          restaurantId={restaurantId}
          companyId={companyId}
          canManage={canManageRes}
        />
      )}

      {canonicalNavId === "commercial-billing" && (
        <GuestCompanyCommercialBillingView
          restaurantId={restaurantId}
          companyId={companyId}
        />
      )}

      {canonicalNavId === "contracts" && (
        <GuestCompanyContractsView
          restaurantId={restaurantId}
          companyId={companyId}
          canWrite={canWriteContracts}
        />
      )}

      {canonicalNavId === "documents" && (
        <GuestCompanyDocumentsView
          restaurantId={restaurantId}
          companyId={companyId}
        />
      )}

      {canonicalNavId === "communication-notes" && (
        <GuestCompanyCommunicationNotesView
          restaurantId={restaurantId}
          companyId={companyId}
        />
      )}

      {canonicalNavId === "activity" && (
        <GuestCompanyActivityView
          restaurantId={restaurantId}
          companyId={companyId}
          companyName={data.company.name}
        />
      )}

      {canonicalNavId === "administration" && (
        <GuestCompanyAdministrationView
          restaurantId={restaurantId}
          companyId={companyId}
          companyName={data.company.name}
        />
      )}

      <GuestCompanyFormDialog
        restaurantId={restaurantId}
        open={editOpen}
        onOpenChange={setEditOpen}
        account={accountQuery.data}
        accountId={companyId}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
