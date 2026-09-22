import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
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
  type DepositPolicyCard3Row,
  type DepositPolicyType,
  type PaymentMethodCard3Row,
  type PaymentTypeClass,
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
  const [methodSearch, setMethodSearch] = useState("");
  const [policySearch, setPolicySearch] = useState("");
  const [methodDraft, setMethodDraft] = useState<PaymentMethodCard3Row | "new" | null>(null);
  const [policyDraft, setPolicyDraft] = useState<DepositPolicyCard3Row | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-payments", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: PaymentsCard3Snapshot | undefined = query.data?.snapshot;
  const paymentMethods = useMemo(() => snapshot?.paymentMethods ?? [], [snapshot?.paymentMethods]);
  const depositPolicies = useMemo(
    () => snapshot?.depositPolicies ?? [],
    [snapshot?.depositPolicies],
  );
  const currencyCode = snapshot?.currencyCode || "currency";
  const filteredMethods = useMemo(
    () =>
      paymentMethods.filter((row) =>
        matchesQuery(methodSearch, row.code, row.name, row.typeClassLabel, row.notes),
      ),
    [paymentMethods, methodSearch],
  );
  const filteredPolicies = useMemo(
    () =>
      depositPolicies.filter((row) =>
        matchesQuery(
          policySearch,
          row.code,
          row.name,
          row.description,
          row.depositTypeLabel,
          String(row.depositValue),
        ),
      ),
    [depositPolicies, policySearch],
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

  void CARD3_PAYMENTS_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading payments and deposits…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Payments & Deposits are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-payments">
          <Card3InheritedStrip>
            Payment methods reuse the existing accepted-tenders catalogue. Deposit policies are Card
            3 setup rules in {currencyCode}. SET1 restaurants.deposit_* columns are not written
            here. Gateways stay on Card 6. This configuration makes no reservation or folio
            operational changes.
          </Card3InheritedStrip>

          <Card3ListSection
            title="Payment methods"
            icon="payment"
            search={methodSearch}
            onSearch={setMethodSearch}
            placeholder="Search payment methods"
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
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setMethodDraft(row),
            }))}
          />

          <Card3ListSection
            title="Deposit policies"
            icon="money"
            search={policySearch}
            onSearch={setPolicySearch}
            placeholder="Search deposit policies"
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
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setPolicyDraft(row),
            }))}
          />

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
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit payment method" : "Add payment method"}
      description="Accepted tender for this property. Not a payment gateway."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save payment method"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          typeClass: typeClass === "none" ? "" : typeClass,
          notes,
          active,
        })
      }
    >
      <div className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
  Use 1–20 uppercase letters, numbers, or underscores. Example: CASH.
</p>
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
      </div>
    </Card3OverlapSheet>
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
  const [depositType, setDepositType] = useState<DepositPolicyType>(
    value?.depositType ?? "percent",
  );
  const [depositValue, setDepositValue] = useState(String(value?.depositValue ?? 0));
  const [required, setRequired] = useState(value?.required ?? false);
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit deposit policy" : "Add deposit policy"}
      description={`Stored setup figure in ${currencyCode || "the property base currency"}. Not a posted deposit.`}
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save deposit policy"
      onSubmit={() =>
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
        })
      }
    >
      <div className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
  Use 1–20 uppercase letters, numbers, or underscores. Example: FIRST_NIGHT.
</p>
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
      </div>
    </Card3OverlapSheet>
  );
}
