import { useEffect, useState } from "react";
import { AlertCircle, CreditCard, FileText, Receipt, ShieldCheck } from "lucide-react";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  COMPANY_BILLING_TIMINGS,
  COMPANY_CREDIT_STATUSES,
  type CompanyBillingTiming,
  type CompanyCreditStatus,
  type GuestCompanyCreateDraft,
  type GuestCompanyCreateStepId,
} from "@/packages/pms/lib/guest-company-create-workspace";
import type { CompanyBillingCreditCreateConfig } from "@/packages/pms/lib/guest-company-create.functions";

const PRESET_DAYS = [7, 15, 30, 45, 60, 90] as const;

export interface CompanyBillingStepProps {
  draft: GuestCompanyCreateDraft;
  set: <K extends keyof GuestCompanyCreateDraft>(key: K, value: GuestCompanyCreateDraft[K]) => void;
  config?: CompanyBillingCreditCreateConfig | null;
  creditAllowed?: boolean;
  fieldError: (key: string, stepId?: GuestCompanyCreateStepId) => string | undefined;
  isLoadingConfig?: boolean;
}

export function CompanyBillingStep({
  draft,
  set,
  config,
  creditAllowed = true,
  fieldError,
  isLoadingConfig = false,
}: CompanyBillingStepProps) {
  // Derive presets or custom for Credit Days
  const currentDays = draft.creditDays;
  const isPresetDays = currentDays !== null && (PRESET_DAYS as readonly number[]).includes(currentDays);
  const [daysMode, setDaysMode] = useState<"preset" | "custom">(() => {
    if (currentDays === null || currentDays === undefined) return "preset";
    return isPresetDays ? "preset" : "custom";
  });

  // Preselect defaults when config is loaded
  useEffect(() => {
    if (!config) return;

    // 1. Default Billing Rule
    if (!draft.defaultBillingRuleId && config.billingRules.length > 0) {
      const defaultRule = config.billingRules.find((r) => r.isDefault) ?? config.billingRules[0];
      if (defaultRule) {
        set("defaultBillingRuleId", defaultRule.id);
      }
    }

    // 2. Billing Currency default
    if (!draft.billingCurrencyCode) {
      const baseCurr = config.baseCurrency || config.currencies.find((c) => c.isBase)?.code || "ETB";
      if (baseCurr) {
        set("billingCurrencyCode", baseCurr);
      }
    }
  }, [config, draft.defaultBillingRuleId, draft.billingCurrencyCode, set]);

  // When creditAllowed is false, ensure creditAccountEnabled stays false
  useEffect(() => {
    if (creditAllowed === false && draft.creditAccountEnabled) {
      set("creditAccountEnabled", false);
    }
  }, [creditAllowed, draft.creditAccountEnabled, set]);

  const selectedBillingRule = config?.billingRules.find((r) => r.id === draft.defaultBillingRuleId);
  const selectedExemptionRule = config?.taxExemptionRules.find((r) => r.id === draft.taxExemptionRuleId);
  const isDocRequiredForExemption = Boolean(selectedExemptionRule?.documentationRequired);

  const isCustomOtherRule = Boolean(
    selectedBillingRule &&
      (selectedBillingRule.systemCode === "custom_other" ||
        selectedBillingRule.code.toLowerCase() === "custom_other"),
  );
  const isDirectBillRule = Boolean(
    selectedBillingRule &&
      (selectedBillingRule.systemCode === "direct_bill_city_ledger" ||
        selectedBillingRule.code.toLowerCase().includes("city_ledger")),
  );
  const isSplitBillingRule = Boolean(
    selectedBillingRule &&
      (selectedBillingRule.systemCode === "split_billing" ||
        selectedBillingRule.code.toLowerCase().includes("split")),
  );

  return (
    <div className="space-y-5" data-testid="company-billing-step">
      {isLoadingConfig && (
        <div className="rounded-none border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-[#756A5B]">
          Loading billing configuration from Settings…
        </div>
      )}

      {/* SECTION 1: Billing Configuration */}
      <section
        className="space-y-4 rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="billing-configuration-section"
      >
        <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2.5">
          <Receipt className="size-4 text-[#8A641A]" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#251605]">1. Billing Configuration</h2>
            <p className="text-[11px] text-[#756A5B]">
              Establish authoritative company settlement defaults and responsibility.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Default Billing Rule * */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#251605]">
              Default Billing Rule <span className="text-destructive">*</span>
            </Label>
            <Select
              value={draft.defaultBillingRuleId ?? ""}
              onValueChange={(val) => set("defaultBillingRuleId", val || null)}
            >
              <SelectTrigger
                className={cn(
                  "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                  fieldError("defaultBillingRuleId", "billing") && "border-destructive",
                )}
                data-testid="default-billing-rule-select"
              >
                <SelectValue placeholder="Select billing rule…" />
              </SelectTrigger>
              <SelectContent>
                {(config?.billingRules ?? []).map((rule) => (
                  <SelectItem key={rule.id} value={rule.id} className="text-xs">
                    <span className="font-medium text-[#251605]">{rule.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("defaultBillingRuleId", "billing") ? (
              <p className="text-[11px] text-destructive">{fieldError("defaultBillingRuleId", "billing")}</p>
            ) : selectedBillingRule ? (
              <p className="text-[10px] text-[#756A5B]">
                {selectedBillingRule.description ||
                  "Used as the company’s default billing responsibility. Folio routing integration will be applied in a later phase."}
              </p>
            ) : null}
          </div>

          {/* Preferred Settlement Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#251605]">Preferred Settlement Method</Label>
            <Select
              value={draft.defaultPaymentMethodId ?? "none"}
              onValueChange={(val) => set("defaultPaymentMethodId", val === "none" ? null : val)}
            >
              <SelectTrigger className="h-10 text-xs border-[#CCCCCC] bg-white rounded-none" data-testid="default-payment-method-select">
                <SelectValue placeholder="Select settlement method (Optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs text-[#756A5B]">
                  No preference (Prompt at settlement)
                </SelectItem>
                {(config?.paymentMethods ?? []).map((method) => (
                  <SelectItem key={method.id} value={method.id} className="text-xs">
                    {method.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[#756A5B]">
              Preferred payment tender default, not a forced cashiering block.
            </p>
          </div>

          {/* Billing Currency */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#251605]">Billing Currency</Label>
            <Select
              value={draft.billingCurrencyCode || (config?.baseCurrency ?? "ETB")}
              onValueChange={(val) => set("billingCurrencyCode", val)}
            >
              <SelectTrigger className="h-10 text-xs border-[#CCCCCC] bg-white rounded-none" data-testid="billing-currency-select">
                <SelectValue placeholder="Select currency…" />
              </SelectTrigger>
              <SelectContent>
                {(config?.currencies ?? [{ code: "ETB", isBase: true }]).map((c) => (
                  <SelectItem key={c.code} value={c.code} className="text-xs">
                    {c.code} {c.isBase ? "(Property Base Currency)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[#756A5B]">
              Company invoicing/ledger context currency. Distinct from Step 4 contract currency.
            </p>
          </div>

          {/* Payment Timing * */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#251605]">
              Payment Timing <span className="text-destructive">*</span>
            </Label>
            <Select
              value={draft.paymentTiming ?? ""}
              onValueChange={(val) => {
                const timing = val as CompanyBillingTiming;
                set("paymentTiming", timing);
                // If user chooses credit terms, encourage enabling credit facility
                if (timing === "credit_terms" && !draft.creditAccountEnabled && creditAllowed) {
                  set("creditAccountEnabled", true);
                  if (!draft.creditStatus) set("creditStatus", "pending_approval");
                  if (!draft.creditDays) set("creditDays", 30);
                }
              }}
            >
              <SelectTrigger
                className={cn(
                  "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                  fieldError("paymentTiming", "billing") && "border-destructive",
                )}
                data-testid="payment-timing-select"
              >
                <SelectValue placeholder="Select timing…" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_BILLING_TIMINGS.map((timing) => (
                  <SelectItem key={timing.id} value={timing.id} className="text-xs">
                    {timing.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("paymentTiming", "billing") ? (
              <p className="text-[11px] text-destructive">{fieldError("paymentTiming", "billing")}</p>
            ) : draft.paymentTiming === "credit_terms" && !draft.creditAccountEnabled ? (
              <p className="text-[11px] font-medium text-amber-800 flex items-center gap-1">
                <AlertCircle className="size-3" /> Enable Credit Facility to use Credit Terms.
              </p>
            ) : null}
          </div>

          {/* Direct Bill Operational Notice */}
          {isDirectBillRule && (
            <div
              className="sm:col-span-2 rounded-none border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900"
              data-testid="direct-bill-city-ledger-notice"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="size-3.5 text-blue-700" />
                Direct Bill / City Ledger Operational Status: Planned
              </div>
              <p className="mt-1 text-[11px] text-blue-800 leading-relaxed">
                Direct Bill / City Ledger records the commercial credit agreement. Automated Accounts Receivable (AR) and City Ledger posting engine will be activated in a future release. Selecting this rule does not create an operational City Ledger account or post live folios.
              </p>
            </div>
          )}

          {/* Split Billing Operational Notice */}
          {isSplitBillingRule && (
            <div
              className="sm:col-span-2 rounded-none border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900"
              data-testid="split-billing-notice"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="size-3.5 text-amber-700" />
                Split Billing: Financial Intent
              </div>
              <p className="mt-1 text-[11px] text-amber-800 leading-relaxed">
                Split Billing establishes the commercial default for shared responsibility between the company and guest. Charge-routing rules and split percentages will be applied at reservation or folio creation.
              </p>
            </div>
          )}

          {/* Custom / Other Billing Instruction */}
          {isCustomOtherRule && (
            <div
              className="sm:col-span-2 space-y-1.5 rounded-none border border-stone-200 bg-[#FAF8F5] p-3"
              data-testid="custom-billing-instruction-field"
            >
              <Label htmlFor="custom-billing-instruction" className="text-xs font-semibold text-[#251605]">
                Custom Billing Instruction (Descriptive Only)
              </Label>
              <Textarea
                id="custom-billing-instruction"
                rows={2}
                placeholder="e.g., Specific department voucher required upon arrival; charge back to regional cost center"
                value={draft.billingInstruction ?? ""}
                className="text-xs border-[#CCCCCC] bg-white resize-none rounded-none"
                onChange={(e) => set("billingInstruction", e.target.value)}
                data-testid="custom-billing-instruction-input"
              />
              <p className="text-[10px] text-[#756A5B]">
                Stored as descriptive metadata only. Does not alter system folio routing or cashiering logic.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 2: Credit Facility */}
      <section
        className="space-y-4 rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="credit-facility-section"
      >
        <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-2.5">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-[#8A641A]" />
            <div>
              <h2 className="font-display text-sm font-bold text-[#251605]">2. Credit Facility</h2>
              <p className="text-[11px] text-[#756A5B]">
                Configure approved credit account limits, settlement terms, and workflow status.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Label htmlFor="allow-credit-switch" className="text-xs font-semibold text-[#251605] cursor-pointer">
              {draft.creditAccountEnabled ? "Credit Enabled" : "Allow Credit"}
            </Label>
            <Switch
              id="allow-credit-switch"
              checked={draft.creditAccountEnabled}
              disabled={creditAllowed === false}
              onCheckedChange={(checked) => {
                set("creditAccountEnabled", checked);
                if (checked && !draft.creditStatus) {
                  set("creditStatus", "pending_approval");
                }
              }}
              data-testid="allow-credit-switch"
            />
          </div>
        </div>

        {creditAllowed === false ? (
          <div className="rounded-none border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <span className="font-semibold">Credit Facility Restricted:</span> Selected company type has credit
              accounts disallowed in Property Setup. Allow Credit is locked OFF.
            </div>
          </div>
        ) : draft.creditAccountEnabled ? (
          <div className="grid gap-4 sm:grid-cols-3 pt-1">
            {/* Credit Limit Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Limit ({draft.billingCurrencyCode || config?.baseCurrency || "ETB"})
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.creditLimitAmount ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? null : parseFloat(e.target.value);
                  set("creditLimitAmount", val);
                }}
                className={cn(
                  "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                  fieldError("creditLimitAmount", "billing") && "border-destructive",
                )}
                placeholder="0.00"
                data-testid="credit-limit-input"
              />
              {fieldError("creditLimitAmount", "billing") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditLimitAmount", "billing")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Approved ceiling. No hard AR ledger blocking in this phase.</p>
              )}
            </div>

            {/* Credit Terms / Days */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Terms / Days {draft.paymentTiming === "credit_terms" ? <span className="text-destructive">*</span> : null}
              </Label>
              {daysMode === "preset" ? (
                <div className="flex gap-1.5">
                  <Select
                    value={draft.creditDays != null && (PRESET_DAYS as readonly number[]).includes(draft.creditDays) ? String(draft.creditDays) : "30"}
                    onValueChange={(val) => {
                      if (val === "custom") {
                        setDaysMode("custom");
                      } else {
                        set("creditDays", parseInt(val, 10));
                      }
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-10 text-xs border-[#CCCCCC] bg-white flex-1 rounded-none",
                        fieldError("creditDays", "billing") && "border-destructive",
                      )}
                      data-testid="credit-days-select"
                    >
                      <SelectValue placeholder="Select terms…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_DAYS.map((days) => (
                        <SelectItem key={days} value={String(days)} className="text-xs">
                          {days} Days (Net {days})
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs font-semibold text-[#8A641A]">
                        Custom Days…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={draft.creditDays ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                      set("creditDays", val);
                    }}
                    className={cn(
                      "h-10 text-xs border-[#CCCCCC] bg-white flex-1 rounded-none",
                      fieldError("creditDays", "billing") && "border-destructive",
                    )}
                    placeholder="Enter days (e.g. 40)"
                    data-testid="custom-credit-days-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDaysMode("preset");
                      set("creditDays", 30);
                    }}
                    className="text-[11px] text-[#8A641A] hover:underline whitespace-nowrap px-1"
                  >
                    Presets
                  </button>
                </div>
              )}
              {fieldError("creditDays", "billing") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditDays", "billing")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Settlement window following invoice issuance.</p>
              )}
            </div>

            {/* Credit Status * */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Status <span className="text-destructive">*</span>
              </Label>
              <Select
                value={draft.creditStatus ?? "pending_approval"}
                onValueChange={(val) => set("creditStatus", val as CompanyCreditStatus)}
              >
                <SelectTrigger
                  className={cn(
                    "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                    fieldError("creditStatus", "billing") && "border-destructive",
                  )}
                  data-testid="credit-status-select"
                >
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_CREDIT_STATUSES.map((status) => (
                    <SelectItem key={status.id} value={status.id} className="text-xs">
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("creditStatus", "billing") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditStatus", "billing")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Workflow governance status for this facility.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#756A5B] italic">
            Credit facility is currently disabled for this company profile. Direct-bill reservations will require
            explicit manual authorization.
          </p>
        )}
      </section>

      {/* SECTION 3: Tax Exemption */}
      <section
        className="space-y-4 rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="tax-exemption-section"
      >
        <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-2.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#8A641A]" />
            <div>
              <h2 className="font-display text-sm font-bold text-[#251605]">3. Tax Exemption</h2>
              <p className="text-[11px] text-[#756A5B]">
                Capture compliance exemption certificates. Tax calculation engine enforcement is in a later phase.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Label htmlFor="tax-exempt-switch" className="text-xs font-semibold text-[#251605] cursor-pointer">
              {draft.taxExempt ? "Tax Exempt" : "Standard (Non-Exempt)"}
            </Label>
            <Switch
              id="tax-exempt-switch"
              checked={draft.taxExempt}
              onCheckedChange={(checked) => {
                set("taxExempt", checked);
                if (checked && !draft.taxExemptionRuleId && (config?.taxExemptionRules?.length ?? 0) > 0) {
                  set("taxExemptionRuleId", config!.taxExemptionRules[0].id);
                }
              }}
              data-testid="tax-exempt-switch"
            />
          </div>
        </div>

        {draft.taxExempt ? (
          <div className="grid gap-4 sm:grid-cols-3 pt-1">
            {/* Exemption Rule * */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Exemption Rule <span className="text-destructive">*</span>
              </Label>
              <Select
                value={draft.taxExemptionRuleId ?? ""}
                onValueChange={(val) => set("taxExemptionRuleId", val || null)}
              >
                <SelectTrigger
                  className={cn(
                    "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                    fieldError("taxExemptionRuleId", "billing") && "border-destructive",
                  )}
                  data-testid="tax-exemption-rule-select"
                >
                  <SelectValue placeholder="Select exemption rule…" />
                </SelectTrigger>
                <SelectContent>
                  {(config?.taxExemptionRules ?? []).map((rule) => (
                    <SelectItem key={rule.id} value={rule.id} className="text-xs">
                      <span className="font-medium text-[#251605]">{rule.name}</span>
                      {rule.reasonCategory ? (
                        <span className="ml-1.5 text-[11px] text-[#756A5B]">({rule.reasonCategory})</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("taxExemptionRuleId", "billing") ? (
                <p className="text-[11px] text-destructive">{fieldError("taxExemptionRuleId", "billing")}</p>
              ) : selectedExemptionRule?.description ? (
                <p className="text-[10px] text-[#756A5B]">{selectedExemptionRule.description}</p>
              ) : null}
            </div>

            {/* Certificate / Reference Number */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Certificate / Reference Number {isDocRequiredForExemption ? <span className="text-destructive">*</span> : null}
              </Label>
              <Input
                value={draft.taxExemptionCertificateNumber}
                onChange={(e) => set("taxExemptionCertificateNumber", e.target.value)}
                className={cn(
                  "h-10 text-xs border-[#CCCCCC] bg-white rounded-none",
                  fieldError("taxExemptionCertificateNumber", "billing") && "border-destructive",
                )}
                placeholder="e.g. MOR-EX-2026-0041"
                data-testid="tax-certificate-number-input"
              />
              {fieldError("taxExemptionCertificateNumber", "billing") ? (
                <p className="text-[11px] text-destructive">{fieldError("taxExemptionCertificateNumber", "billing")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">
                  {isDocRequiredForExemption
                    ? "Mandatory documentation required by selected exemption rule."
                    : "Official exemption waiver reference if provided."}
                </p>
              )}
            </div>

            {/* Valid Until */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">Valid Until</Label>
              <Input
                type="date"
                value={draft.taxExemptionValidTo ?? ""}
                onChange={(e) => set("taxExemptionValidTo", e.target.value || null)}
                className="h-10 text-xs border-[#CCCCCC] bg-white rounded-none"
                data-testid="tax-valid-until-input"
              />
              <p className="text-[10px] text-[#756A5B]">Optional expiration date of certificate.</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#756A5B] italic">
            Standard taxation applies to all folios. No tax exemption certificates are registered.
          </p>
        )}
      </section>

      {/* SECTION 4: Billing Notes & Instructions */}
      <section
        className="space-y-3 rounded-none border border-[#DDD4C5] bg-white p-5 shadow-sm"
        data-testid="billing-notes-section"
      >
        <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2.5">
          <FileText className="size-4 text-[#8A641A]" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#251605]">4. Billing Notes & Instructions</h2>
            <p className="text-[11px] text-[#756A5B]">
              Operational notes displayed to front desk and cashiering staff during check-in or checkout.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Textarea
            value={draft.billingInstruction}
            onChange={(e) => set("billingInstruction", e.target.value)}
            className="w-full rounded-none border border-[#CCCCCC] bg-white p-3 text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]"
            rows={3}
            placeholder="e.g. Room charges billed to company master; all incidentals and minibar payable directly by guest upon checkout."
            data-testid="billing-instructions-textarea"
          />
          <p className="text-[10px] text-[#756A5B]">
            Persisted directly to company master billing instructions.
          </p>
        </div>
      </section>
    </div>
  );
}
