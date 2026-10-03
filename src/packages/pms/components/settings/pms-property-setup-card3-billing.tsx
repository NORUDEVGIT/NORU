import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3Section,
  Card3StatusDot,
  useCard3DraftSave,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getBillingCard3,
  saveBillingRuleCard3,
  saveInvoiceSettingsCard3,
} from "@/packages/pms/lib/billing-card3.functions";
import {
  BILLING_PAYER_KIND_LABELS,
  BILLING_PAYER_KINDS,
  CANONICAL_BILLING_RULES,
  CARD3_BILLING_TABS,
  INVOICE_FORMAT_LABELS,
  INVOICE_FORMATS,
  INVOICE_TAX_DISPLAY_LABELS,
  INVOICE_TAX_DISPLAYS,
  type BillingPayerKind,
  type BillingRuleCard3Row,
  type BillingCard3Snapshot,
  type CanonicalBillingRuleCode,
  type InvoiceFormat,
  type InvoiceTaxDisplay,
} from "@/packages/pms/lib/billing-card3.server";

const goldFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2";

type InvoiceSettingsInput = {
  restaurantId: string;
  prefix: string;
  startingNumber: number;
  numberPadding: number;
  taxDisplay: InvoiceTaxDisplay;
  invoiceFormat: InvoiceFormat;
};

type BillingRuleInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  payerKind: BillingPayerKind;
  splitGuestPercent?: number | null;
  paymentTerms?: string;
  isDefault: boolean;
  active: boolean;
};

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

