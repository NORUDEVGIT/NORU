
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { GuestCompanyOverviewView } from "@/packages/pms/components/guests/guest-company-overview-view";
import { GuestCompanyTravelers } from "@/packages/pms/components/guests/guest-company-travelers";
import { GuestCompanyCreateModal } from "@/packages/pms/components/guests/guest-company-create-modal";
import { getCompanyDetailWorkspace } from "@/packages/pms/lib/guest-company-detail.functions";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { Button } from "@/shared/components/ui/button";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function GuestCompanyDetailWorkspace({
  membership,
  companyId,
}: {
  membership?: RestaurantMembership | undefined;
  companyId: string;
  nav?: string | undefined;
}) {
  const restaurantId = membership?.restaurant?.id ?? "";
  const [editOpen, setEditOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "travelers">(
    "overview",
  );

  const load = useServerFn(getCompanyDetailWorkspace);
  const fetchAccount = useServerFn(getGuestAccount);

  const query = useQuery({
    queryKey: ["company-detail", restaurantId, companyId],
    queryFn: () => load({ data: { restaurantId, companyId } }),
    enabled: Boolean(restaurantId && companyId),
    retry: false,
  });

  const accountQuery = useQuery({
    queryKey: ["guest-account", restaurantId, companyId],
    queryFn: () =>
      fetchAccount({
        data: { restaurantId, accountId: companyId },
      }),
    enabled: editOpen && Boolean(restaurantId && companyId),
    retry: false,
  });

  if (!membership?.restaurant || query.isPending || query.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading company…</p>
    );
  }

  if (query.error || !query.data) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border p-6"
        data-testid="company-detail-missing"
      >
        <h1 className="font-display text-2xl">Company not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(query.error as Error | undefined)?.message ??
            "This company is not available in the current property."}
        </p>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="space-y-5" data-testid="company-detail-workspace">
      {/* Company name and Edit button */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e9dfd0] bg-white px-5 py-4">
        <h1 className="min-w-0 truncate font-brand text-2xl font-bold tracking-tight text-[#4a2c1a]">
          {data.company.name}
        </h1>

        <Button
  size="sm"
  className="shrink-0 bg-[#c9a24a] font-semibold text-[#4a2c1a] hover:bg-[#b58d35]"
  onClick={() => setEditOpen(true)}
  data-testid="edit-company-button"
>
  Edit
</Button>
      </header>

      {/* Only two sections: Overview and Linked Travelers */}
      <nav
        aria-label="Company sections"
        className="flex gap-6 border-b border-[#e9dfd0]"
        role="tablist"
        data-testid="company-detail-nav"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "overview"}
          onClick={() => setActiveSection("overview")}
          data-testid="company-nav-overview"
          className={`border-b-2 px-2 py-3 text-sm transition-colors ${
            activeSection === "overview"
              ? "border-[#c9a24a] font-bold text-[#4a2c1a]"
              : "border-transparent text-muted-foreground hover:text-[#4a2c1a]"
          }`}
        >
          Overview
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "travelers"}
          onClick={() => setActiveSection("travelers")}
          data-testid="company-nav-travelers"
          className={`border-b-2 px-2 py-3 text-sm transition-colors ${
            activeSection === "travelers"
              ? "border-[#c9a24a] font-bold text-[#4a2c1a]"
              : "border-transparent text-muted-foreground hover:text-[#4a2c1a]"
          }`}
        >
          Linked Travelers
        </button>
      </nav>

      {/* Overview content */}
      {activeSection === "overview" && (
        <GuestCompanyOverviewView
          restaurantId={restaurantId}
          companyId={companyId}
          data={data}
          onNavigate={(target) => {
            if (
              String(target).includes("traveler") ||
              String(target).includes("link")
            ) {
              setActiveSection("travelers");
            }
          }}
          onEdit={() => setEditOpen(true)}
        />
      )}

      {/* Linked travelers and guest-linking workspace */}
      {activeSection === "travelers" && (
        <GuestCompanyTravelers
          restaurantId={restaurantId}
          companyId={companyId}
          initialLinkOpen={false}
        />
      )}

      {/* Edit company dialog */}
      <GuestCompanyCreateModal
        restaurantId={restaurantId}
        open={editOpen}
        mode="edit"
        companyId={companyId}
        company={accountQuery.data}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          void query.refetch();
          void accountQuery.refetch();
        }}
      />
    </div>
  );
}
