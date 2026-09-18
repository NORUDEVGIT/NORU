import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
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
  type Card3TaxesTabId,
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
  onBack,
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
  const [tab, setTab] = useState<Card3TaxesTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
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
    () => taxes.filter((row) => matchesQuery(search, row.code, row.name, row.basis, row.chargeType)),
    [taxes, search],
  );
  const filteredGroups = useMemo(
    () => groups.filter((row) => matchesQuery(search, row.code, row.name)),
    [groups, search],
  );
  const filteredServices = useMemo(
    () => services.filter((row) => matchesQuery(search, row.code, row.name, row.basis)),
    [services, search],
  );
  const filteredFees = useMemo(
    () => fees.filter((row) => matchesQuery(search, row.code, row.name, row.basis)),
    [fees, search],
  );
  const filteredRules = useMemo(
    () => rules.filter((row) => matchesQuery(search, row.code, row.name, row.reasonCategory, row.description)),
    [rules, search],
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

  const searchPlaceholder =
    tab === "taxes"
      ? "Search taxes"
      : tab === "tax-groups"
        ? "Search tax groups"
        : tab === "service-charges"
          ? "Search service charges"
          : tab === "fees"
            ? "Search fees"
            : tab === "exemptions"
              ? "Search exemption rules"
              : "";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3TaxesTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_TAXES_TABS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} data-testid={`card3-taxes-tab-${item.id}`}>
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
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="max-w-sm"
            />
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(query.data?.audit ?? []).length === 0 ? (
                  <li className="text-muted-foreground">No tax catalogue changes recorded yet.</li>
                ) : (
                  (query.data?.audit ?? []).map((row) => (
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
          <p className="text-sm text-muted-foreground">Loading taxes and fees…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ?? "Taxes & Fees are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-taxes">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  {CARD3_TAXES_SET1_COPY}
                </p>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(query.data?.readiness.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {taxes.length} taxes · {groups.length} groups · {services.length} service charges · {fees.length} fees ·{" "}
                  {rules.length} exemption rules
                </p>
                {(query.data?.readiness.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {query.data?.readiness.blockers.map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "taxes" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setTaxDraft(row),
                }))}
                onAdd={() => setTaxDraft("new")}
              />
            ) : null}

            {tab === "tax-groups" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setGroupDraft(row),
                }))}
                onAdd={() => setGroupDraft("new")}
              />
            ) : null}

            {tab === "service-charges" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setServiceDraft(row),
                }))}
                onAdd={() => setServiceDraft("new")}
              />
            ) : null}

            {tab === "fees" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setFeeDraft(row),
                }))}
                onAdd={() => setFeeDraft("new")}
              />
            ) : null}

            {tab === "exemptions" ? (
              <CatalogueTable
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
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setRuleDraft(row),
                }))}
                onAdd={() => setRuleDraft("new")}
              />
            ) : null}

            <TaxDrawer
              key={taxDraft === "new" ? "tax-new" : taxDraft?.id ?? "tax-closed"}
              open={taxDraft !== null}
              canEdit={canEdit}
              value={taxDraft === "new" || taxDraft === null ? null : taxDraft}
              pending={taxMut.isPending}
              onClose={() => setTaxDraft(null)}
              onSave={(payload) => taxMut.mutate({ restaurantId, ...payload })}
            />
            <GroupDrawer
              key={groupDraft === "new" ? "group-new" : groupDraft?.id ?? "group-closed"}
              open={groupDraft !== null}
              canEdit={canEdit}
              taxes={taxes}
              value={groupDraft === "new" || groupDraft === null ? null : groupDraft}
              pending={groupMut.isPending}
              onClose={() => setGroupDraft(null)}
              onSave={(payload) => groupMut.mutate({ restaurantId, ...payload })}
            />
            <ServiceDrawer
              key={serviceDraft === "new" ? "svc-new" : serviceDraft?.id ?? "svc-closed"}
              open={serviceDraft !== null}
              canEdit={canEdit}
              value={serviceDraft === "new" || serviceDraft === null ? null : serviceDraft}
              pending={serviceMut.isPending}
              onClose={() => setServiceDraft(null)}
              onSave={(payload) => serviceMut.mutate({ restaurantId, ...payload })}
            />
            <FeeDrawer
              key={feeDraft === "new" ? "fee-new" : feeDraft?.id ?? "fee-closed"}
              open={feeDraft !== null}
              canEdit={canEdit}
              value={feeDraft === "new" || feeDraft === null ? null : feeDraft}
              pending={feeMut.isPending}
              onClose={() => setFeeDraft(null)}
              onSave={(payload) => feeMut.mutate({ restaurantId, ...payload })}
            />
            <RuleDrawer
              key={ruleDraft === "new" ? "rule-new" : ruleDraft?.id ?? "rule-closed"}
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
        <Button type="button" onClick={onAdd} className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
          {addLabel}
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2">
                  {column}
                </th>
              ))}
              <th className="px-3 py-2" />
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
                    <td key={`${row.id}-${index}`} className="px-3 py-2">
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Button type="button" variant="outline" size="sm" onClick={row.onEdit}>
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
        <Input id="setup-name" value={name} disabled={!canEdit} onChange={(event) => onName(event.target.value)} />
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
        <Select value={chargeType} disabled={!canEdit} onValueChange={(value) => onType(value as TaxChargeType)}>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit tax" : "Add tax"}</SheetTitle>
          <SheetDescription>Catalogue only. This does not change the SET1 till rate.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, code, name, chargeType, amount, basis, calculation, active });
          }}
        >
          <CodeFields code={code} name={name} locked={Boolean(value)} canEdit={canEdit} onCode={setCode} onName={setName} />
          <ChargeTypeFields
            chargeType={chargeType}
            amount={amount}
            canEdit={canEdit}
            onType={setChargeType}
            onAmount={setAmount}
          />
          <div className="space-y-1">
            <Label>Basis</Label>
            <Select value={basis} disabled={!canEdit} onValueChange={(next) => setBasis(next as TaxBasis)}>
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
            <Select value={calculation} disabled={!canEdit} onValueChange={(next) => setCalculation(next as TaxCalculation)}>
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
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save tax
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
  onSave: (payload: { id?: string; code: string; name: string; active: boolean; taxIds: string[] }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [taxIds, setTaxIds] = useState<string[]>(value?.taxIds ?? []);

  function toggle(id: string, checked: boolean) {
    setTaxIds((current) => (checked ? [...current, id] : current.filter((row) => row !== id)));
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit tax group" : "Add tax group"}</SheetTitle>
          <SheetDescription>Assign taxes from this property only.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, code, name, active, taxIds });
          }}
        >
          <CodeFields code={code} name={name} locked={Boolean(value)} canEdit={canEdit} onCode={setCode} onName={setName} />
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
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save tax group
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit service charge" : "Add service charge"}</SheetTitle>
          <SheetDescription>Catalogue only. This does not change the SET1 service rate.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, code, name, chargeType, amount, basis, active });
          }}
        >
          <CodeFields code={code} name={name} locked={Boolean(value)} canEdit={canEdit} onCode={setCode} onName={setName} />
          <ChargeTypeFields
            chargeType={chargeType}
            amount={amount}
            canEdit={canEdit}
            onType={setChargeType}
            onAmount={setAmount}
          />
          <div className="space-y-1">
            <Label>Basis</Label>
            <Select value={basis} disabled={!canEdit} onValueChange={(next) => setBasis(next as TaxBasis)}>
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
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save service charge
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit fee" : "Add fee"}</SheetTitle>
          <SheetDescription>Additional charges only. Cancel and no-show fees stay in Front Office policy.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({ id: value?.id, code, name, chargeType, amount, basis, active });
          }}
        >
          <CodeFields code={code} name={name} locked={Boolean(value)} canEdit={canEdit} onCode={setCode} onName={setName} />
          <ChargeTypeFields
            chargeType={chargeType}
            amount={amount}
            canEdit={canEdit}
            onType={setChargeType}
            onAmount={setAmount}
          />
          <div className="space-y-1">
            <Label>Basis</Label>
            <Select value={basis} disabled={!canEdit} onValueChange={(next) => setBasis(next as FeeBasis)}>
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
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save fee
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
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
  const [reasonCategory, setReasonCategory] = useState<ExemptionReason>(value?.reasonCategory ?? "other");
  const [documentationRequired, setDocumentationRequired] = useState(value?.documentationRequired ?? false);
  const [approvalRequired, setApprovalRequired] = useState(value?.approvalRequired ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit exemption rule" : "Add exemption rule"}</SheetTitle>
          <SheetDescription>Configuration only. This does not apply an exemption to a reservation or folio.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({
              id: value?.id,
              code,
              name,
              description,
              reasonCategory,
              documentationRequired,
              approvalRequired,
              active,
            });
          }}
        >
          <CodeFields code={code} name={name} locked={Boolean(value)} canEdit={canEdit} onCode={setCode} onName={setName} />
          <div className="space-y-1">
            <Label>Reason category</Label>
            <Select value={reasonCategory} disabled={!canEdit} onValueChange={(next) => setReasonCategory(next as ExemptionReason)}>
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
            <Input id="rule-desc" value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="rule-docs">Documentation required</Label>
            <Switch id="rule-docs" checked={documentationRequired} disabled={!canEdit} onCheckedChange={setDocumentationRequired} />
          </div>
          <div className="flex items-center justify-between rounded-xl border px-3 py-2">
            <Label htmlFor="rule-approval">Approval required</Label>
            <Switch id="rule-approval" checked={approvalRequired} disabled={!canEdit} onCheckedChange={setApprovalRequired} />
          </div>
          <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
          {canEdit ? (
            <Button type="submit" disabled={pending} className="w-full bg-[#C89933] text-[#251605]">
              Save exemption rule
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
