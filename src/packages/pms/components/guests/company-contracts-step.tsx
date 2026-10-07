import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Plus, Trash2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  buildCancellationPolicyPreview,
  buildNoShowPolicyPreview,
  type CorporateAgreementPricingMethod,
} from "@/packages/pms/lib/corporate-contracts.server";
import type { CompanyContractCreateConfig } from "@/packages/pms/lib/corporate-contracts.functions";
import {
  emptyCompanyContractDraft,
  type CompanyContractDraft,
  type GuestCompanyCreateDraft,
  type RatePlanDiscountItem,
} from "@/packages/pms/lib/guest-company-create-workspace";

export const MODAL_CONTROL_CLASS =
  "h-9 rounded-none border-[#CCCCCC] bg-white text-xs text-[#251605] placeholder:text-[#A0988A] focus-visible:ring-[#8A641A] focus-visible:border-[#8A641A]";

function Field({
  label,
  required,
  error,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1 text-xs font-semibold text-[#251605]">
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className={error ? "[&_input]:border-destructive [&_button]:border-destructive [&_textarea]:border-destructive" : undefined}>
        {children}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!error && helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

export function CompanyContractsStep({
  draft,
  setContract,
  config,
  catalogues,
  isLoadingConfig,
  configError,
  fieldError,
  required,
  isRuleRequired,
  visible,
}: {
  draft: GuestCompanyCreateDraft;
  setContract: {
    <K extends keyof CompanyContractDraft>(key: K, value: CompanyContractDraft[K]): void;
    (patchOrUpdater: Partial<CompanyContractDraft> | ((prev: CompanyContractDraft) => CompanyContractDraft)): void;
  };
  config: CompanyContractCreateConfig | undefined;
  catalogues?: {
    ratePlans?: Array<{ id: string; name: string; code?: string | null; active?: boolean; [key: string]: any }>;
    roomTypes?: Array<{ id: string; name: string; code?: string | null; active?: boolean; [key: string]: any }>;
    [key: string]: any;
  };
  isLoadingConfig?: boolean;
  configError?: string | null;
  fieldError: (key: string, stepId?: string) => string | undefined;
  required?: (code: string) => boolean;
  isRuleRequired?: (code: string) => boolean;
  visible?: (code: string) => boolean;
}) {
  const isReq = (code: string, fallback = false) => {
    const fn = isRuleRequired || required;
    if (fn) return fn(code);
    return fallback;
  };

  const contract =
    draft.contract && typeof draft.contract === "object" && !Array.isArray(draft.contract)
      ? draft.contract
      : emptyCompanyContractDraft();

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const baseCurrencyFromSettings =
    config?.baseCurrency ||
    config?.currencies?.find((c) => c.isBase)?.code ||
    draft.currency ||
    "";
  const currency = contract.currencyCode || baseCurrencyFromSettings || "USD";

  // Automatically adopt base property currency from settings if contract currency is not yet chosen
  useEffect(() => {
    if (!contract.currencyCode && baseCurrencyFromSettings) {
      setContract("currencyCode", baseCurrencyFromSettings);
    }
  }, [contract.currencyCode, baseCurrencyFromSettings]);

  // Combine config rate plans with fallback catalogues from PMS settings
  const availableRatePlans = useMemo(() => {
    if (config?.ratePlans && config.ratePlans.length > 0) {
      return config.ratePlans;
    }
    if (catalogues?.ratePlans && catalogues.ratePlans.length > 0) {
      return catalogues.ratePlans
        .filter((rp: any) => rp.active !== false)
        .map((rp: any) => ({
          id: String(rp.id),
          code: String(rp.code ?? ""),
          name: String(rp.name ?? ""),
          roomTypeId: String(rp.roomTypeId ?? rp.room_type_id ?? ""),
          roomTypeName: String(rp.roomTypeName ?? rp.room_type_name ?? "Room"),
          currency: String(rp.currency ?? currency).toUpperCase(),
          active: rp.active !== false,
        }));
    }
    return [];
  }, [config?.ratePlans, catalogues?.ratePlans, currency]);

  // Combine config room types with fallback catalogues from PMS settings
  const availableRoomTypes = useMemo(() => {
    if (config?.roomTypes && config.roomTypes.length > 0) {
      return config.roomTypes;
    }
    if (catalogues?.roomTypes && catalogues.roomTypes.length > 0) {
      return catalogues.roomTypes
        .filter((rt: any) => rt.active !== false)
        .map((rt: any) => ({
          id: String(rt.id),
          code: String(rt.code ?? ""),
          name: String(rt.name ?? ""),
          active: rt.active !== false,
        }));
    }
    return [];
  }, [config?.roomTypes, catalogues?.roomTypes]);

  // Selected policy previews
  const selectedDeposit = config?.guaranteePolicies.find((p) => p.id === contract.depositPolicyId);
  const selectedCancel = config?.cancellationPolicies.find((p) => p.id === contract.cancellationPolicyId);
  const selectedNoShow = config?.noShowPolicies.find((p) => p.id === contract.noShowPolicyId);

  const cancellationPreview = selectedCancel
    ? buildCancellationPolicyPreview(
        selectedCancel.cutoffHours,
        selectedCancel.penaltyType as any,
        selectedCancel.penaltyValue,
        selectedCancel.refundableBeforeCutoff,
      )
    : null;

  const noShowPreview = selectedNoShow
    ? buildNoShowPolicyPreview(
        selectedNoShow.penaltyType as any,
        selectedNoShow.penaltyValue,
        selectedNoShow.releaseHour,
      )
    : null;

  const depositPreview = selectedDeposit
    ? selectedDeposit.depositType === "none"
      ? "No deposit required."
      : selectedDeposit.depositType === "first_night"
      ? "First-night deposit required to guarantee booking."
      : selectedDeposit.depositType === "percent"
      ? `${selectedDeposit.depositValue}% deposit required to guarantee booking.`
      : `Fixed deposit of ${selectedDeposit.depositValue} ${currency} required.`
    : null;

  // Method C: Room rate rows
  const contractRates = contract.contractRates ?? [];
  const selectedRoomTypeIds = new Set(contractRates.map((r) => r.roomTypeId).filter(Boolean));

  function addContractRateRow() {
    const available = availableRoomTypes.find((rt) => !selectedRoomTypeIds.has(rt.id));
    const nextRoomTypeId = available ? available.id : "";
    setContract("contractRates", [
      ...contractRates,
      { roomTypeId: nextRoomTypeId, amount: null },
    ]);
  }

  function updateContractRateRow(index: number, patch: Partial<{ roomTypeId: string; amount: number | null }>) {
    const next = contractRates.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setContract("contractRates", next);
  }

  function removeContractRateRow(index: number) {
    const next = contractRates.filter((_, i) => i !== index);
    setContract("contractRates", next);
  }

  // Rate plan selection & scoping helpers for Methods A & B
  const currentRatePlanScope =
    contract.ratePlanScope ||
    ((contract.ratePlanIds && contract.ratePlanIds.length > 0) || contract.ratePlanId ? "selected" : "all");

  const selectedPlanIds = useMemo(() => {
    if (contract.ratePlanIds && contract.ratePlanIds.length > 0) {
      return new Set(contract.ratePlanIds);
    }
    if (contract.ratePlanId) {
      return new Set([contract.ratePlanId]);
    }
    return new Set<string>();
  }, [contract.ratePlanIds, contract.ratePlanId]);

  function setScope(scope: "all" | "selected") {
    if (scope === "all") {
      setContract({
        ratePlanScope: "all",
      });
    } else {
      const defaultIds =
        selectedPlanIds.size > 0
          ? Array.from(selectedPlanIds)
          : availableRatePlans.length > 0
          ? [availableRatePlans[0].id]
          : [];
      setContract({
        ratePlanScope: "selected",
        ratePlanIds: defaultIds,
        ratePlanId: defaultIds[0] || null,
      });
    }
  }

  function togglePlan(id: string) {
    const next = new Set(selectedPlanIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    const arr = Array.from(next);
    setContract({
      ratePlanScope: "selected",
      ratePlanIds: arr,
      ratePlanId: arr[0] || null,
    });
  }

  function selectAllPlans() {
    const allIds = availableRatePlans.map((rp) => rp.id);
    setContract({
      ratePlanScope: "selected",
      ratePlanIds: allIds,
      ratePlanId: allIds[0] || null,
    });
  }

  function deselectAllPlans() {
    setContract({
      ratePlanScope: "selected",
      ratePlanIds: [],
      ratePlanId: null,
    });
  }

  // Method B Discount calculations
  const currentDiscountApp = contract.discountApplication || "uniform";

  const eligiblePlansForDiscount = useMemo(() => {
    if (currentRatePlanScope === "all") {
      return availableRatePlans;
    }
    return availableRatePlans.filter((rp) => selectedPlanIds.has(rp.id));
  }, [currentRatePlanScope, availableRatePlans, selectedPlanIds]);

  function getPlanDiscount(planId: string) {
    const found = (contract.ratePlanDiscounts ?? []).find((d) => d.ratePlanId === planId);
    return {
      discountType: found?.discountType ?? contract.discountType ?? "percent",
      discountValue: found?.discountValue ?? (contract.discountValue ?? 10),
    };
  }

  function updatePlanDiscount(
    planId: string,
    patch: Partial<{ discountType: "percent" | "fixed"; discountValue: number | null }>,
  ) {
    const existing = contract.ratePlanDiscounts ?? [];
    const index = existing.findIndex((d) => d.ratePlanId === planId);
    let next: RatePlanDiscountItem[];
    if (index >= 0) {
      next = existing.map((d, i) => (i === index ? { ...d, ...patch } : d));
    } else {
      const current = getPlanDiscount(planId);
      next = [
        ...existing,
        {
          ratePlanId: planId,
          discountType: patch.discountType ?? current.discountType,
          discountValue: patch.discountValue !== undefined ? patch.discountValue : current.discountValue,
        },
      ];
    }
    setContract({ ratePlanDiscounts: next });
  }

  // Method switcher: clean up conditional values atomically
  function handlePricingMethodChange(method: CorporateAgreementPricingMethod) {
    if (method === contract.pricingMethod) return;

    if (method === "rate_plan") {
      setContract({
        pricingMethod: "rate_plan",
        ratePlanScope: contract.ratePlanScope || "all",
        discountType: null,
        discountValue: null,
        ratePlanDiscounts: [],
        contractRates: [],
      });
    } else if (method === "rate_plan_discount") {
      setContract({
        pricingMethod: "rate_plan_discount",
        ratePlanScope: contract.ratePlanScope || "all",
        discountApplication: contract.discountApplication || "uniform",
        discountType: contract.discountType || "percent",
        discountValue: contract.discountValue ?? 10,
        contractRates: [],
      });
    } else if (method === "contracted_rates") {
      const initialRates =
        contractRates.length > 0
          ? contractRates
          : availableRoomTypes.length > 0
          ? [{ roomTypeId: availableRoomTypes[0].id, amount: null }]
          : [];
      setContract({
        pricingMethod: "contracted_rates",
        ratePlanId: null,
        ratePlanIds: [],
        discountType: null,
        discountValue: null,
        ratePlanDiscounts: [],
        contractRates: initialRates,
      });
    }
  }

  // Document upload simulator / handler
  function handleDocumentUpload(
    docTypeId: string,
    fileOrEvent: File | React.ChangeEvent<HTMLInputElement> | null,
  ) {
    const file =
      fileOrEvent instanceof File
        ? fileOrEvent
        : fileOrEvent && "target" in fileOrEvent
        ? fileOrEvent.target.files?.[0]
        : null;
    if (!file) return;

    const currentDocs = contract?.documents ?? [];
    const existingIndex = currentDocs.findIndex((d) => d.documentTypeId === docTypeId);

    const newDoc = {
      documentTypeId: docTypeId,
      fileName: file.name,
      fileStoragePath: `contracts/${Date.now()}_${file.name}`,
      fileSize: file.size,
      fileType: file.type,
    };

    if (existingIndex >= 0) {
      const next = [...currentDocs];
      next[existingIndex] = newDoc;
      setContract("documents", next);
    } else {
      setContract("documents", [...currentDocs, newDoc]);
    }
  }

  function removeDocument(docTypeId: string) {
    const currentDocs = contract?.documents ?? [];
    setContract(
      "documents",
      currentDocs.filter((d) => d.documentTypeId !== docTypeId),
    );
  }

  return (
    <div className="space-y-6" data-testid="company-contracts-step">
      {/* SECTION 1: Contract Setup */}
      <section className="rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">Section 1 — Contract Setup</h2>
          <p className="text-xs text-[#756A5B]">
            Primary agreement classification, identifier codes, validity window, and legal reference.
          </p>
        </div>

        {/* Empty Contract Types Warning Banner */}
        {(!config?.contractTypes || config.contractTypes.length === 0) && (
          <div className="rounded-none border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No Contract Types Configured</p>
              <p className="mt-0.5 text-amber-800">
                No contract types are configured. Configure Contract Types in Settings → Finance & Business before creating an active contract.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Contract Type */}
          <Field label="Contract Type" required={isReq("COMPANY_CONTRACT_TYPE", true)} error={fieldError("contractTypeId", "contracts")}>
            <Select
              value={contract?.contractTypeId || ""}
              onValueChange={(val) => setContract("contractTypeId", val)}
            >
              <SelectTrigger className={MODAL_CONTROL_CLASS}>
                <SelectValue placeholder="Select contract type" />
              </SelectTrigger>
              <SelectContent>
                {(config?.contractTypes ?? []).map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.name} {ct.description ? `— ${ct.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* 2. Contract Name */}
          <Field label="Contract Name" required={isReq("COMPANY_CONTRACT_NAME", true)} error={fieldError("contractName", "contracts")}>
            <Input
              value={contract?.name || ""}
              onChange={(e) => setContract("name", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. Annual Corporate Agreement 2026"
            />
          </Field>

          {/* 3. Contract Code */}
          <Field
            label="Contract Code"
            required={isReq("COMPANY_CONTRACT_CODE", true)}
            error={fieldError("contractCode", "contracts")}
            helper="Unique internal reference code."
          >
            <Input
              value={contract?.code || ""}
              onChange={(e) => setContract("code", e.target.value.toUpperCase())}
              className={cn(MODAL_CONTROL_CLASS, "font-mono uppercase")}
              placeholder="e.g. CORP-2026-001"
            />
          </Field>

          {/* 4. External Reference */}
          <Field
            label="External Reference / Contract No."
            required={isReq("COMPANY_CONTRACT_NUMBER", false)}
            error={fieldError("contractNumber", "contracts")}
            helper="Physical signed contract or external legal number."
          >
            <Input
              value={contract?.contractNumber || ""}
              onChange={(e) => setContract("contractNumber", e.target.value)}
              className={MODAL_CONTROL_CLASS}
              placeholder="e.g. CNT-ETH-2026-99"
            />
          </Field>

          {/* 5. Valid From */}
          <Field label="Valid From" required={isReq("COMPANY_CONTRACT_VALID_FROM", true)} error={fieldError("validFrom", "contracts")}>
            <Input
              type="date"
              value={contract?.validFrom || ""}
              onChange={(e) => setContract("validFrom", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>

          {/* 6. Valid Until */}
          <Field label="Valid Until" required={isReq("COMPANY_CONTRACT_VALID_TO", true)} error={fieldError("validTo", "contracts")}>
            <Input
              type="date"
              value={contract?.validTo || ""}
              onChange={(e) => setContract("validTo", e.target.value)}
              className={MODAL_CONTROL_CLASS}
            />
          </Field>

          {/* 7. Currency */}
          <Field
            label="Currency"
            required={isReq("COMPANY_CONTRACT_CURRENCY", true)}
            error={fieldError("currencyCode", "contracts")}
            helper="Populated from Property Setup Currency Settings."
          >
            <Select
              value={contract?.currencyCode || baseCurrencyFromSettings}
              onValueChange={(val) => setContract("currencyCode", val)}
            >
              <SelectTrigger className={MODAL_CONTROL_CLASS} data-testid="contract-currency-select">
                <SelectValue placeholder="Select currency from settings" />
              </SelectTrigger>
              <SelectContent>
                {(config?.currencies ?? []).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} {c.isBase ? "(Base Property Currency)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* 8. Contract Status */}
          <Field label="Contract Status" required={isReq("COMPANY_CONTRACT_STATUS", true)} error={fieldError("status", "contracts")}>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setContract("status", "active")}
                className={cn(
                  "flex-1 rounded-none border py-1.5 text-xs font-semibold transition-colors",
                  contract?.status === "active"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm"
                    : "border-[#CCCCCC] bg-white text-[#756A5B] hover:bg-[#F7F4EE]",
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setContract("status", "draft")}
                className={cn(
                  "flex-1 rounded-none border py-1.5 text-xs font-semibold transition-colors",
                  contract?.status === "draft"
                    ? "border-amber-600 bg-amber-50 text-amber-800 shadow-sm"
                    : "border-[#CCCCCC] bg-white text-[#756A5B] hover:bg-[#F7F4EE]",
                )}
              >
                Draft
              </button>
            </div>
          </Field>
        </div>
      </section>

      {/* SECTION 2: Commercial Pricing */}
      <section className="rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">
            Section 2 — Commercial Pricing {isReq("COMPANY_CONTRACT_PRICING_METHOD", false) && <span className="text-destructive">*</span>}
          </h2>
          <p className="text-xs text-[#756A5B]">
            Select exactly one commercial pricing method governing how reservations resolve contracted rates.
          </p>
        </div>

        {fieldError("pricingMethod", "contracts") && (
          <p className="text-[11px] text-destructive">{fieldError("pricingMethod", "contracts")}</p>
        )}

        {/* Pricing Method Selector */}
        <div className="grid gap-3 sm:grid-cols-3" data-testid="pricing-method-selector">
          <button
            type="button"
            onClick={() => handlePricingMethodChange("rate_plan")}
            className={cn(
              "flex flex-col text-left rounded-none border p-3.5 transition-all",
              contract?.pricingMethod === "rate_plan"
                ? "border-[#8A641A] bg-[#FAF8F5] ring-1 ring-[#8A641A] shadow-sm"
                : "border-[#DDD4C5] bg-white hover:bg-[#FBF9F6]",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold text-[#251605]">Method A</span>
              <span className="size-3.5 rounded-full border border-[#8A641A] grid place-items-center">
                {contract?.pricingMethod === "rate_plan" && (
                  <span className="size-2 rounded-full bg-[#8A641A]" />
                )}
              </span>
            </div>
            <span className="mt-1 text-xs font-semibold text-[#251605]">Use Existing Rate Plan</span>
            <span className="mt-1 text-[11px] text-[#756A5B] leading-snug">
              Directly binds an existing property rate plan without discounts.
            </span>
          </button>

          <button
            type="button"
            onClick={() => handlePricingMethodChange("rate_plan_discount")}
            className={cn(
              "flex flex-col text-left rounded-none border p-3.5 transition-all",
              contract?.pricingMethod === "rate_plan_discount"
                ? "border-[#8A641A] bg-[#FAF8F5] ring-1 ring-[#8A641A] shadow-sm"
                : "border-[#DDD4C5] bg-white hover:bg-[#FBF9F6]",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold text-[#251605]">Method B</span>
              <span className="size-3.5 rounded-full border border-[#8A641A] grid place-items-center">
                {contract?.pricingMethod === "rate_plan_discount" && (
                  <span className="size-2 rounded-full bg-[#8A641A]" />
                )}
              </span>
            </div>
            <span className="mt-1 text-xs font-semibold text-[#251605]">Discount From Rate Plan</span>
            <span className="mt-1 text-[11px] text-[#756A5B] leading-snug">
              Applies a percentage or fixed concession from a base rate plan.
            </span>
          </button>

          <button
            type="button"
            onClick={() => handlePricingMethodChange("contracted_rates")}
            className={cn(
              "flex flex-col text-left rounded-none border p-3.5 transition-all",
              contract?.pricingMethod === "contracted_rates"
                ? "border-[#8A641A] bg-[#FAF8F5] ring-1 ring-[#8A641A] shadow-sm"
                : "border-[#DDD4C5] bg-white hover:bg-[#FBF9F6]",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold text-[#251605]">Method C</span>
              <span className="size-3.5 rounded-full border border-[#8A641A] grid place-items-center">
                {contract?.pricingMethod === "contracted_rates" && (
                  <span className="size-2 rounded-full bg-[#8A641A]" />
                )}
              </span>
            </div>
            <span className="mt-1 text-xs font-semibold text-[#251605]">Contracted Room Rates</span>
            <span className="mt-1 text-[11px] text-[#756A5B] leading-snug">
              Configures fixed negotiated room rates per room type.
            </span>
          </button>
        </div>

        {/* Method A: Configured Rate Plan */}
        {contract?.pricingMethod === "rate_plan" && (
          <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-4 space-y-4">
            {availableRatePlans.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-none p-2">
                No active rate plans available. Configure Rate Plans in Settings before selecting this pricing method.
              </p>
            ) : (
              <>
                {/* 1. Scope Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-[#251605]">
                    Rate Plan Application Scope <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-[11px] text-[#756A5B]">
                    This contract uses the selected property rate plan exactly as configured.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => setScope("all")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentRatePlanScope === "all"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentRatePlanScope === "all" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">All Rate Plans</p>
                        <p className="text-[11px] text-[#756A5B]">Applies to all {availableRatePlans.length} active plans</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScope("selected")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentRatePlanScope === "selected"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentRatePlanScope === "selected" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">Specific Rate Plans</p>
                        <p className="text-[11px] text-[#756A5B]">Select eligible plans</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* When All Rate Plans */}
                {currentRatePlanScope === "all" && (
                  <div className="rounded-none border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
                    <CheckCircle2 className="size-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">All Active Property Rate Plans Included</p>
                      <p className="mt-0.5 text-emerald-800">
                        Reservations for this company can book any existing property rate plan without discounts.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {availableRatePlans.map((rp) => (
                          <span
                            key={rp.id}
                            className="inline-flex items-center rounded-none bg-white border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                          >
                            {rp.name} ({rp.roomTypeName})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* When Specific Rate Plans */}
                {currentRatePlanScope === "selected" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-[#251605]">
                        Select Eligible Rate Plans <span className="text-destructive">*</span>
                        <span className="ml-2 font-normal text-[#756A5B]">
                          ({selectedPlanIds.size} of {availableRatePlans.length} selected)
                        </span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-[#8A641A] hover:bg-[#FAF8F5] rounded-none"
                          onClick={selectAllPlans}
                        >
                          Select All
                        </Button>
                        <span className="text-[#DDD4C5]">|</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-[#756A5B] hover:bg-[#FAF8F5] rounded-none"
                          onClick={deselectAllPlans}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>

                    {fieldError("ratePlanId", "contracts") && (
                      <p className="text-[11px] text-destructive">{fieldError("ratePlanId", "contracts")}</p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 max-h-[300px] overflow-y-auto rounded-none border border-[#DDD4C5] bg-white p-2.5">
                      {availableRatePlans.map((rp) => {
                        const checked = selectedPlanIds.has(rp.id);
                        return (
                          <label
                            key={rp.id}
                            onClick={() => togglePlan(rp.id)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-none border p-2.5 cursor-pointer transition-colors select-none",
                              checked
                                ? "border-[#8A641A] bg-[#FAF8F5]"
                                : "border-[#E8E4DC] hover:bg-[#FAF8F5]/50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="mt-0.5 rounded-none border-[#CCCCCC] text-[#8A641A] focus:ring-[#8A641A]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#251605] truncate">{rp.name}</p>
                              <p className="text-[11px] text-[#756A5B]">
                                {rp.roomTypeName} · <span className="font-mono">{rp.currency}</span>
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Method B: Discount From Rate Plan */}
        {contract?.pricingMethod === "rate_plan_discount" && (
          <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-4 space-y-4">
            {availableRatePlans.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-none p-2">
                No active rate plans available. Configure Rate Plans in Settings before selecting this pricing method.
              </p>
            ) : (
              <>
                {/* 1. Scope Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-[#251605]">
                    Base Rate Plan Application Scope <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-[11px] text-[#756A5B]">
                    Discount will be applied to the base rate plan when reservation pricing integration is active.
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => setScope("all")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentRatePlanScope === "all"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentRatePlanScope === "all" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">All Rate Plans</p>
                        <p className="text-[11px] text-[#756A5B]">Discount applies across all {availableRatePlans.length} plans</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScope("selected")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentRatePlanScope === "selected"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentRatePlanScope === "selected" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">Specific Rate Plans</p>
                        <p className="text-[11px] text-[#756A5B]">Select eligible plans</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* If Specific Rate Plans: Checklist */}
                {currentRatePlanScope === "selected" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-[#251605]">
                        Select Eligible Rate Plans <span className="text-destructive">*</span>
                        <span className="ml-2 font-normal text-[#756A5B]">
                          ({selectedPlanIds.size} of {availableRatePlans.length} selected)
                        </span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-[#8A641A] hover:bg-[#FAF8F5] rounded-none"
                          onClick={selectAllPlans}
                        >
                          Select All
                        </Button>
                        <span className="text-[#DDD4C5]">|</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] text-[#756A5B] hover:bg-[#FAF8F5] rounded-none"
                          onClick={deselectAllPlans}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>

                    {fieldError("ratePlanId", "contracts") && (
                      <p className="text-[11px] text-destructive">{fieldError("ratePlanId", "contracts")}</p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 max-h-[220px] overflow-y-auto rounded-none border border-[#DDD4C5] bg-white p-2.5">
                      {availableRatePlans.map((rp) => {
                        const checked = selectedPlanIds.has(rp.id);
                        return (
                          <label
                            key={rp.id}
                            onClick={() => togglePlan(rp.id)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-none border p-2.5 cursor-pointer transition-colors select-none",
                              checked
                                ? "border-[#8A641A] bg-[#FAF8F5]"
                                : "border-[#E8E4DC] hover:bg-[#FAF8F5]/50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="mt-0.5 rounded-none border-[#CCCCCC] text-[#8A641A] focus:ring-[#8A641A]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#251605] truncate">{rp.name}</p>
                              <p className="text-[11px] text-[#756A5B]">
                                {rp.roomTypeName} · <span className="font-mono">{rp.currency}</span>
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Discount Mode Selector: Uniform vs Separate per plan */}
                <div className="space-y-2 border-t border-[#E8E4DC] pt-3">
                  <Label className="text-xs font-semibold text-[#251605]">
                    Discount Calculation Method <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => setContract("discountApplication", "uniform")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentDiscountApp === "uniform"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentDiscountApp === "uniform" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">Same Discount For All</p>
                        <p className="text-[11px] text-[#756A5B]">Single % or fixed concession</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setContract("discountApplication", "custom")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-none border p-3 text-left transition-all",
                        currentDiscountApp === "custom"
                          ? "border-[#8A641A] bg-white ring-1 ring-[#8A641A] shadow-sm"
                          : "border-[#DDD4C5] bg-white/60 hover:bg-white",
                      )}
                    >
                      <div className="size-4 rounded-full border border-[#8A641A] grid place-items-center shrink-0">
                        {currentDiscountApp === "custom" && <div className="size-2 rounded-full bg-[#8A641A]" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#251605]">Separate Discount Per Plan</p>
                        <p className="text-[11px] text-[#756A5B]">Individual discount per rate plan</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 3A. Uniform Discount Inputs */}
                {currentDiscountApp === "uniform" && (
                  <div className="grid gap-3 sm:grid-cols-2 max-w-md rounded-none border border-[#DDD4C5] bg-white p-3.5">
                    <div>
                      <Field label="Discount Type" required error={fieldError("discountType", "contracts")}>
                        <Select
                          value={contract?.discountType || "percent"}
                          onValueChange={(val: any) => setContract("discountType", val)}
                        >
                          <SelectTrigger className={MODAL_CONTROL_CLASS}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">Percentage (%)</SelectItem>
                            <SelectItem value="fixed">Fixed Amount ({currency})</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div>
                      <Field
                        label={`Discount Value (${contract?.discountType === "fixed" ? currency : "%"})`}
                        required
                        error={fieldError("discountValue", "contracts")}
                      >
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max={contract?.discountType === "fixed" ? undefined : "100"}
                            step={contract?.discountType === "fixed" ? "50" : "1"}
                            value={contract?.discountValue ?? ""}
                            onChange={(e) =>
                              setContract(
                                "discountValue",
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            className={MODAL_CONTROL_CLASS}
                            placeholder={contract?.discountType === "fixed" ? "e.g. 500" : "e.g. 15"}
                          />
                          <span className="absolute right-3 top-2 text-xs font-semibold text-[#756A5B]">
                            {contract?.discountType === "fixed" ? currency : "%"}
                          </span>
                        </div>
                      </Field>
                    </div>
                  </div>
                )}

                {/* 3B. Separate Discount Per Plan (Custom) */}
                {currentDiscountApp === "custom" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#251605]">
                        Configure Discount for Each Rate Plan:
                      </p>
                      <p className="text-[11px] text-[#756A5B]">
                        {eligiblePlansForDiscount.length} plan(s) eligible
                      </p>
                    </div>

                    {eligiblePlansForDiscount.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-none p-2.5">
                        Please select at least one rate plan above to configure its discount.
                      </p>
                    ) : (
                      <div className="space-y-2 rounded-none border border-[#DDD4C5] bg-white p-3 max-h-[360px] overflow-y-auto">
                        {eligiblePlansForDiscount.map((rp) => {
                          const planDisc = getPlanDiscount(rp.id);
                          const planError = fieldError(`ratePlanDiscounts.${rp.id}`, "contracts");
                          return (
                            <div
                              key={rp.id}
                              className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-none border p-2.5 transition-colors",
                                planError ? "border-destructive bg-destructive/5" : "border-[#E8E4DC] bg-[#FAF8F5]/60 hover:bg-[#FAF8F5]",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-[#251605]">{rp.name}</p>
                                <p className="text-[11px] text-[#756A5B]">
                                  {rp.roomTypeName} · Currency: {rp.currency}
                                </p>
                                {planError && <p className="text-[10px] text-destructive mt-0.5">{planError}</p>}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Select
                                  value={planDisc.discountType}
                                  onValueChange={(val: any) =>
                                    updatePlanDiscount(rp.id, { discountType: val })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28 text-xs border-[#CCCCCC] bg-white rounded-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percent">Percent (%)</SelectItem>
                                    <SelectItem value="fixed">Fixed ({currency})</SelectItem>
                                  </SelectContent>
                                </Select>

                                <div className="relative w-28">
                                  <Input
                                    type="number"
                                    min="0"
                                    max={planDisc.discountType === "fixed" ? undefined : "100"}
                                    step={planDisc.discountType === "fixed" ? "50" : "1"}
                                    value={planDisc.discountValue ?? ""}
                                    onChange={(e) =>
                                      updatePlanDiscount(rp.id, {
                                        discountValue: e.target.value === "" ? null : Number(e.target.value),
                                      })
                                    }
                                    className="h-8 pr-7 text-xs border-[#CCCCCC] bg-white rounded-none"
                                    placeholder={planDisc.discountType === "fixed" ? "500" : "15"}
                                  />
                                  <span className="absolute right-2 top-1.5 text-[10px] font-semibold text-[#756A5B]">
                                    {planDisc.discountType === "fixed" ? currency : "%"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Method C: Contracted Room Rates */}
        {contract?.pricingMethod === "contracted_rates" && (
          <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xs font-bold text-[#251605]">Negotiated Room Rates</h3>
                <p className="text-[11px] text-[#756A5B]">
                  Fixed room rates per night in {currency}. Validity matches contract validity.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs border-[#DDD4C5] text-[#251605] hover:bg-white rounded-none"
                onClick={addContractRateRow}
              >
                <Plus className="mr-1 size-3.5" /> Add Room Type Rate
              </Button>
            </div>

            {fieldError("contractRates", "contracts") && (
              <p className="text-[11px] text-destructive">{fieldError("contractRates", "contracts")}</p>
            )}

            <div className="overflow-hidden rounded-none border border-[#DDD4C5] bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] border-b border-[#DDD4C5] text-[#756A5B] font-semibold">
                  <tr>
                    <th className="py-2 px-3">Room Type *</th>
                    <th className="py-2 px-3">Contracted Rate ({currency}) *</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE9DF]">
                  {contractRates.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-xs text-[#756A5B]">
                        No room type rates added. Click "+ Add Room Type Rate" to configure negotiated pricing.
                      </td>
                    </tr>
                  ) : (
                    contractRates.map((row, index) => {
                      const rowRtError = fieldError(`contractRates.${index}.roomTypeId`, "contracts");
                      const rowAmountError = fieldError(`contractRates.${index}.amount`, "contracts");

                      return (
                        <tr key={index} className="hover:bg-[#FAF8F5]/60 transition-colors">
                          <td className="py-2 px-3 align-top">
                            <Select
                              value={row.roomTypeId || ""}
                              onValueChange={(val) => updateContractRateRow(index, { roomTypeId: val })}
                            >
                              <SelectTrigger className={cn(MODAL_CONTROL_CLASS, rowRtError && "border-destructive")}>
                                <SelectValue placeholder="Select room type" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableRoomTypes.map((rt) => {
                                  const disabled = selectedRoomTypeIds.has(rt.id) && rt.id !== row.roomTypeId;
                                  return (
                                    <SelectItem key={rt.id} value={rt.id} disabled={disabled}>
                                      {rt.name} {disabled ? "(Already selected)" : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {rowRtError && <p className="text-[10px] text-destructive mt-0.5">{rowRtError}</p>}
                          </td>

                          <td className="py-2 px-3 align-top">
                            <div className="relative">
                              <Input
                                type="number"
                                min="0"
                                step="50"
                                value={row.amount ?? ""}
                                onChange={(e) =>
                                  updateContractRateRow(index, {
                                    amount: e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                className={cn(MODAL_CONTROL_CLASS, rowAmountError && "border-destructive")}
                                placeholder="0.00"
                              />
                              <span className="absolute right-3 top-2 text-[10px] font-semibold text-[#756A5B]">
                                {currency}
                              </span>
                            </div>
                            {rowAmountError && (
                              <p className="text-[10px] text-destructive mt-0.5">{rowAmountError}</p>
                            )}
                          </td>

                          <td className="py-2 px-3 text-right align-top">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 text-[#756A5B] hover:text-destructive rounded-none"
                              onClick={() => removeContractRateRow(index)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Booking Conditions */}
      <section className="rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">Section 3 — Booking Conditions</h2>
          <p className="text-xs text-[#756A5B]">
            Settings-driven policies governing reservation guarantees, cancellation cutoffs, and room release behavior.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Guarantee Policy */}
          <div className="space-y-1.5">
            <Field
              label="Guarantee / Deposit Policy"
              required={isReq("COMPANY_CONTRACT_DEPOSIT_POLICY", false)}
              error={fieldError("depositPolicyId", "contracts")}
              helper="Reuses property deposit policy master."
            >
              <Select
                value={contract?.depositPolicyId || "none"}
                onValueChange={(val) => setContract("depositPolicyId", val === "none" ? null : val)}
              >
                <SelectTrigger className={MODAL_CONTROL_CLASS}>
                  <SelectValue placeholder="Select guarantee policy (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (No Guarantee)</SelectItem>
                  {(config?.guaranteePolicies ?? []).map((dp) => (
                    <SelectItem key={dp.id} value={dp.id}>
                      {dp.name} {dp.isDefault ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {depositPreview && (
              <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-2 text-[11px] text-[#756A5B]">
                {depositPreview}
              </div>
            )}
          </div>

          {/* Cancellation Policy */}
          <div className="space-y-1.5">
            <Field
              label="Cancellation Policy"
              required={isReq("COMPANY_CONTRACT_CANCEL_POLICY", false) || isReq("COMPANY_CONTRACT_CANCELLATION_POLICY", false)}
              error={fieldError("cancellationPolicyId", "contracts")}
              helper="Defines free cancellation cutoff and penalty."
            >
              <Select
                value={contract?.cancellationPolicyId || "none"}
                onValueChange={(val) => setContract("cancellationPolicyId", val === "none" ? null : val)}
              >
                <SelectTrigger className={MODAL_CONTROL_CLASS}>
                  <SelectValue placeholder="Select cancellation policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Free Cancellation)</SelectItem>
                  {(config?.cancellationPolicies ?? []).map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name} {cp.isDefault ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {cancellationPreview && (
              <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-2 text-[11px] text-[#756A5B]">
                {cancellationPreview}
              </div>
            )}
          </div>

          {/* No-Show Policy */}
          <div className="space-y-1.5">
            <Field
              label="No-Show Policy"
              required={isReq("COMPANY_CONTRACT_NOSHOW_POLICY", false)}
              error={fieldError("noShowPolicyId", "contracts")}
              helper="Defines charge and unclaimed room release time."
            >
              <Select
                value={contract?.noShowPolicyId || "none"}
                onValueChange={(val) => setContract("noShowPolicyId", val === "none" ? null : val)}
              >
                <SelectTrigger className={MODAL_CONTROL_CLASS}>
                  <SelectValue placeholder="Select no-show policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (No Charge)</SelectItem>
                  {(config?.noShowPolicies ?? []).map((nsp) => (
                    <SelectItem key={nsp.id} value={nsp.id}>
                      {nsp.name} {nsp.isDefault ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {noShowPreview && (
              <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-2 text-[11px] text-[#756A5B]">
                {noShowPreview}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 4: Contract Documents */}
      <section className="rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E4DC] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-[#8A641A]" />
              <h2 className="font-display text-base font-semibold text-[#251605]">Section 4 — Contract Documents</h2>
            </div>
            <p className="text-xs text-[#756A5B] mt-0.5">
              Upload compliance and contract documents configured for companies in Settings Card 4.
            </p>
          </div>
          <span className="text-xs text-[#756A5B]">
            {contract?.documents?.length || 0} uploaded
          </span>
        </div>

        {(!config?.contractDocumentTypes || config.contractDocumentTypes.filter((d) => d.active !== false).length === 0) ? (
          <p className="text-xs text-[#756A5B] italic p-3 text-center bg-[#FAF8F5] rounded-none">
            No company document types are currently configured in Settings → Card 4.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" data-testid="company-documents-list">
            {config.contractDocumentTypes
              .filter((d) => d.active !== false)
              .map((docType) => {
              const uploadedDoc = (contract?.documents ?? []).find((d) => d.documentTypeId === docType.id);
              const docError = fieldError(`documents.${docType.id}`, "contracts");

              return (
                <div
                  key={docType.id}
                  className={cn(
                    "flex flex-col justify-between rounded-md border bg-white transition-colors overflow-hidden",
                    docError
                      ? "border-destructive/60 bg-destructive/5"
                      : uploadedDoc
                      ? "border-emerald-200 bg-emerald-50/20"
                      : "border-[#E8E2D9] hover:border-[#D5CABE]",
                  )}
                >
                  {/* Top Row: Document Name and Requirement Badge */}
                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-[#251605] truncate">{docType.name}</span>
                    </div>
                    {docType.required ? (
                      <span className="shrink-0 rounded-[3px] border border-[#D4A138] bg-[#FDF9EE] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#A07018] uppercase">
                        <span className="sr-only">Required for Create</span>
                        REQUIRED
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-[3px] border border-[#E5DFD5] bg-[#F7F5F0] px-2 py-0.5 text-[10px] font-medium tracking-wider text-[#8A8175] uppercase">
                        OPTIONAL
                      </span>
                    )}
                  </div>

                  {docError && (
                    <div className="px-4 pb-2 text-[11px] text-destructive">
                      {docError}
                    </div>
                  )}

                  {/* Divider line */}
                  <div className="border-t border-[#F0EBE1]" />

                  {/* Bottom Row: Upload Action and Supported Formats */}
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[#FAF8F5]/30">
                    <input
                      type="file"
                      ref={(el) => {
                        fileInputRefs.current[docType.id] = el;
                      }}
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleDocumentUpload(docType.id, file);
                        }
                      }}
                    />

                    {uploadedDoc ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                        <FileText className="size-3.5 text-emerald-700 shrink-0 hidden" />
                        <span className="truncate max-w-[130px] sm:max-w-[170px] text-xs font-medium text-emerald-800">
                          {uploadedDoc.fileName}
                        </span>
                        {uploadedDoc.fileSize ? (
                          <span className="text-[10px] text-[#756A5B] shrink-0">
                            ({(uploadedDoc.fileSize / 1024).toFixed(0)} KB)
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => fileInputRefs.current[docType.id]?.click()}
                          className="h-6 px-1.5 text-[11px] text-[#251605] hover:bg-stone-100"
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(docType.id)}
                          className="h-6 px-1 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[docType.id]?.click()}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8A641A] hover:text-[#6D4E13] transition-colors"
                      >
                        <Upload className="size-3.5 text-[#8A641A]" />
                        <span>Upload File</span>
                      </button>
                    )}

                    <span className="text-[11px] font-normal text-[#A39A8E] shrink-0">
                      PDF, PNG, JPG
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 5: Contract Notes */}
      <section className="rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
        <div className="border-b border-[#E8E4DC] pb-3">
          <h2 className="font-display text-base font-semibold text-[#251605]">Section 5 — Contract Notes</h2>
          <p className="text-xs text-[#756A5B]">
            Internal commercial clauses, rate caveats, or renegotiation notes.
          </p>
        </div>

        <Field
          label="Contract Notes"
          required={isReq("COMPANY_CONTRACT_NOTES", false)}
          error={fieldError("contractNotes", "contracts")}
          helper="Internal notes or special contract clauses."
        >
          <Textarea
            value={contract?.notes || ""}
            onChange={(e) => setContract("notes", e.target.value)}
            className="min-h-[80px] rounded-none border-[#CCCCCC] bg-white text-xs text-[#251605]"
            placeholder="Enter any internal contract notes, special billing exceptions, or agreed clauses..."
          />
        </Field>
      </section>
    </div>
  );
}
