import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getTaxesCard3,
  saveExemptionRuleCard3,
  saveFeeCard3,
  saveServiceChargeCard3,
  saveTaxCard3,
  saveTaxGroupCard3,
} from "@/packages/pms/lib/taxes-card3.functions";
import {
  CARD3_TAXES_SET1_COPY,
  CARD3_TAXES_TABS,
  EXEMPTION_REASON_LABELS,
  EXEMPTION_REASONS,
  FEE_BASIS,
  FEE_BASIS_LABELS,
  TAX_BASIS,
  TAX_BASIS_LABELS,
  TAX_CALCULATION_LABELS,
  TAX_CALCULATIONS,
  TAX_CHARGE_TYPE_LABELS,
  TAX_CHARGE_TYPES,
  type ExemptionReason,
  type ExemptionRuleRow,
  type FeeBasis,
  type FeeRow,
  type ServiceChargeRow,
  type TaxBasis,
  type TaxCalculation,
  type TaxChargeType,
  type TaxGroupRow,
  type TaxRow,
  type TaxesCard3Snapshot,
} from "@/packages/pms/lib/taxes-card3.server";

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

export function PmsPropertySetupCard3Taxes({
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
  const load = useServerFn(getTaxesCard3);
  const saveTax = useServerFn(saveTaxCard3);
  const saveGroup = useServerFn(saveTaxGroupCard3);
  const saveService = useServerFn(saveServiceChargeCard3);
  const saveFee = useServerFn(saveFeeCard3);
  const saveRule = useServerFn(saveExemptionRuleCard3);
  const [taxSearch, setTaxSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [taxDraft, setTaxDraft] = useState<TaxRow | "new" | null>(null);
  const [groupDraft, setGroupDraft] = useState<TaxGroupRow | "new" | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ServiceChargeRow | "new" | null>(null);
  const [feeDraft, setFeeDraft] = useState<FeeRow | "new" | null>(null);
  const [ruleDraft, setRuleDraft] = useState<ExemptionRuleRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-taxes", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: TaxesCard3Snapshot | undefined = query.data?.snapshot;
  const taxes = snapshot?.taxes ?? [];
  const groups = snapshot?.groups ?? [];
  const services = snapshot?.serviceCharges ?? [];
  const fees = snapshot?.fees ?? [];
  const rules = snapshot?.exemptionRules ?? [];

  const filteredTaxes = useMemo(
    () =>
      taxes.filter((row) => matchesQuery(taxSearch, row.code, row.name, row.basis, row.chargeType)),
    [taxes, taxSearch],
  );
  const filteredGroups = useMemo(
    () => groups.filter((row) => matchesQuery(groupSearch, row.code, row.name)),
    [groups, groupSearch],
  );
  const filteredServices = useMemo(
    () => services.filter((row) => matchesQuery(serviceSearch, row.code, row.name, row.basis)),
    [services, serviceSearch],
  );
  const filteredFees = useMemo(
    () => fees.filter((row) => matchesQuery(feeSearch, row.code, row.name, row.basis)),
    [fees, feeSearch],
  );
  const filteredRules = useMemo(
    () =>
      rules.filter((row) =>
        matchesQuery(ruleSearch, row.code, row.name, row.reasonCategory, row.description),
      ),
    [rules, ruleSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-taxes", restaurantId] });
  }

  const taxMut = useMutation({
    mutationFn: (input: Parameters<typeof saveTax>[0]["data"]) => saveTax({ data: input }),
    onSuccess: () => {
      toast.success("Tax saved.");
      setTaxDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const groupMut = useMutation({
    mutationFn: (input: Parameters<typeof saveGroup>[0]["data"]) => saveGroup({ data: input }),
    onSuccess: () => {
      toast.success("Tax group saved.");
      setGroupDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const serviceMut = useMutation({
    mutationFn: (input: Parameters<typeof saveService>[0]["data"]) => saveService({ data: input }),
    onSuccess: () => {
      toast.success("Service charge saved.");
      setServiceDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const feeMut = useMutation({
    mutationFn: (input: Parameters<typeof saveFee>[0]["data"]) => saveFee({ data: input }),
    onSuccess: () => {
      toast.success("Fee saved.");
      setFeeDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const ruleMut = useMutation({
    mutationFn: (input: Parameters<typeof saveRule>[0]["data"]) => saveRule({ data: input }),
    onSuccess: () => {
      toast.success("Exemption rule saved.");
      setRuleDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  void CARD3_TAXES_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading taxes and fees…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Taxes & Fees are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-taxes">
          <Card3InheritedStrip>{CARD3_TAXES_SET1_COPY}</Card3InheritedStrip>
          <Card3ListSection
            title="Taxes"
            icon="tax"
            search={taxSearch}
            onSearch={setTaxSearch}
            placeholder="Search taxes"
            canEdit={canEdit}
            addLabel="Add tax"
            empty="No taxes saved yet."
            columns={["Code", "Name", "Type", "Amount", "Basis", "Calculation", "Status"]}
            rows={filteredTaxes.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                TAX_CHARGE_TYPE_LABELS[row.chargeType],
                String(row.amount),
                TAX_BASIS_LABELS[row.basis],
                TAX_CALCULATION_LABELS[row.calculation],
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setTaxDraft(row),
            }))}
            onAdd={() => setTaxDraft("new")}
          />

          <Card3ListSection
            title="Tax groups"
            icon="tax"
            search={groupSearch}
            onSearch={setGroupSearch}
            placeholder="Search tax groups"
            canEdit={canEdit}
            addLabel="Add tax group"
            empty="No tax groups saved yet."
            columns={["Code", "Name", "Taxes", "Status"]}
            rows={filteredGroups.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                String(row.taxIds.length),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setGroupDraft(row),
            }))}
            onAdd={() => setGroupDraft("new")}
          />

          <Card3ListSection
            title="Service charges"
            icon="service"
            search={serviceSearch}
            onSearch={setServiceSearch}
            placeholder="Search service charges"
            canEdit={canEdit}
            addLabel="Add service charge"
            empty="No service charges saved yet."
            columns={["Code", "Name", "Type", "Amount", "Basis", "Status"]}
            rows={filteredServices.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                TAX_CHARGE_TYPE_LABELS[row.chargeType],
                String(row.amount),
                TAX_BASIS_LABELS[row.basis],
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setServiceDraft(row),
            }))}
            onAdd={() => setServiceDraft("new")}
          />

          <Card3ListSection
            title="Fees"
            icon="money"
            search={feeSearch}
            onSearch={setFeeSearch}
            placeholder="Search fees"
            canEdit={canEdit}
            addLabel="Add fee"
            empty="No fees saved yet."
            columns={["Code", "Name", "Type", "Amount", "Basis", "Status"]}
            rows={filteredFees.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                TAX_CHARGE_TYPE_LABELS[row.chargeType],
                String(row.amount),
                FEE_BASIS_LABELS[row.basis],
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setFeeDraft(row),
            }))}
            onAdd={() => setFeeDraft("new")}
          />

          <Card3ListSection
            title="Exemption rules"
            icon="document"
            search={ruleSearch}
            onSearch={setRuleSearch}
            placeholder="Search exemption rules"
            canEdit={canEdit}
            addLabel="Add exemption rule"
            empty="No exemption rules saved yet. These are configuration only."
            columns={["Code", "Name", "Reason", "Docs", "Approval", "Status"]}
            rows={filteredRules.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                EXEMPTION_REASON_LABELS[row.reasonCategory],
                row.documentationRequired ? "Required" : "Optional",
                row.approvalRequired ? "Required" : "Optional",
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setRuleDraft(row),
            }))}
            onAdd={() => setRuleDraft("new")}
          />

          <TaxDrawer
            key={taxDraft === "new" ? "tax-new" : (taxDraft?.id ?? "tax-closed")}
            open={taxDraft !== null}
            canEdit={canEdit}
            value={taxDraft === "new" || taxDraft === null ? null : taxDraft}
            pending={taxMut.isPending}
            onClose={() => setTaxDraft(null)}
            onSave={(payload) => taxMut.mutate({ restaurantId, ...payload })}
          />
          <GroupDrawer
            key={groupDraft === "new" ? "group-new" : (groupDraft?.id ?? "group-closed")}
            open={groupDraft !== null}
            canEdit={canEdit}
            taxes={taxes}
            value={groupDraft === "new" || groupDraft === null ? null : groupDraft}
            pending={groupMut.isPending}
            onClose={() => setGroupDraft(null)}
            onSave={(payload) => groupMut.mutate({ restaurantId, ...payload })}
          />
          <ServiceDrawer
            key={serviceDraft === "new" ? "svc-new" : (serviceDraft?.id ?? "svc-closed")}
            open={serviceDraft !== null}
            canEdit={canEdit}
            value={serviceDraft === "new" || serviceDraft === null ? null : serviceDraft}
            pending={serviceMut.isPending}
            onClose={() => setServiceDraft(null)}
            onSave={(payload) => serviceMut.mutate({ restaurantId, ...payload })}
          />
          <FeeDrawer
            key={feeDraft === "new" ? "fee-new" : (feeDraft?.id ?? "fee-closed")}
            open={feeDraft !== null}
            canEdit={canEdit}
            value={feeDraft === "new" || feeDraft === null ? null : feeDraft}
            pending={feeMut.isPending}
            onClose={() => setFeeDraft(null)}
            onSave={(payload) => feeMut.mutate({ restaurantId, ...payload })}
          />
          <RuleDrawer
            key={ruleDraft === "new" ? "rule-new" : (ruleDraft?.id ?? "rule-closed")}
            open={ruleDraft !== null}
            canEdit={canEdit}
            value={ruleDraft === "new" || ruleDraft === null ? null : ruleDraft}
            pending={ruleMut.isPending}
            onClose={() => setRuleDraft(null)}
            onSave={(payload) => ruleMut.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function CodeFields({
  code,
  name,
  locked,
  canEdit,
  onCode,
  onName,
}: {
  code: string;
  name: string;
  locked: boolean;
  canEdit: boolean;
  onCode: (value: string) => void;
  onName: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="setup-code">Code</Label>
        <Input
          id="setup-code"
          value={code}
          maxLength={20}
          disabled={!canEdit || locked}
          onChange={(event) => onCode(event.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-name">Name</Label>
        <Input
          id="setup-name"
          value={name}
          disabled={!canEdit}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
    </>
  );
}

function ChargeTypeFields({
  chargeType,
  amount,
  canEdit,
  onType,
  onAmount,
}: {
  chargeType: TaxChargeType;
  amount: number;
  canEdit: boolean;
  onType: (value: TaxChargeType) => void;
  onAmount: (value: number) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select
          value={chargeType}
          disabled={!canEdit}
          onValueChange={(value) => onType(value as TaxChargeType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_CHARGE_TYPES.map((row) => (
              <SelectItem key={row} value={row}>
                {TAX_CHARGE_TYPE_LABELS[row]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-amount">{chargeType === "percentage" ? "Rate (%)" : "Amount"}</Label>
        <Input
          id="setup-amount"
          type="number"
          min={0}
          step="any"
          value={amount}
          disabled={!canEdit}
          onChange={(event) => onAmount(Number(event.target.value))}
        />
      </div>
    </>
  );
}

function ActiveField({
  active,
  canEdit,
  onChange,
}: {
  active: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <Label htmlFor="setup-active">Active</Label>
      <Switch id="setup-active" checked={active} disabled={!canEdit} onCheckedChange={onChange} />
    </div>
  );
}

function TaxDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: TaxRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<TaxRow, "id"> & { id?: string }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "percentage");
  const [amount, setAmount] = useState(value?.amount ?? 15);
  const [basis, setBasis] = useState<TaxBasis>(value?.basis ?? "all");
  const [calculation, setCalculation] = useState<TaxCalculation>(value?.calculation ?? "exclusive");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit tax" : "Add tax"}
      description="Catalogue only. This does not change the SET1 till rate."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save tax"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis,
          calculation,
          active,
        })
      }
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          onCode={setCode}
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <div className="space-y-1">
          <Label>Basis</Label>
          <Select
            value={basis}
            disabled={!canEdit}
            onValueChange={(next) => setBasis(next as TaxBasis)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_BASIS.map((row) => (
                <SelectItem key={row} value={row}>
                  {TAX_BASIS_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Calculation</Label>
          <Select
            value={calculation}
            disabled={!canEdit}
            onValueChange={(next) => setCalculation(next as TaxCalculation)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_CALCULATIONS.map((row) => (
                <SelectItem key={row} value={row}>
                  {TAX_CALCULATION_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function GroupDrawer({
  open,
  canEdit,
  taxes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  taxes: TaxRow[];
  value: TaxGroupRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    active: boolean;
    taxIds: string[];
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [taxIds, setTaxIds] = useState<string[]>(value?.taxIds ?? []);

  function toggle(id: string, checked: boolean) {
    setTaxIds((current) => (checked ? [...current, id] : current.filter((row) => row !== id)));
  }

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit tax group" : "Add tax group"}
      description="Assign taxes from this property only."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save tax group"
      onSubmit={() => onSave({ ...(value ? { id: value.id } : {}), code, name, active, taxIds })}
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          onCode={setCode}
          onName={setName}
        />
        <div className="space-y-2 rounded-xl border px-3 py-2">
          <p className="text-sm font-medium text-[#251605]">Assigned taxes</p>
          {taxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Save a tax first.</p>
          ) : (
            taxes.map((tax) => (
              <label key={tax.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={taxIds.includes(tax.id)}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => toggle(tax.id, checked === true)}
                />
                {tax.code} — {tax.name}
              </label>
            ))
          )}
        </div>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function ServiceDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: ServiceChargeRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ServiceChargeRow, "id"> & { id?: string }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "percentage");
  const [amount, setAmount] = useState(value?.amount ?? 10);
  const [basis, setBasis] = useState<TaxBasis>(value?.basis ?? "fnb");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit service charge" : "Add service charge"}
      description="Catalogue only. This does not change the SET1 service rate."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save service charge"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis,
          active,
        })
      }
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          onCode={setCode}
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <div className="space-y-1">
          <Label>Basis</Label>
          <Select
            value={basis}
            disabled={!canEdit}
            onValueChange={(next) => setBasis(next as TaxBasis)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_BASIS.map((row) => (
                <SelectItem key={row} value={row}>
                  {TAX_BASIS_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function FeeDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: FeeRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<FeeRow, "id"> & { id?: string }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "fixed");
  const [amount, setAmount] = useState(value?.amount ?? 5);
  const [basis, setBasis] = useState<FeeBasis>(value?.basis ?? "stay");
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit fee" : "Add fee"}
      description="Additional charges only. Cancel and no-show fees stay in Front Office policy."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save fee"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis,
          active,
        })
      }
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          onCode={setCode}
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <div className="space-y-1">
          <Label>Basis</Label>
          <Select
            value={basis}
            disabled={!canEdit}
            onValueChange={(next) => setBasis(next as FeeBasis)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEE_BASIS.map((row) => (
                <SelectItem key={row} value={row}>
                  {FEE_BASIS_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function RuleDrawer({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: ExemptionRuleRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ExemptionRuleRow, "id"> & { id?: string }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [reasonCategory, setReasonCategory] = useState<ExemptionReason>(
    value?.reasonCategory ?? "other",
  );
  const [documentationRequired, setDocumentationRequired] = useState(
    value?.documentationRequired ?? false,
  );
  const [approvalRequired, setApprovalRequired] = useState(value?.approvalRequired ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit exemption rule" : "Add exemption rule"}
      description="Configuration only. This does not apply an exemption to a reservation or folio."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save exemption rule"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description,
          reasonCategory,
          documentationRequired,
          approvalRequired,
          active,
        })
      }
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          onCode={setCode}
          onName={setName}
        />
        <div className="space-y-1">
          <Label>Reason category</Label>
          <Select
            value={reasonCategory}
            disabled={!canEdit}
            onValueChange={(next) => setReasonCategory(next as ExemptionReason)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXEMPTION_REASONS.map((row) => (
                <SelectItem key={row} value={row}>
                  {EXEMPTION_REASON_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rule-desc">Description</Label>
          <Input
            id="rule-desc"
            value={description}
            disabled={!canEdit}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="rule-docs">Documentation required</Label>
          <Switch
            id="rule-docs"
            checked={documentationRequired}
            disabled={!canEdit}
            onCheckedChange={setDocumentationRequired}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2">
          <Label htmlFor="rule-approval">Approval required</Label>
          <Switch
            id="rule-approval"
            checked={approvalRequired}
            disabled={!canEdit}
            onCheckedChange={setApprovalRequired}
          />
        </div>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}
