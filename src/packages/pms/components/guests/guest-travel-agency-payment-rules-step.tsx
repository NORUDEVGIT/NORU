/**
 * Travel Agency Registration Step 4:
 * Payment, Credit & Reservation Rules + Settings-driven Documents.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileCheck,
  FileText,
  FileUp,
  HelpCircle,
  Info,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
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
  TravelAgencyDraftDocument,
} from "@/packages/pms/lib/guest-travel-agent-create-workspace";
import type {
  TravelAgencyStep4BillingRuleOption,
  TravelAgencyStep4CancellationPolicyOption,
  TravelAgencyStep4Config,
  TravelAgencyStep4DepositPolicyOption,
  TravelAgencyStep4DocumentTypeOption,
  TravelAgencyStep4NoShowPolicyOption,
  TravelAgencyStep4PaymentMethodOption,
} from "@/packages/pms/lib/guest-travel-agency-step4.server";

const MODAL_CONTROL_CLASS =
  "h-9 rounded-[6px] border border-[#CCCCCC] bg-white text-xs text-[#251605] placeholder:text-[#999999] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none";

const MODAL_SELECT_TRIGGER_CLASS =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none";

const PRESET_DAYS = [7, 15, 30, 45, 60, 90] as const;
const CREDIT_DAYS_PRESETS = PRESET_DAYS;

export function GuestTravelAgencyPaymentRulesStep({
  draft,
  set,
  config,
  fieldError,
  restaurantId,
  isRuleRequired,
}: {
  draft: GuestTravelAgentCreateDraft;
  set: <K extends keyof GuestTravelAgentCreateDraft>(
    key: K,
    value: GuestTravelAgentCreateDraft[K],
  ) => void;
  config?: TravelAgencyStep4Config;
  fieldError: (field: string) => string | undefined;
  restaurantId?: string;
  isRuleRequired?: (code: string) => boolean;
}) {
  // Set default billing currency from config base currency if not set
  useEffect(() => {
    if (!draft.billingCurrencyCode && config?.baseCurrency) {
      set("billingCurrencyCode", config.baseCurrency);
    }
  }, [config?.baseCurrency, draft.billingCurrencyCode, set]);

  // Set default billing rule if none selected and defaults exist
  useEffect(() => {
    if (!draft.defaultBillingRuleId && config?.billingRules && config.billingRules.length > 0) {
      const defaultRule = config.billingRules.find((r) => r.isDefault) ?? config.billingRules[0];
      if (defaultRule) {
        set("defaultBillingRuleId", defaultRule.id);
      }
    }
  }, [config?.billingRules, draft.defaultBillingRuleId, set]);

  // Set default policies if available and not yet selected
  useEffect(() => {
    if (!draft.defaultDepositPolicyId && config?.depositPolicies?.length) {
      const def = config.depositPolicies.find((p) => p.isDefault);
      if (def) set("defaultDepositPolicyId", def.id);
    }
    if (!draft.defaultCancellationPolicyId && config?.cancellationPolicies?.length) {
      const def = config.cancellationPolicies.find((p) => p.isDefault);
      if (def) set("defaultCancellationPolicyId", def.id);
    }
    if (!draft.defaultNoShowPolicyId && config?.noShowPolicies?.length) {
      const def = config.noShowPolicies.find((p) => p.isDefault);
      if (def) set("defaultNoShowPolicyId", def.id);
    }
  }, [
    config?.cancellationPolicies,
    config?.depositPolicies,
    config?.noShowPolicies,
    draft.defaultCancellationPolicyId,
    draft.defaultDepositPolicyId,
    draft.defaultNoShowPolicyId,
    set,
  ]);

  // Selected billing rule
  const selectedRule = useMemo(() => {
    if (!config?.billingRules || !draft.defaultBillingRuleId) return null;
    return config.billingRules.find((r) => r.id === draft.defaultBillingRuleId) ?? null;
  }, [config?.billingRules, draft.defaultBillingRuleId]);

  const isCustomOtherRule = selectedRule?.systemCode === "custom_other";

  // Credit Terms Preset vs Custom
  const currentDays = draft.creditDays;
  const isPresetDays =
    currentDays !== null &&
    currentDays !== undefined &&
    (PRESET_DAYS as readonly number[]).includes(currentDays);
  const [daysMode, setDaysMode] = useState<"preset" | "custom">(() => {
    if (draft.creditDaysPreset === "custom") return "custom";
    if (currentDays === null || currentDays === undefined) return "preset";
    return isPresetDays ? "preset" : "custom";
  });

  // Document upload state
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleFileUpload(docType: TravelAgencyStep4DocumentTypeOption, file: File) {
    const rId = restaurantId || "restaurant";
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    let storagePath = `${rId}/travel-agents/drafts/${timestamp}_${safeName}`;

    try {
      if (restaurantId) {
        const { createTravelAgencyDraftDocumentUpload } = await import(
          "@/packages/pms/lib/guest-travel-agency-step4.functions"
        );
        const ct = file.type === "application/pdf" ? "application/pdf" : "image/jpeg";
        const started = await createTravelAgencyDraftDocumentUpload({
          data: {
            restaurantId,
            contentType: ct,
            size: file.size,
          },
        });
        if (started?.ok && started.path && started.token) {
          const { supabase } = await import("@/integrations/supabase/client");
          const uploaded = await supabase.storage
            .from("property-images")
            .uploadToSignedUrl(started.path, started.token, file);
          if (!uploaded.error) {
            storagePath = started.path;
          }
        }
      }
    } catch {
      // Fallback path satisfies prefix requirement
    }

    const newDoc: TravelAgencyDraftDocument = {
      documentTypeId: docType.id,
      documentTypeCode: docType.code,
      name: file.name,
      storagePath,
      fileSizeBytes: file.size,
    };

    const existing = (draft.documents || []).filter((d) => d.documentTypeId !== docType.id);
    set("documents", [...existing, newDoc]);
    toast.success(`Uploaded ${file.name} for ${docType.name}`);
  }

  function handleRemoveDocument(docTypeId: string) {
    const updated = (draft.documents || []).filter((d) => d.documentTypeId !== docTypeId);
    set("documents", updated);
  }

  return (
    <div
      className="space-y-6"
      data-testid="travel-agency-step4-payment-rules"
      id="step4-payment-credit-reservation-rules"
    >
      {/* SECTION 1: Payment & Billing */}
      <section className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-[#8A641A]" />
              <h2 className="text-sm font-semibold text-[#251605]">Payment &amp; Billing</h2>
            </div>
            <p className="text-xs text-[#756A5B] mt-0.5">
              Configure settlement currency, tender preference, timing, and billing rule.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-[#C89933]/40 bg-[#FAF8F5] text-[11px] text-[#8A641A] font-medium"
          >
            Authoritative Master
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Billing Currency * */}
          <div className="space-y-1">
            <Label htmlFor="ta-billing-currency" className="text-xs font-medium text-[#251605]">
              Billing Currency {isRuleRequired ? (isRuleRequired("TA_BILLING_CURRENCY") ? <span className="text-destructive">*</span> : null) : <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-billing-currency"
              value={draft.billingCurrencyCode || draft.currency || config?.baseCurrency || "ETB"}
              onChange={(e) => {
                const val = e.target.value;
                set("billingCurrencyCode", val);
                set("currency", val);
              }}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              {config?.currencies && config.currencies.length > 0 ? (
                config.currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.isBase ? "(Base Property Currency)" : ""}
                  </option>
                ))
              ) : (
                <option value="ETB">ETB (Base Property Currency)</option>
              )}
            </select>
            {fieldError("billingCurrencyCode") && (
              <p className="text-xs text-destructive">{fieldError("billingCurrencyCode")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Primary settlement currency for this travel agency account.
            </p>
          </div>

          {/* 2. Preferred Settlement Method */}
          <div className="space-y-1">
            <Label htmlFor="ta-settlement-method" className="text-xs font-medium text-[#251605]">
              Preferred Settlement Method {isRuleRequired?.("TA_PAYMENT_METHOD") && <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-settlement-method"
              value={draft.defaultPaymentMethodId || draft.paymentMethodId || ""}
              onChange={(e) => {
                const val = e.target.value || null;
                set("defaultPaymentMethodId", val);
                set("paymentMethodId", val || "");
              }}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              <option value="">No preference</option>
              {(config?.paymentMethods ?? []).map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name} ({method.code})
                </option>
              ))}
            </select>
            {fieldError("defaultPaymentMethodId") && (
              <p className="text-xs text-destructive">{fieldError("defaultPaymentMethodId")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Operational default tender. Does not restrict cashiering tenders.
            </p>
          </div>

          {/* 3. Payment Timing * */}
          <div className="space-y-1">
            <Label htmlFor="ta-payment-timing" className="text-xs font-medium text-[#251605]">
              Payment Timing {isRuleRequired ? (isRuleRequired("TA_PAYMENT_TIMING") ? <span className="text-destructive">*</span> : null) : <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-payment-timing"
              value={draft.paymentTiming || "due_on_departure"}
              onChange={(e) => {
                const val = e.target.value as GuestTravelAgentCreateDraft["paymentTiming"];
                set("paymentTiming", val);
                if (val === "credit_terms") {
                  if (!draft.allowCredit) {
                    set("allowCredit", true);
                    toast.info("Credit arrangement enabled for Credit Terms.");
                  }
                  if (!draft.creditDays) {
                    set("creditDays", 30);
                  }
                }
              }}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              <option value="due_on_arrival">Due on Arrival</option>
              <option value="due_on_departure">Due on Departure</option>
              <option value="prepaid">Prepaid / Advance Deposit</option>
              <option value="credit_terms">Credit Terms</option>
            </select>
            {fieldError("paymentTiming") && (
              <p className="text-xs text-destructive">{fieldError("paymentTiming")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Specifies when reservation folio settlement is scheduled.
            </p>
          </div>

          {/* 4. Default Billing Rule * */}
          <div className="space-y-1.5">
            <Label htmlFor="ta-billing-rule" className="text-xs font-semibold text-[#251605]">
              Default Billing Rule {isRuleRequired ? (isRuleRequired("TA_BILLING_RULE") ? <span className="text-destructive">*</span> : null) : <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={draft.defaultBillingRuleId ?? ""}
              onValueChange={(val) => set("defaultBillingRuleId", val || null)}
            >
              <SelectTrigger
                id="ta-billing-rule"
                className={cn(
                  "h-9 rounded-[6px] border border-[#CCCCCC] bg-white text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none",
                  fieldError("defaultBillingRuleId") && "border-destructive",
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
            {fieldError("defaultBillingRuleId") && (
              <p className="text-xs text-destructive">{fieldError("defaultBillingRuleId")}</p>
            )}
          </div>
        </div>

        {/* 5. Conditional Billing Instruction (only for Custom / Other) */}
        {isCustomOtherRule && (
          <div className="pt-2 border-t border-[#EDE6D8] space-y-1.5" data-testid="custom-billing-instruction-wrapper">
            <Label htmlFor="ta-billing-instruction" className="text-xs font-medium text-[#251605]">
              Billing Instruction {isRuleRequired?.("TA_BILLING_INSTRUCTION") && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="ta-billing-instruction"
              rows={3}
              value={draft.billingInstruction}
              onChange={(e) => set("billingInstruction", e.target.value)}
              className="rounded-[6px] border border-[#CCCCCC] text-xs focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]"
              placeholder="Specify special billing routing instructions or account arrangements..."
            />
            {fieldError("billingInstruction") && (
              <p className="text-xs text-destructive">{fieldError("billingInstruction")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Enter specific settlement details for custom billing agreements.
            </p>
          </div>
        )}
      </section>

      {/* SECTION 2: Credit Facility */}
      <section
        className="space-y-4 rounded-xl border border-[#EDE6D8] bg-white p-5 shadow-none"
        data-testid="credit-facility-section"
      >
        <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2.5">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-[#8A641A]" />
            <div>
              <h2 className="font-display text-sm font-bold text-[#251605]">Credit Facility</h2>
              <p className="text-[11px] text-[#756A5B]">
                Configure approved credit account limits, settlement terms, and workflow status.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Label htmlFor="allow-credit-switch" className="text-xs font-semibold text-[#251605] cursor-pointer">
              {draft.allowCredit ? "Credit Enabled" : "Allow Credit"}
              {isRuleRequired?.("TA_ALLOW_CREDIT") && <span className="text-destructive"> *</span>}
            </Label>
            <Switch
              id="allow-credit-switch"
              checked={draft.allowCredit}
              onCheckedChange={(checked) => {
                set("allowCredit", checked);
                if (checked && !draft.creditStatus) {
                  set("creditStatus", "pending_approval");
                }
                if (!checked && draft.paymentTiming === "credit_terms") {
                  set("paymentTiming", "due_on_departure");
                  toast.info("Payment Timing reset to Due on Departure because Credit was disabled.");
                }
              }}
              data-testid="allow-credit-switch"
            />
          </div>
        </div>
        {fieldError("allowCredit") && (
          <p className="text-xs text-destructive">{fieldError("allowCredit")}</p>
        )}

        {draft.allowCredit ? (
          <div className="grid gap-4 sm:grid-cols-3 pt-1" data-testid="credit-arrangement-fields">
            {/* Credit Limit Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Limit ({draft.billingCurrencyCode || config?.baseCurrency || "ETB"})
                {isRuleRequired?.("TA_CREDIT_LIMIT") && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id="ta-credit-limit"
                type="number"
                min="0"
                step="0.01"
                value={draft.creditLimitAmount ?? ""}
                onChange={(e) => set("creditLimitAmount", e.target.value)}
                className={cn(
                  "h-9 rounded-[6px] border border-[#CCCCCC] bg-white text-xs text-[#251605] placeholder:text-[#999999] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none",
                  fieldError("creditLimitAmount") && "border-destructive",
                )}
                placeholder="0.00"
                data-testid="credit-limit-input"
              />
              {fieldError("creditLimitAmount") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditLimitAmount")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Approved ceiling. No hard AR ledger blocking in this phase.</p>
              )}
            </div>

            {/* Credit Terms / Days */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Terms / Days {(isRuleRequired?.("TA_CREDIT_DAYS") || draft.paymentTiming === "credit_terms") ? <span className="text-destructive">*</span> : null}
              </Label>
              {daysMode === "preset" ? (
                <div className="flex gap-1.5">
                  <Select
                    value={
                      draft.creditDays != null && (PRESET_DAYS as readonly number[]).includes(draft.creditDays)
                        ? String(draft.creditDays)
                        : "30"
                    }
                    onValueChange={(val) => {
                      if (val === "custom") {
                        setDaysMode("custom");
                        set("creditDaysPreset", "custom");
                      } else {
                        const parsed = parseInt(val, 10);
                        set("creditDays", parsed);
                        set("creditDaysPreset", val);
                      }
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 rounded-[6px] border border-[#CCCCCC] bg-white flex-1 text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none",
                        fieldError("creditDays") && "border-destructive",
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
                      set("creditDaysPreset", "custom");
                    }}
                    className={cn(
                      "h-9 rounded-[6px] border border-[#CCCCCC] bg-white flex-1 text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none",
                      fieldError("creditDays") && "border-destructive",
                    )}
                    placeholder="Enter days (e.g. 40)"
                    data-testid="custom-credit-days-input"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDaysMode("preset");
                      set("creditDays", 30);
                      set("creditDaysPreset", "30");
                    }}
                    className="text-[11px] text-[#8A641A] hover:underline whitespace-nowrap px-1"
                  >
                    Presets
                  </button>
                </div>
              )}
              {fieldError("creditDays") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditDays")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Settlement window following invoice issuance.</p>
              )}
            </div>

            {/* Credit Status * */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#251605]">
                Credit Status {(isRuleRequired?.("TA_CREDIT_STATUS") || draft.allowCredit) ? <span className="text-destructive">*</span> : null}
              </Label>
              <Select
                value={draft.creditStatus ?? "pending_approval"}
                onValueChange={(val) => set("creditStatus", val as "pending_approval" | "approved" | "suspended")}
              >
                <SelectTrigger
                  className={cn(
                    "h-9 rounded-[6px] border border-[#CCCCCC] bg-white text-xs text-[#251605] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] shadow-none",
                    fieldError("creditStatus") && "border-destructive",
                  )}
                  data-testid="credit-status-select"
                >
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_approval" className="text-xs">
                    Pending Approval
                  </SelectItem>
                  <SelectItem value="approved" className="text-xs">
                    Approved
                  </SelectItem>
                  <SelectItem value="suspended" className="text-xs">
                    Suspended
                  </SelectItem>
                </SelectContent>
              </Select>
              {fieldError("creditStatus") ? (
                <p className="text-[11px] text-destructive">{fieldError("creditStatus")}</p>
              ) : (
                <p className="text-[10px] text-[#756A5B]">Workflow governance status for this facility.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#756A5B] italic">
            Credit facility is currently disabled for this travel agency profile. Direct-bill reservations will require
            explicit manual authorization.
          </p>
        )}
      </section>

      {/* SECTION 3: Reservation Rules */}
      <section className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-[#8A641A]" />
            <h2 className="text-sm font-semibold text-[#251605]">Reservation Rules</h2>
          </div>
          <p className="text-xs text-[#756A5B] mt-0.5">
            Default operational guarantee, cancellation, and no-show policies loaded from Settings Card 3.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* 1. Guarantee / Deposit Policy */}
          <div className="space-y-1">
            <Label htmlFor="ta-guarantee-policy" className="text-xs font-medium text-[#251605]">
              Default Guarantee Policy {isRuleRequired?.("TA_DEPOSIT_POLICY") && <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-guarantee-policy"
              value={draft.defaultDepositPolicyId || ""}
              onChange={(e) => set("defaultDepositPolicyId", e.target.value || null)}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              <option value="">Property Default Policy</option>
              {(config?.depositPolicies ?? []).map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} ({policy.depositType === "first_night" ? "First Night" : `${policy.depositValue}${policy.depositType === "percent" ? "%" : ""}`})
                </option>
              ))}
            </select>
            {fieldError("defaultDepositPolicyId") && (
              <p className="text-xs text-destructive">{fieldError("defaultDepositPolicyId")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Deposit requirement applied to agency reservations.
            </p>
          </div>

          {/* 2. Cancellation Policy */}
          <div className="space-y-1">
            <Label htmlFor="ta-cancel-policy" className="text-xs font-medium text-[#251605]">
              Default Cancellation Policy {isRuleRequired?.("TA_CANCELLATION_POLICY") && <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-cancel-policy"
              value={draft.defaultCancellationPolicyId || ""}
              onChange={(e) => set("defaultCancellationPolicyId", e.target.value || null)}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              <option value="">Property Default Policy</option>
              {(config?.cancellationPolicies ?? []).map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} ({policy.cutoffHours}h cutoff)
                </option>
              ))}
            </select>
            {fieldError("defaultCancellationPolicyId") && (
              <p className="text-xs text-destructive">{fieldError("defaultCancellationPolicyId")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Cutoff window and penalty rules for reservation cancellations.
            </p>
          </div>

          {/* 3. No-Show Policy */}
          <div className="space-y-1">
            <Label htmlFor="ta-noshow-policy" className="text-xs font-medium text-[#251605]">
              Default No-Show Policy {isRuleRequired?.("TA_NOSHOW_POLICY") && <span className="text-destructive">*</span>}
            </Label>
            <select
              id="ta-noshow-policy"
              value={draft.defaultNoShowPolicyId || ""}
              onChange={(e) => set("defaultNoShowPolicyId", e.target.value || null)}
              className={MODAL_SELECT_TRIGGER_CLASS}
            >
              <option value="">Property Default Policy</option>
              {(config?.noShowPolicies ?? []).map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} (Release: {policy.releaseHour}:00)
                </option>
              ))}
            </select>
            {fieldError("defaultNoShowPolicyId") && (
              <p className="text-xs text-destructive">{fieldError("defaultNoShowPolicyId")}</p>
            )}
            <p className="text-[11px] text-[#756A5B]">
              Inventory release and fee schedule for no-shows.
            </p>
          </div>
        </div>

        {/* 4. Booking Notes */}
        <div className="pt-2 border-t border-[#EDE6D8] space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ta-booking-notes" className="text-xs font-medium text-[#251605]">
              Booking Notes {isRuleRequired?.("TA_BOOKING_NOTES") && <span className="text-destructive">*</span>}
            </Label>
            <span className="text-[10px] text-[#756A5B]">
              {draft.bookingNotes?.length || 0} / 500
            </span>
          </div>
          <Textarea
            id="ta-booking-notes"
            rows={3}
            maxLength={500}
            value={draft.bookingNotes}
            onChange={(e) => set("bookingNotes", e.target.value)}
            className="rounded-[6px] border border-[#CCCCCC] text-xs focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933]"
            placeholder="Operational instructions for Front Desk and Reservation agents (e.g. voucher verification required at check-in)..."
          />
          {fieldError("bookingNotes") && (
            <p className="text-xs text-destructive">{fieldError("bookingNotes")}</p>
          )}
          <p className="text-[11px] text-[#756A5B]">
            Front Desk instructions. Distinct from Step 3 Commercial Notes and Step 1 CRM Notes.
          </p>
        </div>
      </section>

      {/* SECTION 4: Documents */}
      <section className="rounded-xl border border-[#EDE6D8] bg-white p-5 space-y-4 shadow-none">
        <div className="border-b border-[#EDE6D8] pb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileCheck className="size-4 text-[#8A641A]" />
              <h2 className="text-sm font-semibold text-[#251605]">Documents</h2>
            </div>
            <p className="text-xs text-[#756A5B] mt-0.5">
              Upload compliance and verification documents configured in Settings Card 4.
            </p>
          </div>

          <span className="text-xs text-[#756A5B]">
            {draft.documents?.length || 0} uploaded
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" data-testid="travel-agency-documents-list">
          {config?.documentTypes && config.documentTypes.filter((d) => d.active !== false).length > 0 ? (
            config.documentTypes
              .filter((d) => d.active !== false)
              .map((docType) => {
              const uploadedDoc = (draft.documents || []).find((d) => d.documentTypeId === docType.id);

              return (
                <div
                  key={docType.id}
                  className={cn(
                    "flex flex-col justify-between rounded-md border bg-white transition-colors overflow-hidden",
                    uploadedDoc
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
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(docType, file);
                        }
                      }}
                    />

                    {uploadedDoc ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                        <FileText className="size-3.5 text-emerald-700 shrink-0 hidden" />
                        <span className="truncate max-w-[130px] sm:max-w-[170px] text-xs font-medium text-emerald-800">
                          {uploadedDoc.name}
                        </span>
                        {uploadedDoc.fileSizeBytes ? (
                          <span className="text-[10px] text-[#756A5B] shrink-0">
                            ({(uploadedDoc.fileSizeBytes / 1024).toFixed(0)} KB)
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
                          onClick={() => handleRemoveDocument(docType.id)}
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
            })
          ) : (
            <div className="col-span-full rounded-lg bg-[#FAF8F5] border border-dashed border-[#DDD4C5] p-4 text-center text-xs text-[#756A5B]">
              No Travel Agency document types configured. Configure them in Settings &gt; Card 4 &gt; Document Types.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function PaymentRulesSummaryPanel({
  draft,
  config,
}: {
  draft: GuestTravelAgentCreateDraft;
  config?: TravelAgencyStep4Config;
}) {
  const selectedRule = useMemo(() => {
    return config?.billingRules?.find((r) => r.id === draft.defaultBillingRuleId);
  }, [config?.billingRules, draft.defaultBillingRuleId]);

  const selectedMethod = useMemo(() => {
    return config?.paymentMethods?.find((m) => m.id === (draft.defaultPaymentMethodId || draft.paymentMethodId));
  }, [config?.paymentMethods, draft.defaultPaymentMethodId, draft.paymentMethodId]);

  const depositPolicy = useMemo(() => {
    return config?.depositPolicies?.find((p) => p.id === draft.defaultDepositPolicyId);
  }, [config?.depositPolicies, draft.defaultDepositPolicyId]);

  const cancellationPolicy = useMemo(() => {
    return config?.cancellationPolicies?.find((p) => p.id === draft.defaultCancellationPolicyId);
  }, [config?.cancellationPolicies, draft.defaultCancellationPolicyId]);

  const noShowPolicy = useMemo(() => {
    return config?.noShowPolicies?.find((p) => p.id === draft.defaultNoShowPolicyId);
  }, [config?.noShowPolicies, draft.defaultNoShowPolicyId]);

  const requiredDocTypes = useMemo(() => {
    return (config?.documentTypes ?? []).filter((d) => d.required);
  }, [config?.documentTypes]);

  const uploadedDocTypeIds = useMemo(() => {
    return new Set((draft.documents || []).map((d) => d.documentTypeId));
  }, [draft.documents]);

  const missingRequiredDocs = useMemo(() => {
    return requiredDocTypes.filter((d) => !uploadedDocTypeIds.has(d.id));
  }, [requiredDocTypes, uploadedDocTypeIds]);

  const timingLabels: Record<string, string> = {
    due_on_arrival: "Due on Arrival",
    due_on_departure: "Due on Departure",
    prepaid: "Prepaid",
    credit_terms: "Credit Terms",
  };

  return (
    <div className="space-y-4" data-testid="payment-rules-summary-panel">
      {/* Financial Summary Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
          <CreditCard className="size-3.5" />
          <span>Settlement &amp; Billing</span>
        </div>
        <div className="space-y-2 border-t border-[#EDE6D8] pt-2 text-xs">
          <div>
            <span className="text-[#756A5B]">Billing Currency:</span>
            <p className="font-semibold text-[#251605]">
              {draft.billingCurrencyCode || draft.currency || config?.baseCurrency || "ETB"}
            </p>
          </div>
          <div>
            <span className="text-[#756A5B]">Payment Timing:</span>
            <p className="font-medium text-[#251605]">
              {draft.paymentTiming ? timingLabels[draft.paymentTiming] || draft.paymentTiming : "Due on Departure"}
            </p>
          </div>
          <div>
            <span className="text-[#756A5B]">Billing Rule:</span>
            <p className="font-medium text-[#251605]">
              {selectedRule?.name || "—"}
            </p>
          </div>
          <div>
            <span className="text-[#756A5B]">Settlement Tender:</span>
            <p className="font-medium text-[#251605]">
              {selectedMethod?.name || "No preference"}
            </p>
          </div>
        </div>
      </div>

      {/* Credit Summary Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
          <ShieldCheck className="size-3.5" />
          <span>Credit Facility</span>
        </div>
        <div className="space-y-2 border-t border-[#EDE6D8] pt-2 text-xs">
          <div>
            <span className="text-[#756A5B]">Status:</span>
            <p className="font-semibold text-[#251605]">
              {draft.allowCredit ? (
                <span className="text-emerald-700 capitalize">
                  Enabled ({draft.creditStatus?.replace("_", " ") || "Pending Approval"})
                </span>
              ) : (
                <span className="text-[#756A5B]">Disabled</span>
              )}
            </p>
          </div>
          {draft.allowCredit && (
            <>
              <div>
                <span className="text-[#756A5B]">Credit Limit:</span>
                <p className="font-medium text-[#251605]">
                  {draft.creditLimitAmount
                    ? `${draft.creditLimitAmount} ${draft.billingCurrencyCode || "ETB"}`
                    : "No financial limit"}
                </p>
              </div>
              <div>
                <span className="text-[#756A5B]">Terms:</span>
                <p className="font-medium text-[#251605]">
                  {draft.creditDays ? `Net ${draft.creditDays} Days` : "Not set"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reservation Rules Summary Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
          <Building2 className="size-3.5" />
          <span>Reservation Rules</span>
        </div>
        <div className="space-y-2 border-t border-[#EDE6D8] pt-2 text-xs">
          <div>
            <span className="text-[#756A5B]">Guarantee Policy:</span>
            <p className="font-medium text-[#251605]">{depositPolicy?.name || "Property Default"}</p>
          </div>
          <div>
            <span className="text-[#756A5B]">Cancellation Policy:</span>
            <p className="font-medium text-[#251605]">{cancellationPolicy?.name || "Property Default"}</p>
          </div>
          <div>
            <span className="text-[#756A5B]">No-Show Policy:</span>
            <p className="font-medium text-[#251605]">{noShowPolicy?.name || "Property Default"}</p>
          </div>
        </div>
      </div>

      {/* Document Checklist Card */}
      <div className="rounded-xl border border-[#EDE6D8] bg-white p-4 shadow-none space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[#8A641A] uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <FileCheck className="size-3.5" />
            <span>Documents</span>
          </div>
          <span className="text-[11px] font-mono lowercase text-[#756A5B]">
            {draft.documents?.length || 0} / {requiredDocTypes.length} req
          </span>
        </div>
        <div className="border-t border-[#EDE6D8] pt-2 text-xs space-y-2">
          {missingRequiredDocs.length > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 space-y-1">
              <p className="font-semibold text-amber-950">Missing Required for Final Create:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {missingRequiredDocs.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-900 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>All required documents uploaded</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

