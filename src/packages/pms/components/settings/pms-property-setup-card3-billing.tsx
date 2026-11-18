import { useMemo, useState, type ReactNode } from "react";
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
import { cn } from "@/shared/lib/utils";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3ListSection,
  Card3OverlapSheet,
  Card3Section,
  Card3StatusDot,
  useCard3DraftSave,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  PROPERTY_SETUP_CONTROL_CLASS,
  PROPERTY_SETUP_TEXTAREA_CLASS,
} from "@/packages/pms/lib/pms-property-setup-ui";
import {
  getBillingCard3,
  saveBillingRuleCard3,
  saveInvoiceSettingsCard3,
} from "@/packages/pms/lib/billing-card3.functions";
import {
  BILLING_PAYER_KIND_LABELS,
  CANONICAL_BILLING_RULES,
  CARD3_BILLING_INTRO_COPY,
  CARD3_BILLING_TABS,
  INVOICE_FORMAT_LABELS,
  INVOICE_FORMATS,
  INVOICE_TAX_DISPLAY_LABELS,
  INVOICE_TAX_DISPLAYS,
  formatInvoiceNumberPreview,
  type BillingPayerKind,
  type BillingRuleCard3Row,
  type BillingCard3Snapshot,
  type CanonicalBillingRuleCode,
  type InvoiceFormat,
  type InvoiceTaxDisplay,
} from "@/packages/pms/lib/billing-card3.server";

