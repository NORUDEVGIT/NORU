import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ellipsis } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3EmptyRow,
  Card3SearchAddBar,
  Card3Section,
  Card3StatusDot,
  Card3Table,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import {
  formatSeasonAppliesTo,
  formatSeasonPeriod,
  PricingSeasonWizard,
} from "@/packages/pms/components/settings/pricing-season-wizard";
import {
  formatPromotionAppliesTo,
  formatPromotionDiscount,
  formatPromotionStayWindow,
  PromotionWizard,
} from "@/packages/pms/components/settings/promotion-wizard";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getCommercialCard3,
  saveCommercialPromotionCard3,
  saveCommercialSeasonCard3,
} from "@/packages/pms/lib/commercial-card3.functions";
import {
  CARD3_COMMERCIAL_TABS,
  type CommercialPromotionRow,
  type CommercialSeasonRow,
} from "@/packages/pms/lib/commercial-card3.server";

type StatusFilter = "all" | "active" | "inactive";

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

export function PmsPropertySetupCard3Commercial({
  restaurantId,
  canEdit,
  domain,
}: {
  restaurantId: string;
  canEdit: boolean;
  domain: Card3Domain;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCommercialCard3);
  const savePromotion = useServerFn(saveCommercialPromotionCard3);
  const saveSeason = useServerFn(saveCommercialSeasonCard3);
  const [promotionSearch, setPromotionSearch] = useState("");
  const [promotionStatus, setPromotionStatus] = useState<StatusFilter>("all");
  const [seasonSearch, setSeasonSearch] = useState("");
  const [seasonStatus, setSeasonStatus] = useState<StatusFilter>("all");
  const [promotionDraft, setPromotionDraft] = useState<CommercialPromotionRow | "new" | null>(
    null,
  );
  const [seasonDraft, setSeasonDraft] = useState<CommercialSeasonRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-commercial", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot = query.data?.snapshot;
  const readiness = query.data?.readiness;
  const promotions = useMemo(() => snapshot?.promotions ?? [], [snapshot?.promotions]);
  const seasons = useMemo(() => snapshot?.seasons ?? [], [snapshot?.seasons]);
  const roomTypes = snapshot?.roomTypes ?? [];

  const filteredPromotions = useMemo(
    () =>
      promotions.filter((row) => {
        if (promotionStatus === "active" && !row.active) return false;
        if (promotionStatus === "inactive" && row.active) return false;
        return matchesQuery(
          promotionSearch,
          row.code,
          row.name,
          row.promoKindLabel,
          row.description,
        );
      }),
    [promotions, promotionSearch, promotionStatus],
  );

  const filteredSeasons = useMemo(
    () =>
      seasons.filter((row) => {
        if (seasonStatus === "active" && !row.active) return false;
        if (seasonStatus === "inactive" && row.active) return false;
        return matchesQuery(
          seasonSearch,
          row.code,
          row.name,
          row.seasonTypeLabel,
          row.description,
        );
      }),
    [seasons, seasonSearch, seasonStatus],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-commercial", restaurantId] });
  }

  const promotionMutation = useMutation({
    mutationFn: (input: {
      restaurantId: string;
      id: string;
      code: string;
      name: string;
      promoKind: CommercialPromotionRow["promoKind"];
      promoValue: number;
      validFrom: string;
      validTo: string;
      conditions?: string;
      description?: string;
      active: boolean;
      roomTypeIds: string[];
    }) => savePromotion({ data: input }),
    onSuccess: () => {
      toast.success("Promotion updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const seasonMutation = useMutation({
    mutationFn: (input: {
      restaurantId: string;
      id: string;
      code: string;
      name: string;
      seasonType: CommercialSeasonRow["seasonType"];
      validFrom: string;
      validTo: string;
      description?: string;
      active: boolean;
      roomTypeIds: string[];
    }) => saveSeason({ data: input }),
    onSuccess: () => {
      toast.success("Pricing season updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  void CARD3_COMMERCIAL_TABS;

  const isEmpty = promotions.length === 0 && seasons.length === 0;

  async function togglePromotionActive(row: CommercialPromotionRow) {
    if (!canEdit || promotionMutation.isPending) return;
    await promotionMutation.mutateAsync({
      restaurantId,
      id: row.id,
      code: row.code,
      name: row.name,
      promoKind: row.promoKind,
      promoValue: row.promoValue,
      validFrom: row.validFrom,
      validTo: row.validTo,
      conditions: row.conditions || undefined,
      description: row.description || undefined,
      active: !row.active,
      roomTypeIds: row.roomTypeIds,
    });
  }

  async function toggleSeasonActive(row: CommercialSeasonRow) {
    if (!canEdit || seasonMutation.isPending) return;
    await seasonMutation.mutateAsync({
      restaurantId,
      id: row.id,
      code: row.code,
      name: row.name,
      seasonType: row.seasonType,
      validFrom: row.validFrom,
      validTo: row.validTo,
      description: row.description || undefined,
      // Omit rateAdjustmentPercent so legacy hint values are preserved.
      active: !row.active,
      roomTypeIds: row.roomTypeIds,
    });
  }

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading revenue and commercial rules…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ??
            "Revenue & Commercial Rules are unavailable."}
        </p>
      ) : (
        <div className="space-y-3" data-testid="pms-card3-commercial">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] bg-[#ECEAE4] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Optional
            </span>
            <p className="text-xs text-muted-foreground">
              Promotions and pricing seasons — not required for activation.
              {isEmpty ? " None configured yet." : null}
            </p>
          </div>
          {readiness?.warnings && readiness.warnings.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-[#9A6A12]">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <Card3Section title="Promotions" icon="tag" testId="pms-card3-promotions">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <Card3SearchAddBar
                  value={promotionSearch}
                  onChange={setPromotionSearch}
                  placeholder="Search promotions"
                  addLabel="New Promotion"
                  onAdd={() => setPromotionDraft("new")}
                  canEdit={canEdit}
                />
              </div>
              <Select
                value={promotionStatus}
                onValueChange={(next) => setPromotionStatus(next as StatusFilter)}
              >
                <SelectTrigger className="h-11 w-full rounded-[6px] sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {promotions.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#D9D0C3] bg-[#FAF8F5] px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[#251605]">No promotions configured</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Create promotions for seasonal offers, early booking discounts and other
                  commercial campaigns.
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-4 rounded-[6px] bg-[#C89933] text-[#251605] hover:bg-[#B8892A]"
                    onClick={() => setPromotionDraft("new")}
                  >
                    + New Promotion
                  </Button>
                ) : null}
              </div>
            ) : (
              <Card3Table
                headers={[
                  "Promotion",
                  "Type",
                  "Discount",
                  "Stay Window",
                  "Applies To",
                  "Status",
                  "",
                ]}
              >
                {filteredPromotions.length === 0 ? (
                  <Card3EmptyRow colSpan={7}>No promotions match this search.</Card3EmptyRow>
                ) : (
                  filteredPromotions.map((row) => (
                    <tr key={row.id} className="border-t border-[#E6E1D8]">
                      <td className="px-3 py-2 text-[#251605]">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-[11px] text-muted-foreground">{row.code}</div>
                      </td>
                      <td className="px-3 py-2 text-[#251605]">{row.promoKindLabel}</td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatPromotionDiscount(row.promoKind, row.promoValue)}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatPromotionStayWindow(row.validFrom, row.validTo)}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatPromotionAppliesTo(row.roomTypeIds, roomTypes)}
                      </td>
                      <td className="px-3 py-2">
                        <Card3StatusDot active={row.active} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-[6px] text-[#251605] hover:bg-[#F4EDE0]"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-36">
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onSelect={() => setPromotionDraft(row)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canEdit || promotionMutation.isPending}
                              onSelect={() => void togglePromotionActive(row)}
                            >
                              {row.active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </Card3Table>
            )}
          </Card3Section>

          <Card3Section title="Pricing Seasons" icon="date" testId="pms-card3-pricing-seasons">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <Card3SearchAddBar
                  value={seasonSearch}
                  onChange={setSeasonSearch}
                  placeholder="Search pricing seasons"
                  addLabel="New Pricing Season"
                  onAdd={() => setSeasonDraft("new")}
                  canEdit={canEdit}
                />
              </div>
              <Select
                value={seasonStatus}
                onValueChange={(next) => setSeasonStatus(next as StatusFilter)}
              >
                <SelectTrigger className="h-11 w-full rounded-[6px] sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {seasons.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#D9D0C3] bg-[#FAF8F5] px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[#251605]">No pricing seasons configured</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  Create named commercial date periods such as high season, low season, or special
                  events for Rate & Pricing to reference.
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-4 rounded-[6px] bg-[#C89933] text-[#251605] hover:bg-[#B8892A]"
                    onClick={() => setSeasonDraft("new")}
                  >
                    + New Pricing Season
                  </Button>
                ) : null}
              </div>
            ) : (
              <Card3Table
                headers={["Pricing Season", "Type", "Period", "Applies To", "Status", ""]}
              >
                {filteredSeasons.length === 0 ? (
                  <Card3EmptyRow colSpan={6}>No pricing seasons match this search.</Card3EmptyRow>
                ) : (
                  filteredSeasons.map((row) => (
                    <tr key={row.id} className="border-t border-[#E6E1D8]">
                      <td className="px-3 py-2 text-[#251605]">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-[11px] text-muted-foreground">{row.code}</div>
                      </td>
                      <td className="px-3 py-2 text-[#251605]">{row.seasonTypeLabel}</td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatSeasonPeriod(row.validFrom, row.validTo)}
                      </td>
                      <td className="px-3 py-2 text-[#251605]">
                        {formatSeasonAppliesTo(row.roomTypeIds, roomTypes)}
                      </td>
                      <td className="px-3 py-2">
                        <Card3StatusDot active={row.active} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-[6px] text-[#251605] hover:bg-[#F4EDE0]"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-36">
                            <DropdownMenuItem
                              disabled={!canEdit}
                              onSelect={() => setSeasonDraft(row)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!canEdit || seasonMutation.isPending}
                              onSelect={() => void toggleSeasonActive(row)}
                            >
                              {row.active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </Card3Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Pricing seasons name commercial date periods. Rate & Pricing owns actual price
              changes.
            </p>
          </Card3Section>

          {promotionDraft !== null && snapshot ? (
            <PromotionWizard
              key={
                promotionDraft === "new"
                  ? "promotion-new"
                  : (promotionDraft.id ?? "promotion-closed")
              }
              restaurantId={restaurantId}
              canEdit={canEdit}
              snapshot={snapshot}
              editing={promotionDraft === "new" ? null : promotionDraft}
              onClose={() => setPromotionDraft(null)}
              onCompleted={() => {
                setPromotionDraft(null);
                invalidate();
              }}
            />
          ) : null}

          {seasonDraft !== null && snapshot ? (
            <PricingSeasonWizard
              key={
                seasonDraft === "new" ? "season-new" : (seasonDraft.id ?? "season-closed")
              }
              restaurantId={restaurantId}
              canEdit={canEdit}
              snapshot={snapshot}
              editing={seasonDraft === "new" ? null : seasonDraft}
              onClose={() => setSeasonDraft(null)}
              onCompleted={() => {
                setSeasonDraft(null);
                invalidate();
              }}
            />
          ) : null}
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}
