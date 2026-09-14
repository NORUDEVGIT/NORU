import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { ReadinessChip, Set1SectionView } from "@/packages/pms/components/settings/pms-set1-section";
import { Set2OutletsSection, Set2RoomsSection, Set2StructureSection } from "@/packages/pms/components/settings/pms-set2-section";
import { Set3GuestSection, Set3RatesSection } from "@/packages/pms/components/settings/pms-set3-section";
import { Set4HousekeepingSection, Set4MaintenanceSection, Set4RoomInventorySection } from "@/packages/pms/components/settings/pms-set4-section";
import {
  Set5DepartmentsSection,
  Set5GuestServicesSection,
  Set5IntegrationsSection,
  Set5NotificationsSection,
  Set5SecuritySection,
} from "@/packages/pms/components/settings/pms-set5-section";
import {
  Set6DistributionSection,
  Set6OfflineSyncSection,
  Set6ReportsSection,
  Set6SalesEventsSection,
} from "@/packages/pms/components/settings/pms-set6-section";
import { getPmsSet1Foundation, listPmsSet1Audit } from "@/packages/pms/lib/pms-set1-foundation.functions";
import {
  SET1_COMING_SOON,
  SET1_DENIED,
  SET1_FOUNDATION_CHIP,
  SET1_HUB_HREF,
  SET1_LIVE_CARDS,
  SET1_PMS_BACK_HREF,
  SET1_TITLE,
  SET2_LIVE_HASHES,
  SET3_LIVE_HASHES,
  SET4_LIVE_HASHES,
  SET5_LIVE_HASHES,
  SET6_LIVE_HASHES,
  POLISH1_LIVE_HASHES,
  canOpenSet1Hub,
  resolveSet1SectionHash,
  type Set1SectionId,
} from "@/packages/pms/lib/pms-set1-foundation";
import { emptySet2Snapshot } from "@/packages/pms/lib/pms-set2-structure";
import { emptySet3Snapshot } from "@/packages/pms/lib/pms-set3-rates-guest";
import { emptySet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory";
import { emptySet5Snapshot } from "@/packages/pms/lib/pms-set5-depts-guestsvc";
import { emptySet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution";
import { emptyPolish1Snapshot } from "@/packages/pms/lib/pms-polish1-payment-admin";
import { Polish1AdministrationSection, Polish1PaymentMethodsSection } from "@/packages/pms/components/settings/pms-polish1-section";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

function currentSection(): Set1SectionId | null {
  if (typeof window === "undefined") return null;
  return resolveSet1SectionHash(window.location.hash);
}

export function PmsSet1Hub({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const load = useServerFn(getPmsSet1Foundation);
  const loadAudit = useServerFn(listPmsSet1Audit);
  const [section, setSection] = useState<Set1SectionId | null>(currentSection);
  const [showAllChanges, setShowAllChanges] = useState(false);

  useEffect(() => {
    const apply = () => {
      const raw = window.location.hash.replace(/^#/, "");
      const resolved = resolveSet1SectionHash(raw);
      if (resolved && resolved !== raw) {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${resolved}`);
      }
      setSection(currentSection());
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const query = useQuery({
    queryKey: ["pms-set1-foundation", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });
  const auditQuery = useQuery({
    queryKey: ["pms-set1-audit", restaurantId],
    queryFn: () => loadAudit({ data: { restaurantId } }),
    retry: false,
    enabled: canOpenSet1Hub(membership.role),
  });

  if (!canOpenSet1Hub(membership.role)) {
    return <PermissionDeniedPanel message={SET1_DENIED} />;
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">{(query.error as Error | undefined)?.message ?? "Settings are unavailable."}</p>;
  }

  const { snapshot, checklist, canEdit, role, set2, set3, set4, set5, set6, polish1 } = query.data;

  return (
    <div className="space-y-6" data-testid="pms-set1-hub">
      <div>
        <Link
          to={SET1_PMS_BACK_HREF as "/restaurant/pms"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> PMS modules
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl text-[#251605]">{SET1_TITLE}</h1>
          <span className="rounded-full border border-[#C89933]/50 px-2.5 py-0.5 text-xs font-medium text-[#251605]">
            {SET1_FOUNDATION_CHIP}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity, times, taxes, structure, rooms, outlets, rates, guest rules, housekeeping, room inventory, maintenance, departments, guest services types, notifications, payment methods, administration, integrations, security, sales, distribution, reports and offline posture for {membership.restaurant.name}.
        </p>
      </div>

      {section ? (
        <div className="space-y-4">
          <Button variant="outline" size="sm" asChild>
            <a href={SET1_HUB_HREF}>Back to Settings</a>
          </Button>
          {(SET2_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "structure" ? (
              <Set2StructureSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "rooms" ? (
              <Set2RoomsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set2OutletsSection
                restaurantId={restaurantId}
                snapshot={set2 ?? emptySet2Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET3_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "rates" ? (
              <Set3RatesSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set3GuestSection
                restaurantId={restaurantId}
                snapshot={set3 ?? emptySet3Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET4_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "housekeeping-rules" ? (
              <Set4HousekeepingSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "room-inventory-rules" ? (
              <Set4RoomInventorySection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set4MaintenanceSection
                restaurantId={restaurantId}
                snapshot={set4 ?? emptySet4Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (POLISH1_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "payment-methods" ? (
              <Polish1PaymentMethodsSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Polish1AdministrationSection
                restaurantId={restaurantId}
                snapshot={polish1 ?? emptyPolish1Snapshot()}
                set5={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET5_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "departments" ? (
              <Set5DepartmentsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "guest-services-types" ? (
              <Set5GuestServicesSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "notifications" ? (
              <Set5NotificationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "integrations" ? (
              <Set5IntegrationsSection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set5SecuritySection
                restaurantId={restaurantId}
                snapshot={set5 ?? emptySet5Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (SET6_LIVE_HASHES as readonly string[]).includes(section) ? (
            section === "sales-events" ? (
              <Set6SalesEventsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "distribution" ? (
              <Set6DistributionSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : section === "reports" ? (
              <Set6ReportsSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            ) : (
              <Set6OfflineSyncSection
                restaurantId={restaurantId}
                snapshot={set6 ?? emptySet6Snapshot()}
                checklist={checklist}
                canEdit={canEdit}
              />
            )
          ) : (
            <Set1SectionView
              section={section}
              restaurantId={restaurantId}
              role={role}
              snapshot={snapshot}
              checklist={checklist}
              canEdit={canEdit}
            />
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SET1_LIVE_CARDS.map((card) => {
              const domain = checklist.domains[card.id];
              return (
                <article key={card.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-lg text-[#251605]">{card.title}</h2>
                    <ReadinessChip readiness={domain.readiness} />
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{card.purpose}</p>
                  <a
                    href={`${SET1_HUB_HREF}#${card.id}`}
                    className="mt-4 inline-flex text-sm font-medium text-[#C89933]"
                  >
                    Configure
                  </a>
                </article>
              );
            })}
            {SET1_COMING_SOON.map((card) => (
              <article
                key={`${card.wave}-${card.title}`}
                className="rounded-2xl border border-dashed border-[#CCCCCC] bg-muted/20 p-5"
                data-testid="set1-coming-soon-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-lg text-muted-foreground">{card.title}</h2>
                  <span className="rounded-full border border-[#CCCCCC] px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {card.wave} · Coming soon
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{card.purpose}</p>
              </article>
            ))}
          </div>

          {auditQuery.data && auditQuery.data.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg text-[#251605]">Recent changes</h2>
                <Button variant="outline" size="sm" onClick={() => setShowAllChanges((open) => !open)}>
                  {showAllChanges ? "Hide" : "Show all"}
                </Button>
              </div>
              {showAllChanges ? (
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {auditQuery.data.map((row) => (
                    <li key={row.id}>
                      {row.action.replaceAll("_", " ")}
                      {row.section ? ` · ${row.section}` : ""} · {new Date(row.createdAt).toLocaleString("en-GB")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {auditQuery.data.length} change{auditQuery.data.length === 1 ? "" : "s"} across all Settings categories.
                </p>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