/** Rectangular NORU field — match Taxes / Payments / Rate Plan treatment. */
const BILL_FIELD_CLASS = cn(
  PROPERTY_SETUP_CONTROL_CLASS,
  "h-9 rounded-[6px] shadow-none focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const BILL_SELECT_CLASS = cn(BILL_FIELD_CLASS, "justify-between [&>span]:line-clamp-1");

const BILL_SELECT_CONTENT_CLASS = "z-[100] rounded-[6px] border border-[#E6E1D8]";

const BILL_TEXTAREA_CLASS = cn(
  PROPERTY_SETUP_TEXTAREA_CLASS,
  "min-h-[4.5rem] rounded-[6px] shadow-none focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const BILL_TOGGLE_ROW_CLASS =
  "flex items-center justify-between rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2";

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

function SetupField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[#251605]">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function OwnershipBadge({ isSystem }: { isSystem: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isSystem ? "bg-[#EDE6D8] text-[#5C4528]" : "bg-[#F4EDE0] text-[#756A5B]",
      )}
    >
      {isSystem ? "System" : "Property"}
    </span>
  );
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
          row.isSystem ? "system" : "property",
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
        <div className="space-y-3" data-testid="pms-card3-billing">
          <p className="text-sm text-muted-foreground">{CARD3_BILLING_INTRO_COPY}</p>

          <Card3Section title="Invoice settings" icon="document">
            <InvoiceSettingsForm
              key={
                snapshot.invoiceSettings
                  ? `${snapshot.invoiceSettings.prefix}-${snapshot.invoiceSettings.startingNumber}`
                  : "invoice-settings-empty"
              }
              canEdit={canEdit}
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
            columns={[
              "Billing Rule",
              "Payer",
              "Guest Share",
              "Payment Terms",
              "Default",
              "Status",
            ]}
            empty="No billing rules saved yet."
            rows={filteredRules.map((row) => ({
              id: row.id,
              cells: [
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#251605]">{row.name}</span>
                    <OwnershipBadge isSystem={Boolean(row.isSystem)} />
                  </div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[#9A8F7E]">
                    {row.code}
                  </p>
                </div>,
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
  value,
  pending,
  onSave,
}: {
  canEdit: boolean;
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
  const preview = formatInvoiceNumberPreview(
    payload.prefix,
    payload.startingNumber,
    payload.numberPadding,
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
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        onSave(payload);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SetupField label="Prefix" htmlFor="invoice-prefix">
          <Input
            id="invoice-prefix"
            value={prefix}
            maxLength={12}
            disabled={!canEdit}
            className={BILL_FIELD_CLASS}
            onChange={(event) => setPrefix(event.target.value.toUpperCase())}
          />
        </SetupField>
        <SetupField label="Starting number" htmlFor="invoice-start">
          <Input
            id="invoice-start"
            type="number"
            min={1}
            value={startingNumber}
            disabled={!canEdit}
            className={BILL_FIELD_CLASS}
            onChange={(event) => setStartingNumber(event.target.value)}
          />
        </SetupField>
        <SetupField label="Number padding" htmlFor="invoice-padding">
          <Input
            id="invoice-padding"
            type="number"
            min={1}
            max={12}
            value={numberPadding}
            disabled={!canEdit}
            className={BILL_FIELD_CLASS}
            onChange={(event) => setNumberPadding(event.target.value)}
          />
        </SetupField>
        <SetupField label="Tax display">
          <Select
            value={taxDisplay}
            onValueChange={(next) => setTaxDisplay(next as InvoiceTaxDisplay)}
            disabled={!canEdit}
          >
            <SelectTrigger id="invoice-tax-display" className={BILL_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={BILL_SELECT_CONTENT_CLASS}>
              {INVOICE_TAX_DISPLAYS.map((item) => (
                <SelectItem key={item} value={item}>
                  {INVOICE_TAX_DISPLAY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
        <SetupField label="Invoice format">
          <Select
            value={invoiceFormat}
            onValueChange={(next) => setInvoiceFormat(next as InvoiceFormat)}
            disabled={!canEdit}
          >
            <SelectTrigger id="invoice-format" className={BILL_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={BILL_SELECT_CONTENT_CLASS}>
              {INVOICE_FORMATS.map((item) => (
                <SelectItem key={item} value={item}>
                  {INVOICE_FORMAT_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
      </div>

      <div
        className="rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] px-3 py-2.5"
        data-testid="invoice-number-preview"
      >
        <p className="text-xs text-muted-foreground">Preview</p>
        <p className="mt-0.5 font-mono text-sm font-medium text-[#251605]">
          Next invoice: {preview}
        </p>
      </div>

      {canEdit ? (
        <Button
          type="submit"
          disabled={pending}
          className="rounded-[6px] bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
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
    <div className={BILL_TOGGLE_ROW_CLASS}>
      <Label htmlFor={id} className="text-[#251605]">
        {label}
      </Label>
      <Switch id={id} checked={checked} disabled={!canEdit} onCheckedChange={onChange} />
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
      return (
        CANONICAL_BILLING_RULES.find((c) => c.code.toLowerCase() === value.code.toLowerCase()) ??
        null
      );
    }
    return CANONICAL_BILLING_RULES.find((c) => c.systemCode === "individual_guest") ?? null;
  }, [value]);

  const [selectedCanonicalCode, setSelectedCanonicalCode] = useState<CanonicalBillingRuleCode>(
    initialCanonical?.systemCode ?? "individual_guest",
  );
  const currentCanonical =
    CANONICAL_BILLING_RULES.find((c) => c.systemCode === selectedCanonicalCode) ?? initialCanonical;

  const [code, setCode] = useState(value?.code ?? currentCanonical?.code ?? "");
  const [name, setName] = useState(value?.name ?? currentCanonical?.name ?? "");
  const [description, setDescription] = useState(
    value?.description ?? currentCanonical?.description ?? "",
  );
  const [payerKind, setPayerKind] = useState<BillingPayerKind>(
    value?.payerKind ?? currentCanonical?.payerKind ?? "guest",
  );
  const [splitGuestPercent, setSplitGuestPercent] = useState(
    String(value?.splitGuestPercent ?? currentCanonical?.splitGuestPercent ?? 50),
  );
  const [paymentTerms, setPaymentTerms] = useState(
    value?.paymentTerms ?? currentCanonical?.paymentTerms ?? "",
  );
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);
  const [applicableProfiles, setApplicableProfiles] = useState<string[]>(
    value?.applicableProfileTypes ??
      (currentCanonical ? [...currentCanonical.applicableProfileTypes] : ["company"]),
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
      title={value ? "Edit billing rule" : "Add billing rule"}
      description="Choose how charges are assigned for this property."
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
          splitGuestPercent:
            (currentCanonical?.payerKind ?? payerKind) === "split"
              ? Number(splitGuestPercent)
              : null,
          paymentTerms,
          isDefault,
          active,
          isSystem: isSystemRule,
          applicableProfileTypes: applicableProfiles,
        })
      }
    >
      <div className="space-y-3">
        {!value ? (
          <SetupField label="Billing rule type">
            <Select
              value={selectedCanonicalCode}
              onValueChange={(val) => handleCanonicalSelect(val as CanonicalBillingRuleCode)}
              disabled={!canEdit}
            >
              <SelectTrigger id="canonical-rule-type" className={BILL_SELECT_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={BILL_SELECT_CONTENT_CLASS}>
                {CANONICAL_BILLING_RULES.map((canon) => (
                  <SelectItem key={canon.systemCode} value={canon.systemCode}>
                    {canon.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SetupField>
        ) : (
          <div className="rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-[#251605]">
                {currentCanonical?.name || value.name}
              </p>
              <OwnershipBadge isSystem={isSystemRule} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              You can update the display name, payment terms, default, active status, and which
              profiles can use this rule.
            </p>
          </div>
        )}

        {selectedCanonicalCode === "direct_bill_city_ledger" ? (
          <p className="rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2 text-xs text-[#756A5B]">
            Direct Bill / City Ledger records the commercial credit arrangement. Accounts receivable
            posting follows when city ledger is fully configured.
          </p>
        ) : null}

        {selectedCanonicalCode === "split_billing" ? (
          <p className="rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2 text-xs text-[#756A5B]">
            Split Billing records shared payment responsibility. Folio routing uses the configured
            guest share.
          </p>
        ) : null}

        {selectedCanonicalCode === "custom_other" ? (
          <p className="rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2 text-xs text-[#756A5B]">
            Custom / Other is for special instructions. It does not change standard folio routing on
            its own.
          </p>
        ) : null}

        {selectedCanonicalCode === "none" ? (
          <p className="rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2 text-xs text-[#756A5B]">
            None means no billing instruction is pre-assigned. Settlement details are set at
            reservation or check-in.
          </p>
        ) : null}

        <SetupField label="Display name" htmlFor="rule-name">
          <Input
            id="rule-name"
            value={name}
            disabled={!canEdit}
            className={BILL_FIELD_CLASS}
            onChange={(event) => setName(event.target.value)}
          />
        </SetupField>

        <SetupField label="Description" htmlFor="rule-description">
          <Textarea
            id="rule-description"
            value={description}
            maxLength={500}
            rows={3}
            disabled={!canEdit}
            className={BILL_TEXTAREA_CLASS}
            onChange={(event) => setDescription(event.target.value)}
          />
        </SetupField>

        <SetupField label="Payer">
          <div className="flex h-9 items-center rounded-[6px] border border-[#CCCCCC] bg-[#F7F4EE] px-3 text-sm text-[#251605]">
            {BILLING_PAYER_KIND_LABELS[currentCanonical?.payerKind ?? payerKind]}
          </div>
        </SetupField>

        {(currentCanonical?.payerKind ?? payerKind) === "split" ? (
          <SetupField label="Guest share (%)" htmlFor="rule-split">
            <Input
              id="rule-split"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={splitGuestPercent}
              disabled={!canEdit}
              className={BILL_FIELD_CLASS}
              onChange={(event) => setSplitGuestPercent(event.target.value)}
            />
          </SetupField>
        ) : null}

        <SetupField
          label="Applicable profiles"
          hint="Choose which registration types can use this billing rule."
        >
          <div className="grid grid-cols-2 gap-2">
            {PROFILE_TYPE_OPTIONS.map((profile) => {
              const checked = applicableProfiles.includes(profile.id);
              return (
                <label
                  key={profile.id}
                  className="flex items-center gap-2 rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2 text-sm text-[#251605]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    className="size-4 rounded-[3px] border-[#CCCCCC] accent-[#C89933]"
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
        </SetupField>

        <SetupField
          label="Payment terms"
          htmlFor="rule-terms"
          hint="Optional. Example: Due at checkout."
        >
          <Input
            id="rule-terms"
            value={paymentTerms}
            maxLength={80}
            disabled={!canEdit}
            className={BILL_FIELD_CLASS}
            onChange={(event) => setPaymentTerms(event.target.value)}
          />
        </SetupField>

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
