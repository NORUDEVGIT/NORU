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
  CARD3_BILLING_TABS,
  INVOICE_FORMAT_LABELS,
  INVOICE_FORMATS,
  INVOICE_TAX_DISPLAY_LABELS,
  INVOICE_TAX_DISPLAYS,
  type BillingPayerKind,
  type BillingRuleCard3Row,
  type BillingCard3Snapshot,
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
                  Inherited from Card 1 · brand
                </dt>
                <dd className="text-[#251605]">{inherited?.brandName || "—"}</dd>
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
    name: string;
    description?: string;
    payerKind: BillingPayerKind;
    splitGuestPercent?: number | null;
    paymentTerms?: string;
    isDefault: boolean;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [payerKind, setPayerKind] = useState<BillingPayerKind>(value?.payerKind ?? "guest");
  const [splitGuestPercent, setSplitGuestPercent] = useState(
    String(value?.splitGuestPercent ?? 50),
  );
  const [paymentTerms, setPaymentTerms] = useState(value?.paymentTerms ?? "");
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit billing rule" : "Add billing rule"}
      description="Setup payer hint only. This does not split folios or post city ledger."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save billing rule"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description,
          payerKind,
          splitGuestPercent: payerKind === "split" ? Number(splitGuestPercent) : null,
          paymentTerms,
          isDefault,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="rule-code">Code</Label>
          <Input
            id="rule-code"
            value={code}
            maxLength={20}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            value={name}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-description">Description</Label>
          <Textarea
            id="rule-description"
            value={description}
            maxLength={500}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-payer">Payer</Label>
          <Select
            value={payerKind}
            onValueChange={(next) => setPayerKind(next as BillingPayerKind)}
            disabled={!canEdit}
          >
            <SelectTrigger id="rule-payer" className={goldFocus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_PAYER_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {BILLING_PAYER_KIND_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {payerKind === "split" ? (
          <div className="space-y-1">
            <Label htmlFor="rule-split">Guest percent</Label>
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
        <div className="space-y-1">
          <Label htmlFor="rule-terms">Payment terms</Label>
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
          label="Default rule"
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
