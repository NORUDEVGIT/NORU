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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
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
  type Card3BillingTabId,
  type BillingCard3AuditRow,
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
  onBack,
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
  const [tab, setTab] = useState<Card3BillingTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<BillingRuleCard3Row | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-billing", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: BillingCard3Snapshot | undefined = query.data?.snapshot;
  const audit = (query.data?.audit ?? []) as BillingCard3AuditRow[];
  const readiness = query.data?.readiness;
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

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3BillingTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_BILLING_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={goldFocus}
                data-testid={`card3-billing-tab-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "billing-rules" ? (
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search billing rules"
              aria-label="Search billing rules"
              className={`max-w-sm ${goldFocus}`}
            />
          ) : null
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {audit.length === 0 ? (
                  <li className="text-muted-foreground">
                    No billing or invoice-setup changes recorded yet.
                  </li>
                ) : (
                  audit.map((row) => (
                    <li key={row.id}>
                      <p className="font-medium text-[#251605]">{row.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.detail ? `${row.detail} · ` : ""}
                        {row.createdAt}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null
        }
      >
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading billing and invoicing…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ?? "Billing & Invoicing are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-billing">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  Legal identity, branding, VAT, and base currency are inherited from Card 1. Taxes
                  and payment methods stay on earlier Card 3 domains. City ledger is out of this workspace.
                </p>
                <dl className="grid gap-2 rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm sm:grid-cols-2">
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
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  This configuration makes no reservation or folio operational changes.
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(readiness?.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Invoice settings {snapshot.invoiceSettings ? "saved" : "not saved"} ·{" "}
                  {billingRules.length} billing rules
                </p>
                {(readiness?.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {readiness?.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "invoice-settings" ? (
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
            ) : null}

            {tab === "billing-rules" ? (
              <CatalogueTable
                canEdit={canEdit}
                addLabel="Add billing rule"
                onAdd={() => setRuleDraft("new")}
                columns={[
                  "Code",
                  "Name",
                  "Payer",
                  "Guest %",
                  "Payment terms",
                  "Default",
                  "Status",
                ]}
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setRuleDraft(row),
                }))}
              />
            ) : null}

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
    </Tabs>
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

  return (
    <form
      className="max-w-lg space-y-3 rounded-2xl border border-border bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        onSave({
          prefix,
          startingNumber: Number(startingNumber),
          numberPadding: Number(numberPadding),
          taxDisplay,
          invoiceFormat,
        });
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

function CatalogueTable({
  canEdit,
  addLabel,
  empty,
  columns,
  rows,
  onAdd,
}: {
  canEdit: boolean;
  addLabel: string;
  empty: string;
  columns: string[];
  rows: { id: string; cells: string[]; onEdit: () => void }[];
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <Button
          type="button"
          onClick={onAdd}
          className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
        >
          {addLabel}
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`} className="px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={goldFocus}
                        onClick={row.onEdit}
                      >
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit billing rule" : "Add billing rule"}</SheetTitle>
          <SheetDescription>
            Setup payer hint only. This does not split folios or post city ledger.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
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
            });
          }}
        >
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
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
            >
              Save billing rule
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
