import { useState, useMemo, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  FileCheck,
  FileText,
  Info,
  Layers,
  Percent,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
} from "lucide-react";

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
import type {
  GuestTravelAgentCreateDraft,
  GuestTravelAgentCreateStepId,
  CommissionRuleDraft,
  AgencyRateDefaultDraft,
  ContractedRateDraft,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import type { TravelAgencyCommissionRatesConfig } from "@/packages/pms/lib/guest-travel-agency-step3-commission-rates.server";

const CONTROL_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

const SELECT_TRIGGER_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between";

const TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE]";

function StepField({
  label,
  required: isRequired,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className={cn("text-xs font-semibold text-[#251605]", error && "text-destructive")}>
          {label}
          {isRequired ? " *" : ""}
        </Label>
        {hint && <span className="text-[11px] text-[#8A7E70]">{hint}</span>}
      </div>
      <div className={error ? "[&_input]:border-destructive [&_button]:border-destructive [&_textarea]:border-destructive" : undefined}>
        {children}
      </div>
      {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
    </div>
  );
}

export function GuestTravelAgencyCommissionRatesStep({
  draft,
  set,
  config,
  fieldError,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(key: K, value: GuestTravelAgentCreateDraft[K]) => void;
  config?: TravelAgencyCommissionRatesConfig;
  fieldError: (key: string, stepId?: GuestTravelAgentCreateStepId) => string | undefined;
}) {
  const roomTypes = config?.roomTypes ?? [];
  const ratePlans = config?.ratePlans ?? [];
  const rateCategories = config?.rateCategories ?? [];
  const currencies = config?.currencies ?? [];
  const baseCurrency = config?.baseCurrency ?? "ETB";

  const activeCurrency = draft.commissionCurrency || draft.netCurrencyCode || baseCurrency;
  const isCommissionable = draft.commercialModel === "commissionable" && draft.commissionEnabled !== false;
  const defaultType = draft.commissionType || draft.allCommissionType;
  const defaultValue = draft.commissionValue || draft.allCommissionValue;

  // Filter rate plans by room type for any given row
  const getRatePlansForRoomType = (roomTypeId: string | null) => {
    if (!roomTypeId) return [];
    return ratePlans.filter((p) => p.roomTypeId === roomTypeId && p.active !== false);
  };

  return (
    <div className="space-y-5" data-testid="travel-agency-step3-commission-rates">
      {/* 1. Commercial Model Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">1. Commercial Model *</h2>
          <p className="text-xs text-[#756A5B]">
            Define how the hotel commercially rewards or sells rooms to this Travel Agency.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Commissionable Option Card */}
          <button
            type="button"
            data-testid="commercial-model-commissionable"
            onClick={() => {
              set("commercialModel", "commissionable");
              set("commissionEnabled", true);
            }}
            className={cn(
              "flex flex-col text-left rounded-xl border p-4 transition-all",
              draft.commercialModel === "commissionable"
                ? "border-[#C89933] bg-[#FDFBF7] ring-1 ring-[#C89933]"
                : "border-[#E6E1D8] bg-white hover:border-[#C89933]/50",
            )}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-semibold text-[#251605] flex items-center gap-1.5">
                <Percent className="size-3.5 text-[#C89933]" />
                Commissionable
              </span>
              <span
                className={cn(
                  "size-4 rounded-full border flex items-center justify-center text-[10px]",
                  draft.commercialModel === "commissionable"
                    ? "border-[#C89933] bg-[#C89933] text-white"
                    : "border-[#CCCCCC]",
                )}
              >
                {draft.commercialModel === "commissionable" && "✓"}
              </span>
            </div>
            <p className="text-[11px] text-[#756A5B] leading-relaxed">
              The agency books hotel selling rates and earns post-stay commission from the hotel.
            </p>
          </button>

          {/* Net Rate Option Card */}
          <button
            type="button"
            data-testid="commercial-model-net-rate"
            onClick={() => {
              set("commercialModel", "net_rate");
              set("commissionEnabled", false);
            }}
            className={cn(
              "flex flex-col text-left rounded-xl border p-4 transition-all",
              draft.commercialModel === "net_rate"
                ? "border-[#C89933] bg-[#FDFBF7] ring-1 ring-[#C89933]"
                : "border-[#E6E1D8] bg-white hover:border-[#C89933]/50",
            )}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-xs font-semibold text-[#251605] flex items-center gap-1.5">
                <Tag className="size-3.5 text-[#8A641A]" />
                Net Rate
              </span>
              <span
                className={cn(
                  "size-4 rounded-full border flex items-center justify-center text-[10px]",
                  draft.commercialModel === "net_rate"
                    ? "border-[#C89933] bg-[#C89933] text-white"
                    : "border-[#CCCCCC]",
                )}
              >
                {draft.commercialModel === "net_rate" && "✓"}
              </span>
            </div>
            <p className="text-[11px] text-[#756A5B] leading-relaxed">
              The agency receives a confidential wholesale rate. Margin is earned externally without hotel commission.
            </p>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COMMISSIONABLE MODEL SECTIONS                                             */}
      {/* ========================================================================= */}
      {draft.commercialModel === "commissionable" ? (
        <>
          {/* 2. Commission Setup */}
          <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
            <div className="border-b border-[#EDE6D8] pb-3">
              <h2 className="text-sm font-semibold text-[#251605]">2. Commission Setup</h2>
              <p className="text-xs text-[#756A5B]">
                Specify currency, validity period, and commercial remarks for this commission plan.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StepField
                label="Commission Currency"
                required
                error={fieldError("commissionCurrency", "commission_rates")}
              >
                <Select
                  value={draft.commissionCurrency || baseCurrency}
                  onValueChange={(val) => set("commissionCurrency", val)}
                >
                  <SelectTrigger className={SELECT_TRIGGER_CLASS} data-testid="commission-currency-select">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} {c.isBase ? "(Base Property Currency)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </StepField>

              <StepField
                label="Effective From"
                required
                error={fieldError("commissionEffectiveOn", "commission_rates")}
              >
                <Input
                  type="date"
                  data-testid="commission-effective-on"
                  value={draft.commissionEffectiveOn || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => set("commissionEffectiveOn", e.target.value)}
                  className={CONTROL_CLASS}
                />
              </StepField>

              <StepField
                label="Expires On"
                hint="Optional window end"
                error={fieldError("commissionExpiresOn", "commission_rates")}
              >
                <Input
                  type="date"
                  data-testid="commission-expires-on"
                  value={draft.commissionExpiresOn}
                  onChange={(e) => set("commissionExpiresOn", e.target.value)}
                  className={CONTROL_CLASS}
                />
              </StepField>
            </div>

            {/* Read-Only Commission Basis Callout */}
            <div className="rounded-lg border border-[#EDE6D8] bg-[#FAF8F5] p-3.5 flex items-start gap-3">
              <Info className="size-4 text-[#8A641A] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#251605]">Commission Basis: Room Subtotal</p>
                <p className="text-xs text-[#756A5B] mt-0.5">
                  Calculated from Room Subtotal excluding taxes/fees.
                </p>
              </div>
            </div>

            <StepField label="Commission Notes" hint="Agency-specific remarks">
              <Textarea
                data-testid="commission-notes"
                value={draft.commissionNotes}
                onChange={(e) => set("commissionNotes", e.target.value)}
                className={TEXTAREA_CLASS}
                rows={2}
                placeholder="Specific commercial remarks or contract terms..."
              />
            </StepField>
          </div>

          {/* 3. Commission Application Rules */}
          <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
            <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#251605]">3. Commission Application Rules</h2>
                <p className="text-xs text-[#756A5B]">
                  Configure whether commission applies to all bookings or varies by Room Type and Rate Plan.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-[#EDE6D8] bg-[#FAF8F5] p-0.5 text-xs">
                <button
                  type="button"
                  data-testid="commission-apply-mode-all"
                  onClick={() => set("commissionApplicationMode", "all")}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition-colors",
                    draft.commissionApplicationMode === "all"
                      ? "bg-white text-[#251605] shadow-xs font-semibold"
                      : "text-[#756A5B] hover:text-[#251605]",
                  )}
                >
                  Apply to All
                </button>
                <button
                  type="button"
                  data-testid="commission-apply-mode-specific"
                  onClick={() => set("commissionApplicationMode", "specific")}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition-colors",
                    draft.commissionApplicationMode === "specific"
                      ? "bg-white text-[#251605] shadow-xs font-semibold"
                      : "text-[#756A5B] hover:text-[#251605]",
                  )}
                >
                  Specific Setup
                </button>
              </div>
            </div>

            {/* Apply To All Mode */}
            {draft.commissionApplicationMode === "all" ? (
              <div className="rounded-xl border border-[#E6E1D8] bg-[#FAF8F5]/60 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StepField label="Commission Type" required>
                    <Select
                      value={draft.allCommissionType}
                      onValueChange={(val: "percent" | "fixed") => {
                        set("allCommissionType", val);
                        set("commissionType", val);
                      }}
                    >
                      <SelectTrigger className={SELECT_TRIGGER_CLASS} data-testid="all-commission-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed Amount ({activeCurrency})</SelectItem>
                      </SelectContent>
                    </Select>
                  </StepField>

                  <StepField
                    label="Commission Value"
                    required
                    error={fieldError("commissionValue", "commission_rates")}
                  >
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={draft.allCommissionType === "percent" ? 100 : undefined}
                        step="any"
                        data-testid="all-commission-value-input"
                        value={draft.allCommissionValue}
                        onChange={(e) => {
                          set("allCommissionValue", e.target.value);
                          set("commissionValue", e.target.value);
                          // Sync to top rule
                          const updated = [...(draft.commissionRules || [])];
                          if (updated[0]) {
                            updated[0] = {
                              ...updated[0],
                              commissionType: draft.allCommissionType,
                              commissionValue: e.target.value,
                              scopeType: "all",
                            };
                            set("commissionRules", updated);
                          }
                        }}
                        className={CONTROL_CLASS}
                        placeholder={draft.allCommissionType === "percent" ? "10.00" : "250.00"}
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-[#8A7E70] font-medium pointer-events-none">
                        {draft.allCommissionType === "percent" ? "%" : activeCurrency}
                      </span>
                    </div>
                  </StepField>
                </div>

                {draft.allCommissionType === "fixed" && (
                  <p className="text-[11px] text-[#8A641A] font-medium">
                    Applied once per reservation/stay when this rule matches.
                  </p>
                )}
                <p className="text-[11px] text-[#756A5B]">
                  This rate will be applied to every eligible reservation booked by this agency.
                </p>
              </div>
            ) : (
              /* Specific Setup Dynamic Rule Table */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#8A641A]">
                    Rule Precedence: Rate Plan &gt; Room Type &gt; All Fallback
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="add-commission-rule-btn"
                    onClick={() => {
                      const newRule: CommissionRuleDraft = {
                        scopeType: "room_type",
                        roomTypeId: roomTypes[0]?.id ?? null,
                        ratePlanId: null,
                        commissionType: "percent",
                        commissionValue: "10",
                      };
                      set("commissionRules", [...(draft.commissionRules || []), newRule]);
                    }}
                    className="h-8 border-[#C89933]/60 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
                  >
                    <Plus className="mr-1 size-3.5" /> Add Rule
                  </Button>
                </div>

                {fieldError("commissionRules", "commission_rates") && (
                  <p className="text-[11px] text-destructive font-medium">
                    {fieldError("commissionRules", "commission_rates")}
                  </p>
                )}

                <div className="overflow-x-auto rounded-lg border border-[#EDE6D8]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#FAF8F5] text-[#756A5B] font-semibold border-b border-[#EDE6D8]">
                      <tr>
                        <th className="px-3 py-2.5">Apply To</th>
                        <th className="px-3 py-2.5">Room Type</th>
                        <th className="px-3 py-2.5">Rate Plan</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Value</th>
                        <th className="px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE6D8] bg-white">
                      {(draft.commissionRules || []).map((rule, idx) => {
                        const availablePlans = getRatePlansForRoomType(rule.roomTypeId);

                        return (
                          <tr key={idx} className="hover:bg-[#FAF8F5]/40 transition-colors">
                            <td className="px-3 py-2">
                              <Select
                                value={rule.scopeType}
                                onValueChange={(val: "all" | "room_type" | "rate_plan") => {
                                  const updated = [...draft.commissionRules];
                                  updated[idx] = {
                                    ...rule,
                                    scopeType: val,
                                    roomTypeId: val === "all" ? null : rule.roomTypeId || roomTypes[0]?.id || null,
                                    ratePlanId: val === "rate_plan" ? availablePlans[0]?.id || null : null,
                                  };
                                  set("commissionRules", updated);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Default / All</SelectItem>
                                  <SelectItem value="room_type">Room Type</SelectItem>
                                  <SelectItem value="rate_plan">Rate Plan</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>

                            <td className="px-3 py-2">
                              {rule.scopeType === "all" ? (
                                <span className="text-[#8A7E70] italic">All Room Types</span>
                              ) : (
                                <Select
                                  value={rule.roomTypeId || ""}
                                  onValueChange={(val) => {
                                    const nextPlans = getRatePlansForRoomType(val);
                                    const updated = [...draft.commissionRules];
                                    updated[idx] = {
                                      ...rule,
                                      roomTypeId: val,
                                      ratePlanId: rule.scopeType === "rate_plan" ? nextPlans[0]?.id || null : null,
                                    };
                                    set("commissionRules", updated);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs min-w-[130px]">
                                    <SelectValue placeholder="Select Room" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {roomTypes.map((rt) => (
                                      <SelectItem key={rt.id} value={rt.id}>
                                        {rt.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>

                            <td className="px-3 py-2">
                              {rule.scopeType === "rate_plan" ? (
                                <Select
                                  value={rule.ratePlanId || ""}
                                  onValueChange={(val) => {
                                    const updated = [...draft.commissionRules];
                                    updated[idx] = { ...rule, ratePlanId: val };
                                    set("commissionRules", updated);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs min-w-[140px]">
                                    <SelectValue placeholder="Select Plan" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availablePlans.map((rp) => (
                                      <SelectItem key={rp.id} value={rp.id}>
                                        {rp.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-[#8A7E70] italic">All Rate Plans</span>
                              )}
                            </td>

                            <td className="px-3 py-2">
                              <Select
                                value={rule.commissionType}
                                onValueChange={(val: "percent" | "fixed") => {
                                  const updated = [...draft.commissionRules];
                                  updated[idx] = { ...rule, commissionType: val };
                                  set("commissionRules", updated);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percent">%</SelectItem>
                                  <SelectItem value="fixed">Fixed</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>

                            <td className="px-3 py-2">
                              <div className="relative w-24">
                                <Input
                                  type="number"
                                  min={0}
                                  max={rule.commissionType === "percent" ? 100 : undefined}
                                  step="any"
                                  value={rule.commissionValue}
                                  onChange={(e) => {
                                    const updated = [...draft.commissionRules];
                                    updated[idx] = { ...rule, commissionValue: e.target.value };
                                    set("commissionRules", updated);
                                  }}
                                  className="h-8 text-xs pr-6"
                                  placeholder="0.00"
                                />
                                <span className="absolute right-2 top-2 text-[10px] text-[#8A7E70] pointer-events-none">
                                  {rule.commissionType === "percent" ? "%" : activeCurrency}
                                </span>
                              </div>
                            </td>

                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  set(
                                    "commissionRules",
                                    draft.commissionRules.filter((_, i) => i !== idx),
                                  );
                                }}
                                className="size-7 text-[#756A5B] hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ========================================================================= */
        /* NET RATE PRICING SECTIONS                                                */
        /* ========================================================================= */
        <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
          <div className="border-b border-[#EDE6D8] pb-3">
            <h2 className="text-sm font-semibold text-[#251605]">Agency Net Rate Pricing</h2>
            <p className="text-xs text-[#756A5B]">
              Configure negotiated confidential pricing method, wholesale rates, and agreement validity.
            </p>
          </div>

          {/* Pricing Method Selection */}
          <StepField label="Pricing Method" required error={fieldError("netPricingMethod", "commission_rates")}>
            <Select
              value={draft.netPricingMethod || "rate_plan"}
              onValueChange={(val: "rate_plan" | "rate_plan_discount" | "contracted_rates") =>
                set("netPricingMethod", val)
              }
            >
              <SelectTrigger className={SELECT_TRIGGER_CLASS} data-testid="net-pricing-method-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rate_plan" data-testid="net-method-rate-plan">Use Existing Rate Plan</SelectItem>
                <SelectItem value="rate_plan_discount" data-testid="net-method-discount">Discount From Rate Plan</SelectItem>
                <SelectItem value="contracted_rates" data-testid="net-method-contracted">Contracted Room Rates</SelectItem>
              </SelectContent>
            </Select>
          </StepField>

          {/* Method A: Use Existing Rate Plan */}
          {draft.netPricingMethod === "rate_plan" && (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#FAF8F5]/60 p-4 grid gap-3 sm:grid-cols-2">
              <StepField label="Room Type" required>
                <Select
                  value={draft.netRoomTypeId || ""}
                  onValueChange={(val) => {
                    set("netRoomTypeId", val);
                    const plans = getRatePlansForRoomType(val);
                    set("netRatePlanId", plans[0]?.id || "");
                  }}
                >
                  <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Select Room Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </StepField>

              <StepField label="Net Rate Plan" required>
                <Select
                  value={draft.netRatePlanId || ""}
                  onValueChange={(val) => set("netRatePlanId", val)}
                  disabled={!draft.netRoomTypeId}
                >
                  <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Select Rate Plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {getRatePlansForRoomType(draft.netRoomTypeId).map((rp) => (
                      <SelectItem key={rp.id} value={rp.id}>
                        {rp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </StepField>
            </div>
          )}

          {/* Method B: Discount From Rate Plan */}
          {draft.netPricingMethod === "rate_plan_discount" && (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#FAF8F5]/60 p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <StepField label="Room Type" required>
                  <Select
                    value={draft.netRoomTypeId || ""}
                    onValueChange={(val) => {
                      set("netRoomTypeId", val);
                      const plans = getRatePlansForRoomType(val);
                      set("netRatePlanId", plans[0]?.id || "");
                    }}
                  >
                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Select Room Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </StepField>

                <StepField label="Base Rate Plan" required>
                  <Select
                    value={draft.netRatePlanId || ""}
                    onValueChange={(val) => set("netRatePlanId", val)}
                    disabled={!draft.netRoomTypeId}
                  >
                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="Select Base Plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {getRatePlansForRoomType(draft.netRoomTypeId).map((rp) => (
                        <SelectItem key={rp.id} value={rp.id}>
                          {rp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </StepField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <StepField label="Discount Type" required>
                  <Select
                    value={draft.netDiscountType || "percent"}
                    onValueChange={(val: "percent" | "fixed") => set("netDiscountType", val)}
                  >
                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ({activeCurrency})</SelectItem>
                    </SelectContent>
                  </Select>
                </StepField>

                <StepField label="Discount Value" required>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={draft.netDiscountValue}
                      onChange={(e) => set("netDiscountValue", e.target.value)}
                      className={CONTROL_CLASS}
                      placeholder={draft.netDiscountType === "percent" ? "15.00" : "100.00"}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-[#8A7E70] font-medium pointer-events-none">
                      {draft.netDiscountType === "percent" ? "%" : activeCurrency}
                    </span>
                  </div>
                </StepField>
              </div>
            </div>
          )}

          {/* Method C: Contracted Room Rates */}
          {draft.netPricingMethod === "contracted_rates" && (
            <div className="rounded-xl border border-[#EDE6D8] bg-[#FAF8F5]/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#251605]">Per-Room Fixed Wholesale Rates</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const firstAvailableRoom = roomTypes.find(
                      (rt) => !draft.contractedRates?.some((cr) => cr.roomTypeId === rt.id),
                    ) || roomTypes[0];
                    if (!firstAvailableRoom) return;
                    set("contractedRates", [
                      ...(draft.contractedRates || []),
                      { roomTypeId: firstAvailableRoom.id, amount: "1500" },
                    ]);
                  }}
                  className="h-8 border-[#C89933]/60 text-xs text-[#8A641A] hover:bg-[#FAF8F5]"
                >
                  <Plus className="mr-1 size-3.5" /> Add Room Type Rate
                </Button>
              </div>

              {fieldError("contractedRates", "commission_rates") && (
                <p className="text-[11px] text-destructive font-medium">
                  {fieldError("contractedRates", "commission_rates")}
                </p>
              )}

              <div className="space-y-2">
                {(draft.contractedRates || []).map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-[#EDE6D8] bg-white p-3"
                  >
                    <div className="flex-1">
                      <Select
                        value={row.roomTypeId}
                        onValueChange={(val) => {
                          const updated = [...draft.contractedRates];
                          updated[idx] = { ...row, roomTypeId: val };
                          set("contractedRates", updated);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select Room" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomTypes.map((rt) => (
                            <SelectItem key={rt.id} value={rt.id}>
                              {rt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="relative w-36">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={row.amount}
                        onChange={(e) => {
                          const updated = [...draft.contractedRates];
                          updated[idx] = { ...row, amount: e.target.value };
                          set("contractedRates", updated);
                        }}
                        className="h-8 text-xs pr-10"
                        placeholder="0.00"
                      />
                      <span className="absolute right-2 top-2 text-[10px] text-[#8A7E70] pointer-events-none">
                        {activeCurrency}
                      </span>
                    </div>

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        set(
                          "contractedRates",
                          draft.contractedRates.filter((_, i) => i !== idx),
                        );
                      }}
                      className="size-7 text-[#756A5B] hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Net Rate Validity & Currency */}
          <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-[#EDE6D8]">
            <StepField label="Valid From" required error={fieldError("netValidFrom", "commission_rates")}>
              <Input
                type="date"
                value={draft.netValidFrom || new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("netValidFrom", e.target.value)}
                className={CONTROL_CLASS}
              />
            </StepField>

            <StepField label="Valid Until" required error={fieldError("netValidUntil", "commission_rates")}>
              <Input
                type="date"
                value={draft.netValidUntil}
                onChange={(e) => set("netValidUntil", e.target.value)}
                className={CONTROL_CLASS}
              />
            </StepField>

            <StepField label="Settlement Currency" required error={fieldError("netCurrencyCode", "commission_rates")}>
              <Select
                value={draft.netCurrencyCode || baseCurrency}
                onValueChange={(val) => set("netCurrencyCode", val)}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </StepField>
          </div>
        </div>
      )}

      {/* 5. Commercial Notes */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <h2 className="text-sm font-semibold text-[#251605]">Commercial Notes</h2>
          <p className="text-xs text-[#756A5B]">
            Broader commercial terms, sales manager remarks, or contract clauses.
          </p>
        </div>

        <Textarea
          data-testid="commercial-notes-input"
          value={draft.commercialNotes}
          onChange={(e) => set("commercialNotes", e.target.value)}
          className={TEXTAREA_CLASS}
          rows={3}
          placeholder="Enter commercial relationship notes, distribution remarks..."
        />
      </div>
    </div>
  );
}

/**
 * Right-side Commercial Summary Panel component.
 */
export function CommercialSummaryPanel({
  draft,
  config,
}: {
  draft: GuestTravelAgentCreateDraft;
  config?: TravelAgencyCommissionRatesConfig;
}) {
  const roomTypes = config?.roomTypes ?? [];
  const ratePlans = config?.ratePlans ?? [];
  const baseCurrency = config?.baseCurrency ?? "ETB";
  const currency = draft.commissionCurrency || draft.netCurrencyCode || baseCurrency;

  return (
    <div
      data-testid="commercial-summary-panel"
      className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none space-y-4"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider border-b border-[#EDE6D8] pb-2.5">
        <Coins className="size-3.5" />
        <span>Commercial Summary</span>
      </div>

      <div className="space-y-3 text-xs">
        <div>
          <span className="text-[11px] text-[#8A7E70] block">Commercial Model</span>
          <span className="font-semibold text-[#251605] capitalize">
            {draft.commercialModel === "net_rate" ? "Net Rate (Confidential Wholesale)" : "Commissionable"}
          </span>
        </div>

        {draft.commercialModel === "commissionable" ? (
          <>
            <div>
              <span className="text-[11px] text-[#8A7E70] block">Commission Currency & Basis</span>
              <span className="font-medium text-[#251605]">
                {currency} — Room revenue excl. taxes & fees
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#8A7E70] block">Validity</span>
              <span className="text-[#251605]">
                {draft.commissionEffectiveOn || "Today"} {draft.commissionExpiresOn ? `to ${draft.commissionExpiresOn}` : "(Indefinite)"}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#8A7E70] block mb-1">Commission Rules</span>
              {draft.commissionApplicationMode === "all" ? (
                <div className="rounded-md bg-[#FAF8F5] p-2 text-xs font-medium text-[#251605]">
                  Default / All Bookings → {draft.allCommissionValue || "10"}
                  {draft.allCommissionType === "percent" ? "%" : " " + currency}
                </div>
              ) : (
                <div className="space-y-1">
                  {(draft.commissionRules || []).map((rule, i) => {
                    const roomName = roomTypes.find((r) => r.id === rule.roomTypeId)?.name || "All Rooms";
                    const planName = ratePlans.find((p) => p.id === rule.ratePlanId)?.name || "All Plans";
                    const target =
                      rule.scopeType === "all"
                        ? "Default / All"
                        : rule.scopeType === "room_type"
                          ? roomName
                          : `${roomName} / ${planName}`;
                    return (
                      <div key={i} className="rounded-md bg-[#FAF8F5] px-2 py-1 flex justify-between text-[11px]">
                        <span className="text-[#756A5B] truncate max-w-[170px]">{target}</span>
                        <span className="font-semibold text-[#251605]">
                          {rule.commissionValue}
                          {rule.commissionType === "percent" ? "%" : " " + currency}
                        </span>
                      </div>
                    );
                  })}
                  {(!draft.commissionRules || draft.commissionRules.length === 0) && (
                    <span className="text-[#A0988A] italic">No rules defined</span>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Net Rate Summary */
          <>
            <div>
              <span className="text-[11px] text-[#8A7E70] block">Pricing Method</span>
              <span className="font-semibold text-[#251605] capitalize">
                {draft.netPricingMethod === "rate_plan"
                  ? "Use Existing Rate Plan"
                  : draft.netPricingMethod === "rate_plan_discount"
                    ? "Discount From Rate Plan"
                    : "Contracted Room Rates"}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#8A7E70] block">Validity</span>
              <span className="text-[#251605]">
                {draft.netValidFrom || "Today"} {draft.netValidUntil ? `to ${draft.netValidUntil}` : ""}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#8A7E70] block">Currency</span>
              <span className="font-semibold text-[#251605]">{currency}</span>
            </div>

            {draft.netPricingMethod === "contracted_rates" && (
              <div>
                <span className="text-[11px] text-[#8A7E70] block mb-1">Contracted Rates</span>
                <div className="space-y-1">
                  {(draft.contractedRates || []).map((row, i) => {
                    const room = roomTypes.find((r) => r.id === row.roomTypeId)?.name || "Room";
                    return (
                      <div key={i} className="text-[11px] flex justify-between text-[#251605]">
                        <span className="text-[#756A5B]">{room}:</span>
                        <span className="font-medium">
                          {row.amount} {currency}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {draft.commercialNotes && (
          <div className="pt-2 border-t border-[#EDE6D8]">
            <span className="text-[11px] text-[#8A7E70] block">Commercial Remarks</span>
            <p className="text-[11px] text-[#251605] line-clamp-3">{draft.commercialNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
