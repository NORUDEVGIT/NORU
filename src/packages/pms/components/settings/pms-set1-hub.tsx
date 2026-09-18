import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { Set1SectionView } from "@/packages/pms/components/settings/pms-set1-section";
import { PmsPropertySetupCard1Section } from "@/packages/pms/components/settings/pms-property-setup-card1-section";
import { PmsPropertySetupCard2Section } from "@/packages/pms/components/settings/pms-property-setup-card2-section";
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
  SET1_PMS_BACK_HREF,
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
import { getPmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import {
  CARD1_HASH,
  PROPERTY_SETUP_CARDS,
  evaluateCard1Status,
  evaluateProgrammeCardStatus,
  isCard1WorkspaceHash,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import { CARD2_HASH, isCard2WorkspaceHash } from "@/packages/pms/lib/pms-property-setup-card2";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { cn } from "@/shared/lib/utils";

function currentSection(): Set1SectionId | null {
  if (typeof window === "undefined") return null;
  return resolveSet1SectionHash(window.location.hash);
}

function currentCard1Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard1WorkspaceHash(window.location.hash);
}

function currentCard2Open(): boolean {
  if (typeof window === "undefined") return false;
  return isCard2WorkspaceHash(window.location.hash);
}

export function PmsSet1Hub({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const load = useServerFn(getPmsSet1Foundation);
  const loadCard1 = useServerFn(getPmsPropertySetupCard1);
  const loadAudit = useServerFn(listPmsSet1Audit);
  const [section, setSection] = useState<Set1SectionId | null>(currentSection);
  const [card1Open, setCard1Open] = useState(currentCard1Open);
  const [card2Open, setCard2Open] = useState(currentCard2Open);
  const [showAllChanges, setShowAllChanges] = useState(false);

  useEffect(() => {
    const apply = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (raw === "card-1" || raw === "card1") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD1_HASH}`);
      }
      if (raw === "card-2" || raw === "card2") {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${CARD2_HASH}`);
      }
      const resolved = resolveSet1SectionHash(raw);
      if (resolved && resolved !== raw) {
        window.history.replaceState(null, "", `${SET1_HUB_HREF}#${resolved}`);
      }
      setSection(currentSection());
      setCard1Open(currentCard1Open());
      setCard2Open(currentCard2Open());
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
  const card1Query = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => loadCard1({ data: { restaurantId } }),
    retry: false,
    enabled: canOpenSet1Hub(membership.role),
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
      {card1Open || card2Open ? null : (
      <div>
        <Link
          to={SET1_PMS_BACK_HREF as "/restaurant/pms"}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> PMS modules
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl text-[#251605]">Property Setup</h1>
          <span className="sr-only">{SET1_FOUNDATION_CHIP}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Property Setup for {membership.restaurant.name}. Eight cards. Property & Business and Rooms & Operations are Spec’d in this wave.
        </p>
      </div>
      )}

      {card1Open ? (
        card1Query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Property & Business…</p>
        ) : card1Query.isError || !card1Query.data ? (
          <p className="text-sm text-destructive">{(card1Query.error as Error | undefined)?.message ?? "Card 1 is unavailable."}</p>
        ) : (
          <PmsPropertySetupCard1Section
            restaurantId={restaurantId}
            snapshot={card1Query.data.snapshot}
            set2={query.data.set2 ?? emptySet2Snapshot()}
            checklist={checklist}
            canEdit={canEdit}
          />
        )
      ) : card2Open ? (
        <PmsPropertySetupCard2Section
          cardStatus={
            card1Query.data
              ? evaluateProgrammeCardStatus(
                  "rooms-inventory",
                  card1Query.data.snapshot.status,
                  evaluateCard1Status(card1Query.data.snapshot.draft, card1Query.data.snapshot.status, card1Query.data.set2),
                )
              : "not_started"
          }
          canEdit={canEdit}
        />
      ) : section ? (
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="property-setup-cards">
            {PROPERTY_SETUP_CARDS.map((card) => {
              const card1Status = card1Query.data
                ? evaluateCard1Status(card1Query.data.snapshot.draft, card1Query.data.snapshot.status, card1Query.data.set2)
                : "not_started";
              const status: PropertySetupCardStatus = card1Query.data
                ? evaluateProgrammeCardStatus(card.id, card1Query.data.snapshot.status, card1Status)
                : "not_started";
              return (
                <article
                  key={card.id}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-card p-5",
                    card.specced ? "border-border" : "border-dashed border-[#CCCCCC] bg-muted/20",
                  )}
                  data-testid={card.specced ? `property-setup-card-${card.number}` : "property-setup-coming-soon-card"}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className={cn("font-display text-lg", card.specced ? "text-[#251605]" : "text-muted-foreground")}>
                      {card.number}. {card.title}
                    </h2>
                    {card.specced ? (
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          status === "complete" && "border-[#436436]/40 bg-[#436436]/10 text-[#436436]",
                          status === "in_progress" && "border-[#C89933]/50 bg-[#C89933]/10 text-[#251605]",
                          status === "not_started" && "border-[#CCCCCC] bg-muted/60 text-muted-foreground",
                        )}
                      >
                        {propertySetupStatusLabel(status)}
                      </span>
                    ) : (
                      <span className="rounded-full border border-[#CCCCCC] px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{card.purpose}</p>
                  {card.specced ? (
                    <a href={`${SET1_HUB_HREF}#${card.id}`} className="mt-4 inline-flex text-sm font-medium text-[#C89933]">
                      Configure
                    </a>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">Programme context only — not Spec’d / not build.</p>
                  )}
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
