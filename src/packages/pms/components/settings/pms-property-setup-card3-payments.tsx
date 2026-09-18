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
  getPaymentsCard3,
  saveDepositPolicyCard3,
  savePaymentMethodCard3,
} from "@/packages/pms/lib/payments-card3.functions";
import {
  CARD3_PAYMENTS_TABS,
  DEPOSIT_POLICY_TYPE_LABELS,
  DEPOSIT_POLICY_TYPES,
  PAYMENT_TYPE_CLASS_LABELS,
  PAYMENT_TYPE_CLASSES,
  type Card3PaymentsTabId,
  type DepositPolicyCard3Row,
  type DepositPolicyType,
  type PaymentMethodCard3Row,
  type PaymentTypeClass,
  type PaymentsCard3AuditRow,
  type PaymentsCard3Snapshot,
} from "@/packages/pms/lib/payments-card3.server";

const goldFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2";

type PaymentMethodInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  typeClass?: PaymentTypeClass | "";
  notes?: string;
  active: boolean;
};

type DepositPolicyInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  required: boolean;
  depositType: DepositPolicyType;
  depositValue: number;
  isDefault: boolean;
  active: boolean;
};

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

export function PmsPropertySetupCard3Payments({
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
  const load = useServerFn(getPaymentsCard3);
  const saveMethod = useServerFn(savePaymentMethodCard3);
  const savePolicy = useServerFn(saveDepositPolicyCard3);
  const [tab, setTab] = useState<Card3PaymentsTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [methodDraft, setMethodDraft] = useState<PaymentMethodCard3Row | "new" | null>(null);
  const [policyDraft, setPolicyDraft] = useState<DepositPolicyCard3Row | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-payments", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: PaymentsCard3Snapshot | undefined = query.data?.snapshot;
  const audit = (query.data?.audit ?? []) as PaymentsCard3AuditRow[];
  const readiness = query.data?.readiness;
  const paymentMethods = useMemo(() => snapshot?.paymentMethods ?? [], [snapshot?.paymentMethods]);
  const depositPolicies = useMemo(
    () => snapshot?.depositPolicies ?? [],
    [snapshot?.depositPolicies],
  );
  const currencyCode = snapshot?.currencyCode || "currency";
  const filteredMethods = useMemo(
    () =>
      paymentMethods.filter((row) =>
        matchesQuery(search, row.code, row.name, row.typeClassLabel, row.notes),
      ),
    [paymentMethods, search],
  );
  const filteredPolicies = useMemo(
    () =>
      depositPolicies.filter((row) =>
        matchesQuery(
          search,
          row.code,
          row.name,
          row.description,
          row.depositTypeLabel,
          String(row.depositValue),
        ),
      ),
    [depositPolicies, search],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-payments", restaurantId] });
  }

  const methodMutation = useMutation({
    mutationFn: (input: PaymentMethodInput) => saveMethod({ data: input }),
    onSuccess: () => {
      toast.success("Payment method saved.");
      setMethodDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const policyMutation = useMutation({
    mutationFn: (input: DepositPolicyInput) => savePolicy({ data: input }),
    onSuccess: () => {
      toast.success("Deposit policy saved.");
      setPolicyDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const searchLabel =
    tab === "payment-methods" ? "Search payment methods" : "Search deposit policies";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3PaymentsTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_PAYMENTS_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={goldFocus}
                data-testid={`card3-payments-tab-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "overview" ? null : (
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchLabel}
              aria-label={searchLabel}
              className={`max-w-sm ${goldFocus}`}
            />
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {audit.length === 0 ? (
                  <li className="text-muted-foreground">
                    No payment or deposit changes recorded yet.
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
          <p className="text-sm text-muted-foreground">Loading payments and deposits…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ?? "Payments & Deposits are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-payments">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  Payment methods reuse the existing accepted-tenders catalogue. Deposit policies
                  are Card 3 setup rules in {currencyCode}. SET1 restaurants.deposit_* columns are not written here. Gateways stay on Card 6.
                </p>
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  This configuration makes no reservation or folio operational changes.
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(readiness?.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {paymentMethods.length} payment methods · {depositPolicies.length} deposit
                  policies
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

            {tab === "payment-methods" ? (
              <CatalogueTable
                canEdit={canEdit}
                addLabel="Add payment method"
                onAdd={() => setMethodDraft("new")}
                columns={["Code", "Name", "Type", "Notes", "Status"]}
                empty="No payment methods saved yet."
                rows={filteredMethods.map((row) => ({
                  id: row.id,
                  cells: [
                    row.code,
                    row.name,
                    row.typeClassLabel,
                    row.notes || "—",
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setMethodDraft(row),
                }))}
              />
            ) : null}

            {tab === "deposit-policies" ? (
              <CatalogueTable
                canEdit={canEdit}
                addLabel="Add deposit policy"
                onAdd={() => setPolicyDraft("new")}
                columns={[
                  "Code",
                  "Name",
                  "Type",
                  `Value (${currencyCode})`,
                  "Required",
                  "Default",
                  "Status",
                ]}
                empty="No deposit policies saved yet."
                rows={filteredPolicies.map((row) => ({
                  id: row.id,
                  cells: [
                    row.code,
                    row.name,
                    row.depositTypeLabel,
                    row.depositType === "percent"
                      ? `${row.depositValue}%`
                      : `${currencyCode} ${row.depositValue}`.trim(),
                    row.required ? "Required" : "Optional",
                    row.isDefault ? "Default" : "—",
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setPolicyDraft(row),
                }))}
              />
            ) : null}

            <PaymentMethodSheet
              key={methodDraft === "new" ? "method-new" : (methodDraft?.id ?? "method-closed")}
              open={methodDraft !== null}
              canEdit={canEdit}
              value={methodDraft === "new" || methodDraft === null ? null : methodDraft}
              pending={methodMutation.isPending}
              onClose={() => setMethodDraft(null)}
              onSave={(payload) => methodMutation.mutate({ restaurantId, ...payload })}
            />
            <DepositPolicySheet
              key={policyDraft === "new" ? "policy-new" : (policyDraft?.id ?? "policy-closed")}
              open={policyDraft !== null}
              canEdit={canEdit}
              currencyCode={snapshot.currencyCode}
              value={policyDraft === "new" || policyDraft === null ? null : policyDraft}
              pending={policyMutation.isPending}
              onClose={() => setPolicyDraft(null)}
              onSave={(payload) => policyMutation.mutate({ restaurantId, ...payload })}
            />
          </div>
        )}
      </PmsPropertySetupCard3Workspace>
    </Tabs>
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

function PaymentMethodSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: PaymentMethodCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    typeClass?: PaymentTypeClass | "";
    notes?: string;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [typeClass, setTypeClass] = useState<PaymentTypeClass | "none">(value?.typeClass || "none");
  const [notes, setNotes] = useState(value?.notes ?? "");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit payment method" : "Add payment method"}</SheetTitle>
          <SheetDescription>
            Accepted tender for this property. Not a payment gateway.
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
              typeClass: typeClass === "none" ? "" : typeClass,
              notes,
              active,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="method-code">Code</Label>
            <Input
              id="method-code"
              value={code}
              maxLength={20}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-name">Name</Label>
            <Input
              id="method-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-type">Type</Label>
            <Select
              value={typeClass}
              onValueChange={(next) => setTypeClass(next as PaymentTypeClass | "none")}
              disabled={!canEdit}
            >
              <SelectTrigger id="method-type" className={goldFocus}>
                <SelectValue placeholder="Optional type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {PAYMENT_TYPE_CLASSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PAYMENT_TYPE_CLASS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="method-notes">Notes</Label>
            <Textarea
              id="method-notes"
              value={notes}
              maxLength={240}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <ActiveField
            id="method-active"
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
              Save payment method
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DepositPolicySheet({
  open,
  canEdit,
  currencyCode,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  currencyCode: string;
  value: DepositPolicyCard3Row | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    required: boolean;
    depositType: DepositPolicyType;
    depositValue: number;
    isDefault: boolean;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [depositType, setDepositType] = useState<DepositPolicyType>(value?.depositType ?? "percent");
  const [depositValue, setDepositValue] = useState(String(value?.depositValue ?? 0));
  const [required, setRequired] = useState(value?.required ?? false);
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit deposit policy" : "Add deposit policy"}</SheetTitle>
          <SheetDescription>
            Stored setup figure in {currencyCode || "the property base currency"}. Not a posted
            deposit.
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
              required,
              depositType,
              depositValue: Number(depositValue),
              isDefault,
              active,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="policy-code">Code</Label>
            <Input
              id="policy-code"
              value={code}
              maxLength={20}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="policy-name">Name</Label>
            <Input
              id="policy-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="policy-description">Description</Label>
            <Textarea
              id="policy-description"
              value={description}
              maxLength={500}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="policy-type">Deposit type</Label>
            <Select
              value={depositType}
              onValueChange={(next) => {
                const type = next as DepositPolicyType;
                setDepositType(type);
                if (type === "none") setDepositValue("0");
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="policy-type" className={goldFocus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPOSIT_POLICY_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {DEPOSIT_POLICY_TYPE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="policy-value">
              {depositType === "percent" ? "Percent" : `Value (${currencyCode})`}
            </Label>
            <Input
              id="policy-value"
              type="number"
              min={0}
              max={depositType === "percent" ? 100 : undefined}
              step="0.01"
              value={depositValue}
              disabled={!canEdit || depositType === "none"}
              className={goldFocus}
              onChange={(event) => setDepositValue(event.target.value)}
            />
          </div>
          <ActiveField
            id="policy-required"
            label="Required"
            checked={required}
            canEdit={canEdit}
            onChange={setRequired}
          />
          <ActiveField
            id="policy-default"
            label="Default policy"
            checked={isDefault}
            canEdit={canEdit}
            onChange={setIsDefault}
          />
          <ActiveField
            id="policy-active"
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
              Save deposit policy
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
