import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestCompanyHeader } from "@/packages/pms/components/guests/guest-company-header";
import { GuestCompanyOverview } from "@/packages/pms/components/guests/guest-company-overview";
import { GuestCompanyCorporate } from "@/packages/pms/components/guests/guest-company-corporate";
import { GuestCompanyContacts } from "@/packages/pms/components/guests/guest-company-contacts";
import { GuestCompanyTravelers } from "@/packages/pms/components/guests/guest-company-travelers";
import { GuestCompanyContracts } from "@/packages/pms/components/guests/guest-company-contracts";
import { GuestCompanyReservations } from "@/packages/pms/components/guests/guest-company-reservations";
import { GuestCompanyNotes } from "@/packages/pms/components/guests/guest-company-notes";
import { GuestCompanyDocuments } from "@/packages/pms/components/guests/guest-company-documents";
import { GuestCompanyBilling } from "@/packages/pms/components/guests/guest-company-billing";
import { GuestCompanyFormDialog } from "@/packages/pms/components/guests/guest-company-form-dialog";
import { GuestActivityHubCard } from "@/packages/pms/components/guests/guest-activity-hub-card";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type CompanyDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";
import {
  COMPANY_TA_SETTINGS_COMING,
  companyDetailNav,
  visibleCompanyNav,
} from "@/packages/pms/lib/guest-company-detail-workspace";
import { getCompanyDetailWorkspace } from "@/packages/pms/lib/guest-company-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
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
  const navId = companyDetailNav(navProp);
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

  function selectNav(next: CompanyDetailNavId) {
    void navigate({
      to: GUEST_PROFILE_DETAIL_PATH,
      params: { guestId: companyId },
      search: guestProfileSearch({ nav: next, type: "company" }),
    });
  }

  if (query.isLoading) {
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
  const tabs = visibleCompanyNav({
    creditAccountAllowed: Boolean(data.businessType?.creditAccountAllowed),
    travelAgency: data.travelAgency,
  });
  const canWriteContracts = membership.role === "owner" || membership.role === "manager";
  const canManageRes =
    membership.role === "owner" || membership.role === "manager" || membership.role === "receptionist";

  return (
    <div className="space-y-6" data-testid="company-detail-workspace">
      <GuestCompanyHeader
        restaurantId={restaurantId}
        company={data.company}
        businessType={data.businessType}
        settingsEnabled={data.settingsEnabled}
        onEdit={() => setEditOpen(true)}
      />
      <nav
        aria-label="Company sections"
        className="flex w-full gap-1 overflow-x-auto border-b border-border pb-px"
        role="tablist"
        data-testid="company-detail-nav"
      >
        {tabs.map((item) => {
          const active = item.id === navId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`company-nav-${item.id}`}
              onClick={() => selectNav(item.id)}
              className={cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.title}
            </button>
          );
        })}
      </nav>

      {navId === "overview" ? (
        <GuestCompanyOverview
          restaurantId={restaurantId}
          companyId={companyId}
          data={data}
          onNavigate={selectNav}
          onEdit={() => setEditOpen(true)}
        />
      ) : navId === "corporate" ? (
        <GuestCompanyCorporate
          restaurantId={restaurantId}
          companyId={companyId}
          onOpenEditDialog={() => setEditOpen(true)}
        />
      ) : navId === "contacts" ? (
        <GuestCompanyContacts
          restaurantId={restaurantId}
          companyId={companyId}
          companyName={data.company.name}
          contactRequired={Boolean(data.businessType?.contactRequired)}
          onEditCompany={() => setEditOpen(true)}
        />
      ) : navId === "travelers" ? (
        <GuestCompanyTravelers restaurantId={restaurantId} companyId={companyId} />
      ) : navId === "contracts" ? (
        <GuestCompanyContracts restaurantId={restaurantId} companyId={companyId} canWrite={canWriteContracts} />
      ) : navId === "reservations" ? (
        <GuestCompanyReservations restaurantId={restaurantId} companyId={companyId} canManage={canManageRes} />
      ) : navId === "notes" ? (
        <GuestCompanyNotes restaurantId={restaurantId} companyId={companyId} />
      ) : navId === "history" ? (
        <GuestActivityHubCard
          restaurantId={restaurantId}
          accountId={companyId}
          partyName={data.company.name}
          showFilters
        />
      ) : navId === "documents" ? (
        <GuestCompanyDocuments restaurantId={restaurantId} companyId={companyId} />
      ) : navId === "credit" ? (
        <GuestCompanyBilling restaurantId={restaurantId} companyId={companyId} />
      ) : navId === "travel-agent-settings" ? (
        <ComingBlock title="Travel Agent Settings" copy={COMPANY_TA_SETTINGS_COMING} />
      ) : (
        <GuestCompanyOverview
          restaurantId={restaurantId}
          companyId={companyId}
          data={data}
          onNavigate={selectNav}
          onEdit={() => setEditOpen(true)}
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

function ComingBlock({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="company-coming">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
