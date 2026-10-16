import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, Building2, Check, DollarSign, Percent, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import {
  GuestTravelAgencyCommissionRatesStep,
  CommercialSummaryPanel,
} from "./guest-travel-agency-commission-rates-step";
import {
  getTravelAgencyCommissionRatesConfig,
  saveTravelAgencyCommissionRates,
} from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.functions";
import type { TravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.server";
import {
  emptyGuestTravelAgentCreateDraft,
  type GuestTravelAgentCreateDraft,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import { cn } from "@/shared/lib/utils";

function buildDraftFromConfig(
  config: TravelAgencyCommissionRatesConfig | undefined,
  agencyId: string,
): GuestTravelAgentCreateDraft {
  const base = emptyGuestTravelAgentCreateDraft();
  base.accountId = agencyId;

  if (!config) return base;

  const defaultCurr = config.baseCurrency || "ETB";

  // Check if existing agreement exists -> Net Rate
  if (config.existingAgreement) {
    const agmt = config.existingAgreement;
    return {
      ...base,
      commercialModel: "net_rate",
      commissionEnabled: false,
      netPricingMethod: agmt.pricingMethod || "rate_plan",
      netRatePlanId: agmt.ratePlanId || "",
      netDiscountType: agmt.discountType || "percent",
      netDiscountValue: agmt.discountValue != null ? String(agmt.discountValue) : "",
      netCurrencyCode: agmt.currencyCode || defaultCurr,
      netValidFrom: agmt.validFrom || "",
      netValidUntil: agmt.validTo || "",
      contractedRates:
        agmt.contractedRates?.map((cr) => ({
          roomTypeId: cr.roomTypeId,
          amount: String(cr.amount),
        })) || [],
      commercialNotes: "",
    };
  }

  // Check if commission plan / rules exist -> Commissionable
  if (config.currentCommissionPlan || (config.commissionRules && config.commissionRules.length > 0)) {
    const plan = config.currentCommissionPlan;
    const rules = config.commissionRules || [];
    const hasSpecificRules = rules.some((r) => r.scopeType !== "all");
    const allRule = rules.find((r) => r.scopeType === "all");

    const commType = (allRule?.commissionType || plan?.commissionType || "percent") as "percent" | "fixed";
    const commVal = String(allRule?.commissionValue ?? plan?.rateValue ?? 10);

    return {
      ...base,
      commercialModel: "commissionable",
      commissionEnabled: true,
      commissionType: commType,
      commissionValue: commVal,
      allCommissionType: commType,
      allCommissionValue: commVal,
      commissionCurrency: plan?.currency || defaultCurr,
      commissionEffectiveOn: plan?.effectiveOn || new Date().toISOString().slice(0, 10),
      commissionExpiresOn: plan?.expiresOn || "",
      commissionNotes: plan?.notes || "",
      commissionApplicationMode: hasSpecificRules ? "specific" : "all",
      commissionRules: rules.map((r) => ({
        id: r.id,
        scopeType: r.scopeType,
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId,
        commissionType: r.commissionType,
        commissionValue: String(r.commissionValue),
      })),
      agencyRateDefaults: config.agencyRateDefaults ?? [],
    };
  }

  // Default fallback
  return {
    ...base,
    commercialModel: "commissionable",
    commissionEnabled: true,
    currency: defaultCurr,
    commissionCurrency: defaultCurr,
    netCurrencyCode: defaultCurr,
    commissionEffectiveOn: new Date().toISOString().slice(0, 10),
  };
}

export function GuestTravelAgencyCommercialEditModal({
  restaurantId,
  agencyId,
  agencyName,
  open,
  onOpenChange,
  onSaved,
}: {
  restaurantId: string;
  agencyId: string;
  agencyName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const loadConfig = useServerFn(getTravelAgencyCommissionRatesConfig);
  const saveRates = useServerFn(saveTravelAgencyCommissionRates);

  const configQuery = useQuery({
    queryKey: ["travel-agency-step3-config", restaurantId, agencyId],
    queryFn: () => loadConfig({ data: { restaurantId, agencyId } }),
    enabled: open && Boolean(agencyId),
  });

  const [draft, setDraft] = useState<GuestTravelAgentCreateDraft>(() =>
    buildDraftFromConfig(configQuery.data, agencyId),
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Synchronize draft when config loads or modal opens
  useEffect(() => {
    if (open && configQuery.data) {
      setDraft(buildDraftFromConfig(configQuery.data, agencyId));
      setFormErrors({});
    }
  }, [open, configQuery.data, agencyId]);

  function fieldError(field: string): string | undefined {
    return formErrors[field];
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (draft.commercialModel === "commissionable") {
      if (!draft.commissionCurrency?.trim()) {
        errs.commissionCurrency = "Currency is required.";
      }
      if (!draft.commissionEffectiveOn?.trim()) {
        errs.commissionEffectiveOn = "Effective date is required.";
      }
      if (
        draft.commissionExpiresOn &&
        draft.commissionEffectiveOn &&
        draft.commissionExpiresOn < draft.commissionEffectiveOn
      ) {
        errs.commissionExpiresOn = "Expiry date cannot precede effective date.";
      }
      if (draft.commissionApplicationMode === "all") {
        const val = Number(draft.allCommissionValue || draft.commissionValue || 0);
        if (isNaN(val) || val < 0) {
          errs.allCommissionValue = "Commission value must be 0 or greater.";
        }
        if (
          (draft.allCommissionType || draft.commissionType) === "percent" &&
          val > 100
        ) {
          errs.allCommissionValue = "Percentage cannot exceed 100%.";
        }
      }
    } else {
      // Net Rate
      if (!draft.netPricingMethod) {
        errs.netPricingMethod = "Please select a net pricing method.";
      }
      if (!draft.netCurrencyCode?.trim()) {
        errs.netCurrencyCode = "Settlement currency is required.";
      }
      if (draft.netPricingMethod === "rate_plan" && !draft.netRatePlanId) {
        errs.netRatePlanId = "Please select a base rate plan.";
      }
      if (draft.netPricingMethod === "rate_plan_discount") {
        if (!draft.netRatePlanId) {
          errs.netRatePlanId = "Please select a rate plan.";
        }
        const val = Number(draft.netDiscountValue || 0);
        if (isNaN(val) || val <= 0) {
          errs.netDiscountValue = "Discount must be greater than zero.";
        }
      }
      if (draft.netPricingMethod === "contracted_rates") {
        if (!draft.contractedRates || draft.contractedRates.length === 0) {
          errs.contractedRates = "At least one contracted room rate is required.";
        }
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isComm = draft.commercialModel === "commissionable";
      const rulesToPersist = isComm
        ? draft.commissionApplicationMode === "all" ||
          (draft.commissionRules ?? []).length === 0
          ? [
              {
                scopeType: "all" as const,
                roomTypeId: null,
                ratePlanId: null,
                commissionType: (draft.allCommissionType ||
                  draft.commissionType ||
                  "percent") as "percent" | "fixed",
                commissionValue: Number(
                  draft.allCommissionValue || draft.commissionValue || 0,
                ),
              },
            ]
          : (draft.commissionRules ?? []).map((r) => ({
              id: r.id,
              scopeType: r.scopeType,
              roomTypeId: r.scopeType !== "all" ? r.roomTypeId || null : null,
              ratePlanId: r.scopeType === "rate_plan" ? r.ratePlanId || null : null,
              commissionType: r.commissionType,
              commissionValue: Number(r.commissionValue || 0),
            }))
        : [];

      const payload = {
        restaurantId,
        agencyId,
        commercialModel: draft.commercialModel,
        commissionCurrency:
          draft.commissionCurrency || configQuery.data?.baseCurrency || "ETB",
        commissionEffectiveOn:
          draft.commissionEffectiveOn || new Date().toISOString().slice(0, 10),
        commissionExpiresOn: draft.commissionExpiresOn || null,
        commissionNotes: draft.commissionNotes || null,
        commissionRules: rulesToPersist,
        agencyRateDefaults: [],
        netPricingMethod: draft.netPricingMethod || null,
        netRoomTypeId: draft.netRoomTypeId || null,
        netRatePlanId: draft.netRatePlanId || null,
        netDiscountType: draft.netDiscountType || null,
        netDiscountValue: draft.netDiscountValue
          ? Number(draft.netDiscountValue)
          : null,
        netCurrencyCode:
          draft.netCurrencyCode ||
          draft.currency ||
          configQuery.data?.baseCurrency ||
          "ETB",
        netValidFrom: draft.netValidFrom || null,
        netValidUntil: draft.netValidUntil || null,
        contractedRates: (draft.contractedRates ?? []).map((cr) => ({
          roomTypeId: cr.roomTypeId,
          amount: Number(cr.amount || 0),
        })),
        commercialNotes: draft.commercialNotes || null,
      };

      return saveRates({ data: payload });
    },
    onSuccess: () => {
      toast.success("Commercial terms & rates updated successfully.");
      void queryClient.invalidateQueries({
        queryKey: ["travel-agency-step3-config", restaurantId, agencyId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["travel-agent-commission-plans", restaurantId, agencyId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["travel-agent-commission-entries", restaurantId, agencyId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["travel-agent-detail", restaurantId, agencyId],
      });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update commercial terms.");
    },
  });

  function handleSave() {
    if (!validate()) {
      toast.error("Please resolve highlighted validation issues before saving.");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="travel-agency-commercial-edit-modal"
        className="max-w-5xl w-full max-h-[90vh] flex flex-col p-0 gap-0 border-[#DDD4C5] bg-[#FAF8F5] overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="border-b border-[#EDE6D8] bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#FAF8F5] border border-[#EDE6D8] text-[#8A641A]">
                {draft.commercialModel === "commissionable" ? (
                  <Percent className="size-5" />
                ) : (
                  <DollarSign className="size-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-[#251605]">
                  Edit Commercial Terms & Rates
                </DialogTitle>
                <DialogDescription className="text-xs text-[#756A5B]">
                  {agencyName ? `${agencyName} · ` : ""}
                  Configure commission structure, overrides, or wholesale agreements.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main Form Scrollable Area */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {configQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-[#756A5B]">
                Loading commercial configuration…
              </div>
            ) : configQuery.error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  Could not load rates configuration:{" "}
                  {(configQuery.error as Error).message}
                </span>
              </div>
            ) : (
              <GuestTravelAgencyCommissionRatesStep
                draft={draft}
                set={setDraft}
                config={configQuery.data}
                fieldError={fieldError}
              />
            )}
          </div>

          {/* Right-side Live Preview Panel */}
          <aside className="w-80 border-l border-[#EDE6D8] bg-[#FAF8F5] overflow-y-auto p-5 hidden lg:block shrink-0">
            <CommercialSummaryPanel draft={draft} config={configQuery.data} />
          </aside>
        </div>

        {/* Sticky Footer */}
        <DialogFooter className="border-t border-[#EDE6D8] bg-white px-6 py-3.5 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
            className="text-xs border-[#DDD4C5] text-[#756A5B]"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || configQuery.isLoading}
            className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] text-xs font-semibold px-4 shadow-none"
            data-testid="save-commercial-terms-button"
          >
            {saveMutation.isPending ? "Saving changes…" : "Save Commercial Terms"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