export function PmsPropertySetupCard3Billing({
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
  const load = useServerFn(getBillingCard3);
  const saveSettings = useServerFn(saveInvoiceSettingsCard3);
  const saveRule = useServerFn(saveBillingRuleCard3);
  const [search, setSearch] = useState("");
  const [ruleDraft, setRuleDraft] = useState<BillingRuleCard3Row | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-billing", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: BillingCard3Snapshot | undefined = query.data?.snapshot;
  const inherited = snapshot?.inherited;
  const billingRules = useMemo(() => snapshot?.billingRules ?? [], [snapshot?.billingRules]);
  const filteredRules = useMemo(
    () =>
      billingRules.filter((row) =>
        matchesQuery(
          search,
          row.code,
          row.name,
          row.description,
          row.payerKindLabel,
          row.paymentTerms,
        ),
      ),
    [billingRules, search],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-billing", restaurantId] });
  }

  const settingsMutation = useMutation({
    mutationFn: (input: InvoiceSettingsInput) => saveSettings({ data: input }),
    onSuccess: () => {
      toast.success("Invoice settings saved.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const ruleMutation = useMutation({
    mutationFn: (input: BillingRuleInput) => saveRule({ data: input }),
    onSuccess: () => {
      toast.success("Billing rule saved.");
      setRuleDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  void CARD3_BILLING_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading billing and invoicing…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Billing & Invoicing are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-billing">
          <Card3InheritedStrip>
            Legal identity, branding, VAT, and base currency are inherited from Card 1. Taxes and
            payment methods stay on earlier Card 3 domains. City ledger is out of this workspace.
            This configuration makes no reservation or folio operational changes.
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inherited from Card 1 · legal entity
                </dt>
                <dd className="text-[#251605]">{inherited?.legalEntityName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inherited from Card 1 · legal name
                </dt>
                <dd className="text-[#251605]">{inherited?.legalName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inherited from Card 1 · trading name
                </dt>
                <dd className="text-[#251605]">{inherited?.tradingName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inherited from Card 1 · VAT
                </dt>
                <dd className="text-[#251605]">
                  {inherited?.vatRegistered
                    ? inherited.vatNumber || "Registered"
                    : inherited?.vatNumber || "Not registered"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inherited from Card 1 · currency
                </dt>
                <dd className="text-[#251605]">{inherited?.currencyCode || "—"}</dd>
              </div>
            </dl>
          </Card3InheritedStrip>

          <Card3Section title="Invoice settings" icon="document">
            <InvoiceSettingsForm
              key={
                snapshot.invoiceSettings
                  ? `${snapshot.invoiceSettings.prefix}-${snapshot.invoiceSettings.startingNumber}`
                  : "invoice-settings-empty"
              }
              canEdit={canEdit}
              currencyCode={inherited?.currencyCode ?? ""}
              value={snapshot.invoiceSettings}
              pending={settingsMutation.isPending}
              onSave={(payload) => settingsMutation.mutate({ restaurantId, ...payload })}
            />
          </Card3Section>

          <Card3ListSection
            title="Billing rules"
            icon="document"
            search={search}
            onSearch={setSearch}
            placeholder="Search billing rules"
            canEdit={canEdit}
            addLabel="Add billing rule"
            onAdd={() => setRuleDraft("new")}
            columns={["Code", "Name", "Payer", "Guest %", "Payment terms", "Default", "Status"]}
            empty="No billing rules saved yet."
            rows={filteredRules.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.payerKindLabel,
                row.splitGuestPercent == null ? "—" : `${row.splitGuestPercent}%`,
                row.paymentTerms || "—",
                row.isDefault ? "Default" : "—",
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setRuleDraft(row),
            }))}
          />

          <BillingRuleSheet
            key={ruleDraft === "new" ? "rule-new" : (ruleDraft?.id ?? "rule-closed")}
            open={ruleDraft !== null}
            canEdit={canEdit}
            value={ruleDraft === "new" || ruleDraft === null ? null : ruleDraft}
            pending={ruleMutation.isPending}
            onClose={() => setRuleDraft(null)}
            onSave={(payload) => ruleMutation.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function InvoiceSettingsForm({
  canEdit,
  currencyCode,
  value,
  pending,
  onSave,
}: {
  canEdit: boolean;
  currencyCode: string;
  value: BillingCard3Snapshot["invoiceSettings"];
  pending: boolean;
  onSave: (payload: {
    prefix: string;
    startingNumber: number;
    numberPadding: number;
    taxDisplay: InvoiceTaxDisplay;
    invoiceFormat: InvoiceFormat;
  }) => void;
}) {
  const [prefix, setPrefix] = useState(value?.prefix ?? "INV");
  const [startingNumber, setStartingNumber] = useState(String(value?.startingNumber ?? 1));
  const [numberPadding, setNumberPadding] = useState(String(value?.numberPadding ?? 6));
  const [taxDisplay, setTaxDisplay] = useState<InvoiceTaxDisplay>(value?.taxDisplay ?? "exclusive");
  const [invoiceFormat, setInvoiceFormat] = useState<InvoiceFormat>(
    value?.invoiceFormat ?? "standard",
  );
  const payload = useMemo(
    () => ({
      prefix,
      startingNumber: Number(startingNumber),
      numberPadding: Number(numberPadding),
      taxDisplay,
      invoiceFormat,
    }),
    [prefix, startingNumber, numberPadding, taxDisplay, invoiceFormat],
  );
  const dirty =
    prefix !== (value?.prefix ?? "INV") ||
    Number(startingNumber) !== (value?.startingNumber ?? 1) ||
    Number(numberPadding) !== (value?.numberPadding ?? 6) ||
    taxDisplay !== (value?.taxDisplay ?? "exclusive") ||
    invoiceFormat !== (value?.invoiceFormat ?? "standard");
  useCard3DraftSave(
    useMemo(
      () =>
        canEdit
          ? {
              dirty,
              pending,
              save: () => onSave(payload),
            }
          : null,
      [canEdit, dirty, pending, onSave, payload],
    ),
  );

  return (
    <form
      className="max-w-lg space-y-3 rounded-2xl border border-border bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        onSave(payload);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Setup numbering only. Amounts display in Card 1 currency {currencyCode || "—"}. Branding is
        not stored here.
      </p>
      <div className="space-y-1">
        <Label htmlFor="invoice-prefix">Prefix</Label>
        <Input
          id="invoice-prefix"
          value={prefix}
          maxLength={12}
          disabled={!canEdit}
          className={goldFocus}
          onChange={(event) => setPrefix(event.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-start">Starting number</Label>
        <Input
          id="invoice-start"
          type="number"
          min={1}
          value={startingNumber}
          disabled={!canEdit}
          className={goldFocus}
          onChange={(event) => setStartingNumber(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-padding">Number padding</Label>
        <Input
          id="invoice-padding"
          type="number"
          min={1}
          max={12}
          value={numberPadding}
          disabled={!canEdit}
          className={goldFocus}
          onChange={(event) => setNumberPadding(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-tax-display">Tax display</Label>
        <Select
          value={taxDisplay}
          onValueChange={(next) => setTaxDisplay(next as InvoiceTaxDisplay)}
          disabled={!canEdit}
        >
          <SelectTrigger id="invoice-tax-display" className={goldFocus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVOICE_TAX_DISPLAYS.map((item) => (
              <SelectItem key={item} value={item}>
                {INVOICE_TAX_DISPLAY_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="invoice-format">Invoice format</Label>
        <Select
          value={invoiceFormat}
          onValueChange={(next) => setInvoiceFormat(next as InvoiceFormat)}
          disabled={!canEdit}
        >
          <SelectTrigger id="invoice-format" className={goldFocus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVOICE_FORMATS.map((item) => (
              <SelectItem key={item} value={item}>
                {INVOICE_FORMAT_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canEdit ? (
        <Button
          type="submit"
          disabled={pending}
          className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
        >
          Save invoice settings
        </Button>
      ) : null}
    </form>
  );
}

function ActiveField({
  id,
  label,
  checked,
  canEdit,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <Label htmlFor={id}>{label}</Label>
      <Switch
        id={id}
        checked={checked}
        disabled={!canEdit}
        onCheckedChange={onChange}
        className={goldFocus}
      />
    </div>
  );
}

const PROFILE_TYPE_OPTIONS = [
  { id: "company", label: "Company" },
  { id: "travel_agent", label: "Travel Agent" },
  { id: "group", label: "Group" },
  { id: "individual", label: "Individual" },
] as const;

function BillingRuleSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: BillingRuleCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    systemCode?: string | null;
    name: string;
    description?: string;
    payerKind: BillingPayerKind;
    splitGuestPercent?: number | null;
    paymentTerms?: string;
    isDefault: boolean;
    active: boolean;
    isSystem?: boolean;
    applicableProfileTypes?: string[];
  }) => void;
}) {
  const initialCanonical = useMemo(() => {
    if (value?.systemCode) {
      return CANONICAL_BILLING_RULES.find((c) => c.systemCode === value.systemCode) ?? null;
    }
    if (value?.code) {
      return CANONICAL_BILLING_RULES.find((c) => c.code.toLowerCase() === value.code.toLowerCase()) ?? null;
    }
    return CANONICAL_BILLING_RULES[0];
  }, [value]);

  const [selectedCanonicalCode, setSelectedCanonicalCode] = useState<CanonicalBillingRuleCode>(
    initialCanonical?.systemCode ?? "company_master",
  );
  const currentCanonical = CANONICAL_BILLING_RULES.find((c) => c.systemCode === selectedCanonicalCode) ?? initialCanonical;

  const [code, setCode] = useState(value?.code ?? currentCanonical?.code ?? "");
  const [name, setName] = useState(value?.name ?? currentCanonical?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? currentCanonical?.description ?? "");
  const [payerKind, setPayerKind] = useState<BillingPayerKind>(
    value?.payerKind ?? currentCanonical?.payerKind ?? "guest",
  );
  const [splitGuestPercent, setSplitGuestPercent] = useState(
    String(value?.splitGuestPercent ?? currentCanonical?.splitGuestPercent ?? 50),
  );
  const [paymentTerms, setPaymentTerms] = useState(value?.paymentTerms ?? currentCanonical?.paymentTerms ?? "");
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);
  const [applicableProfiles, setApplicableProfiles] = useState<string[]>(
    value?.applicableProfileTypes ?? (currentCanonical ? [...currentCanonical.applicableProfileTypes] : ["company"]),
  );

  const handleCanonicalSelect = (canonCode: CanonicalBillingRuleCode) => {
    setSelectedCanonicalCode(canonCode);
    const def = CANONICAL_BILLING_RULES.find((c) => c.systemCode === canonCode);
    if (!def) return;
    setCode(def.code);
    setName(def.name);
    setDescription(def.description);
    setPayerKind(def.payerKind);
    if (def.splitGuestPercent != null) {
      setSplitGuestPercent(String(def.splitGuestPercent));
    }
    setApplicableProfiles([...def.applicableProfileTypes]);
  };

  const isSystemRule = Boolean(value?.isSystem || currentCanonical);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit billing rule" : "Configure billing rule"}
      description="NORU system rules govern folio routing and billing relationships. Properties configure display labels, applicability, defaults, and status."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save billing rule"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          systemCode: currentCanonical?.systemCode ?? value?.systemCode ?? null,
          name,
          description,
          payerKind: currentCanonical ? currentCanonical.payerKind : payerKind,
          splitGuestPercent: (currentCanonical?.payerKind ?? payerKind) === "split" ? Number(splitGuestPercent) : null,
          paymentTerms,
          isDefault,
          active,
          isSystem: isSystemRule,
          applicableProfileTypes: applicableProfiles,
        })
      }
    >
      <div className="space-y-4">
        {!value ? (
          <div className="space-y-1.5">
            <Label htmlFor="canonical-rule-type" className="font-semibold text-xs">
              System Rule Type <span className="text-[#C89933] text-[11px]">(NORU Canonical Catalogue)</span>
            </Label>
            <Select
              value={selectedCanonicalCode}
              onValueChange={(val) => handleCanonicalSelect(val as CanonicalBillingRuleCode)}
              disabled={!canEdit}
            >
              <SelectTrigger id="canonical-rule-type" className={goldFocus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANONICAL_BILLING_RULES.map((canon) => (
                  <SelectItem key={canon.systemCode} value={canon.systemCode}>
                    <span className="font-medium text-[#251605]">{canon.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-950">System Rule: {currentCanonical?.name || value.name}</span>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
                {currentCanonical?.systemCode || value.code}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-800">
              Rule semantics and payer assignment are system-governed. You may configure the property display label, active status, default setting, and profile applicability.
            </p>
          </div>
        )}

        {/* Operational Status Notices */}
        {selectedCanonicalCode === "direct_bill_city_ledger" ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-[11px] text-blue-900">
            <strong>Direct Bill / City Ledger:</strong> Records commercial credit agreement. Operational AR / City Ledger posting engine will be activated in a future release.
          </div>
        ) : null}

        {selectedCanonicalCode === "split_billing" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-900">
            <strong>Split Billing:</strong> Records financial intent for shared responsibility. Automated folio routing will apply once folio split matrices are configured.
          </div>
        ) : null}

        {selectedCanonicalCode === "custom_other" ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-700">
            <strong>Custom / Other:</strong> Descriptive instruction only. Does not alter core reservation or cashiering routing logic.
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="rule-name">Display Name (Property Label)</Label>
          <Input
            id="rule-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rule-description">Description & Instructions</Label>
          <Textarea
            id="rule-description"
            value={description}
            maxLength={500}
            rows={3}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rule-payer">Payer Assignment (System Handled)</Label>
          <div className="rounded-lg border bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800">
            {BILLING_PAYER_KIND_LABELS[currentCanonical?.payerKind ?? payerKind]}
          </div>
        </div>

        {(currentCanonical?.payerKind ?? payerKind) === "split" ? (
          <div className="space-y-1">
            <Label htmlFor="rule-split">Guest default share (%)</Label>
            <Input
              id="rule-split"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={splitGuestPercent}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setSplitGuestPercent(event.target.value)}
            />
          </div>
        ) : null}

        {/* Profile Applicability */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Applicable Profile Types</Label>
          <p className="text-[11px] text-muted-foreground">
            Control which guest or entity registration flows expose this billing rule.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {PROFILE_TYPE_OPTIONS.map((profile) => {
              const checked = applicableProfiles.includes(profile.id);
              return (
                <label
                  key={profile.id}
                  className="flex items-center gap-2 rounded-lg border border-[#E0D8CB] bg-white p-2 text-xs cursor-pointer hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    className="accent-[#C89933]"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setApplicableProfiles((prev) => [...prev, profile.id]);
                      } else {
                        setApplicableProfiles((prev) => prev.filter((id) => id !== profile.id));
                      }
                    }}
                  />
                  <span>{profile.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rule-terms">Payment terms (Optional hint)</Label>
          <Input
            id="rule-terms"
            value={paymentTerms}
            maxLength={80}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setPaymentTerms(event.target.value)}
          />
        </div>

        <ActiveField
          id="rule-default"
          label="Default rule for property"
          checked={isDefault}
          canEdit={canEdit}
          onChange={setIsDefault}
        />
        <ActiveField
          id="rule-active"
          label="Active"
          checked={active}
          canEdit={canEdit}
          onChange={setActive}
        />
      </div>
    </Card3OverlapSheet>
  );
}
