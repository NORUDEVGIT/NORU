import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import { PROPERTY_SETUP_CONTROL_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import {
  suggestTaxSetupCode,
  taxSetupCodeIsTaken,
} from "@/packages/pms/lib/taxes-card3-code";
import {
  getTaxesCard3,
  saveDefaultRoomTaxGroupCard3,
  saveExemptionRuleCard3,
  saveFeeCard3,
  saveServiceChargeCard3,
  saveTaxCard3,
  saveTaxGroupCard3,
} from "@/packages/pms/lib/taxes-card3.functions";
import {
  CARD3_TAXES_SET1_COPY,
  CARD3_TAXES_TABS,
  amountIsValid,
  EXEMPTION_REASON_LABELS,
  EXEMPTION_REASONS,
  FEE_BASIS,
  FEE_BASIS_LABELS,
  TAX_APPLICABILITY_LABELS,
  TAX_APPLICABILITY_SCOPES,
  TAX_CALCULATION_LABELS,
  TAX_CALCULATIONS,
  TAX_CHARGE_TYPE_LABELS,
  TAX_CHARGE_TYPES,
  type ExemptionReason,
  type ExemptionRuleRow,
  type FeeBasis,
  type FeeRow,
  type ServiceChargeRow,
  type TaxApplicabilityScope,
  type TaxCalculation,
  type TaxDepartmentOption,
  type TaxChargeType,
  type TaxGroupRow,
  type TaxRow,
  type TaxesCard3Snapshot,
} from "@/packages/pms/lib/taxes-card3.server";

/** Rectangular NORU field — Rate Plan radius (6px), height, and gold focus. */
const TAX_FIELD_CLASS = cn(
  PROPERTY_SETUP_CONTROL_CLASS,
  "h-9 rounded-[6px] shadow-none focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const TAX_SELECT_CLASS = cn(TAX_FIELD_CLASS, "justify-between [&>span]:line-clamp-1");

const TAX_SELECT_CONTENT_CLASS = "z-[100] rounded-[6px] border border-[#E6E1D8]";

const TAX_TOGGLE_ROW_CLASS =
  "flex items-center justify-between rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2";

const TAX_CODE_CONFLICT = "That code is already used. Change the name to generate a different one.";
const TAX_CODE_CONFLICT_WITH_RATE =
  "That code is already used. Change the name or rate to generate a different one.";

function matchesQuery(query: string, ...values: string[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => value.toLowerCase().includes(q));
}

function readIssueMessages(raw: string): string | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const issues = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(issues) || issues.length === 0) return null;
    const messages = issues
      .map((issue) => (typeof issue?.message === "string" ? issue.message.trim() : ""))
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : "Please check the form and try again.";
  } catch {
    return null;
  }
}

function blockUnusableCode(options: {
  name: string;
  code: string;
  conflict: boolean;
  conflictMessage: string;
}): boolean {
  if (!options.name.trim() || !options.code.trim()) {
    toast.error("Enter a name before saving.");
    return true;
  }
  if (options.conflict) {
    toast.error(options.conflictMessage);
    return true;
  }
  return false;
}

function taxAmountLabel(tax: Pick<TaxRow, "chargeType" | "amount">): string {
  return tax.chargeType === "percentage" ? `${tax.amount}%` : String(tax.amount);
}

function taxSummaryLine(tax: Pick<TaxRow, "name" | "chargeType" | "amount">): string {
  return `${tax.name} · ${taxAmountLabel(tax)}`;
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
  const saveDefaultRoomTaxGroup = useServerFn(saveDefaultRoomTaxGroupCard3);
  const saveTax = useServerFn(saveTaxCard3);
  const saveTaxGroup = useServerFn(saveTaxGroupCard3);
  const saveService = useServerFn(saveServiceChargeCard3);
  const saveFee = useServerFn(saveFeeCard3);
  const saveRule = useServerFn(saveExemptionRuleCard3);
  const [taxSearch, setTaxSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [taxDraft, setTaxDraft] = useState<TaxRow | "new" | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ServiceChargeRow | "new" | null>(null);
  const [feeDraft, setFeeDraft] = useState<FeeRow | "new" | null>(null);
  const [ruleDraft, setRuleDraft] = useState<ExemptionRuleRow | "new" | null>(null);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState<TaxGroupRow | "new" | null>(null);

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
      taxes.filter((row) =>
        matchesQuery(
          taxSearch,
          row.code,
          row.name,
          row.basis,
          TAX_APPLICABILITY_LABELS[row.applicabilityScope ?? "all"],
          row.chargeType,
        ),
      ),
    [taxes, taxSearch],
  );
  const filteredServices = useMemo(
    () =>
      services.filter((row) =>
        matchesQuery(
          serviceSearch,
          row.code,
          row.name,
          row.basis,
          TAX_APPLICABILITY_LABELS[row.applicabilityScope ?? "all"],
        ),
      ),
    [services, serviceSearch],
  );
  const filteredFees = useMemo(
    () => fees.filter((row) => matchesQuery(feeSearch, row.code, row.name, row.basis)),
    [fees, feeSearch],
  );
  const filteredRules = useMemo(
    () =>
      rules.filter((row) =>
        matchesQuery(
          ruleSearch,
          row.code,
          row.name,
          row.reasonCategory,
          EXEMPTION_REASON_LABELS[row.reasonCategory] ?? "",
          row.customReason ?? "",
          row.description,
        ),
      ),
    [rules, ruleSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-taxes", restaurantId] });
  }
  function friendlyValidationError(error: Error): string {
    const raw = error.message?.trim() ?? "";
    const issues = readIssueMessages(raw);
    if (issues) return issues;
    if (/duplicate key|unique constraint|already exists|23505/i.test(raw)) {
      return TAX_CODE_CONFLICT;
    }
    if (/check constraint|invalid input|zod/i.test(raw)) {
      return "Please check the form and try again.";
    }
    return raw || "Please check the form and try again.";
  }

  const taxMut = useMutation({
    mutationFn: (input: Parameters<typeof saveTax>[0]["data"]) => saveTax({ data: input }),
    onSuccess: () => {
      toast.success("Tax saved.");
      setTaxDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });
  const serviceMut = useMutation({
    mutationFn: (input: Parameters<typeof saveService>[0]["data"]) => saveService({ data: input }),
    onSuccess: () => {
      toast.success("Service charge saved.");
      setServiceDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });
  const feeMut = useMutation({
    mutationFn: (input: Parameters<typeof saveFee>[0]["data"]) => saveFee({ data: input }),
    onSuccess: () => {
      toast.success("Fee saved.");
      setFeeDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });
  const ruleMut = useMutation({
    mutationFn: (input: Parameters<typeof saveRule>[0]["data"]) => saveRule({ data: input }),
    onSuccess: () => {
      toast.success("Exemption rule saved.");
      setRuleDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });
  const defaultRoomTaxGroupMut = useMutation({
    mutationFn: (taxGroupId: string | null) =>
      saveDefaultRoomTaxGroup({ data: { restaurantId, taxGroupId } }),
    onSuccess: () => {
      toast.success("Default room tax group saved.");
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });
  const groupMut = useMutation({
    mutationFn: (input: Parameters<typeof saveTaxGroup>[0]["data"]) =>
      saveTaxGroup({ data: input }),
    onSuccess: () => {
      toast.success("Tax group saved.");
      setGroupDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });

  void CARD3_TAXES_TABS;

  const selectedDefaultGroup = snapshot?.defaultRoomTaxGroupId
    ? groups.find((group) => group.id === snapshot.defaultRoomTaxGroupId) ?? null
    : null;
  const selectedDefaultTaxes = selectedDefaultGroup
    ? taxes.filter((tax) => selectedDefaultGroup.taxIds.includes(tax.id))
    : [];
  const defaultGroupOptions = groups.filter(
    (group) => group.active || group.id === snapshot?.defaultRoomTaxGroupId,
  );

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading taxes and fees…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Taxes & Fees are unavailable."}
        </p>
      ) : (
        <div className="space-y-3" data-testid="pms-card3-taxes">
          <p className="text-sm text-muted-foreground">{CARD3_TAXES_SET1_COPY}</p>
          <section
            className="rounded-xl border border-[#E6E1D8] bg-white p-4"
            data-testid="card3-default-room-tax-group"
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="default-room-tax-group" className="text-[#251605]">
                  Default room tax group
                </Label>
                <p className="text-xs text-muted-foreground">
                  Applied automatically to room charges when configured.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={snapshot.defaultRoomTaxGroupId ?? "__none__"}
                  onValueChange={(value) => {
                    if (!canEdit || defaultRoomTaxGroupMut.isPending) return;
                    defaultRoomTaxGroupMut.mutate(value === "__none__" ? null : value);
                  }}
                  disabled={!canEdit || defaultRoomTaxGroupMut.isPending}
                >
                  <SelectTrigger
                    id="default-room-tax-group"
                    className={cn(TAX_SELECT_CLASS, "max-w-md")}
                  >
                    <SelectValue placeholder="No default group" />
                  </SelectTrigger>
                  <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
                    <SelectItem value="__none__">No default group</SelectItem>
                    {defaultGroupOptions.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                        {!group.active ? " (inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-[6px] border-[#CCCCCC] text-[#251605]"
                  data-testid="manage-tax-groups"
                  onClick={() => {
                    setGroupDraft(null);
                    setManageGroupsOpen(true);
                  }}
                >
                  Manage tax groups
                </Button>
              </div>
              {selectedDefaultGroup ? (
                <div
                  className="rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] px-3 py-2.5"
                  data-testid="default-room-tax-group-summary"
                >
                  <p className="text-sm font-medium text-[#251605]">{selectedDefaultGroup.name}</p>
                  {selectedDefaultTaxes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {selectedDefaultTaxes.map((tax) => (
                        <li key={tax.id} className="text-xs text-[#756A5B]">
                          {taxSummaryLine(tax)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No taxes are linked to this group yet.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </section>
          <Card3ListSection
            title="Taxes"
            icon="tax"
            search={taxSearch}
            onSearch={setTaxSearch}
            placeholder="Search taxes"
            canEdit={canEdit}
            addLabel="Add tax"
            empty="No taxes saved yet."
            columns={["Code", "Name", "Type", "Amount", "Applies to", "Calculation", "Status"]}
            rows={filteredTaxes.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                TAX_CHARGE_TYPE_LABELS[row.chargeType],
                String(row.amount),
                TAX_APPLICABILITY_LABELS[row.applicabilityScope ?? "all"],
                TAX_CALCULATION_LABELS[row.calculation],
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setTaxDraft(row),
            }))}
            onAdd={() => setTaxDraft("new")}
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
            columns={["Code", "Name", "Type", "Amount", "Applies to", "Status"]}
            rows={filteredServices.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                TAX_CHARGE_TYPE_LABELS[row.chargeType],
                String(row.amount),
                TAX_APPLICABILITY_LABELS[row.applicabilityScope ?? "all"],
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
            empty="No exemption rules saved yet."
            columns={["Code", "Name", "Reason", "Docs", "Approval", "Status"]}
            rows={filteredRules.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.reasonCategory === "other" && row.customReason
                  ? `${EXEMPTION_REASON_LABELS.other} (${row.customReason})`
                  : (EXEMPTION_REASON_LABELS[row.reasonCategory] ?? row.reasonCategory),
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
            departments={snapshot?.departments ?? []}
            existingCodes={taxes.map((row) => row.code)}
            value={taxDraft === "new" || taxDraft === null ? null : taxDraft}
            pending={taxMut.isPending}
            onClose={() => setTaxDraft(null)}
            onSave={(payload) => taxMut.mutate({ restaurantId, ...payload })}
          />
          <ServiceDrawer
            key={serviceDraft === "new" ? "svc-new" : (serviceDraft?.id ?? "svc-closed")}
            open={serviceDraft !== null}
            canEdit={canEdit}
            departments={snapshot?.departments ?? []}
            existingCodes={services.map((row) => row.code)}
            value={serviceDraft === "new" || serviceDraft === null ? null : serviceDraft}
            pending={serviceMut.isPending}
            onClose={() => setServiceDraft(null)}
            onSave={(payload) => serviceMut.mutate({ restaurantId, ...payload })}
          />
          <FeeDrawer
            key={feeDraft === "new" ? "fee-new" : (feeDraft?.id ?? "fee-closed")}
            open={feeDraft !== null}
            canEdit={canEdit}
            existingCodes={fees.map((row) => row.code)}
            value={feeDraft === "new" || feeDraft === null ? null : feeDraft}
            pending={feeMut.isPending}
            onClose={() => setFeeDraft(null)}
            onSave={(payload) => feeMut.mutate({ restaurantId, ...payload })}
          />
          <RuleDrawer
            key={ruleDraft === "new" ? "rule-new" : (ruleDraft?.id ?? "rule-closed")}
            open={ruleDraft !== null}
            canEdit={canEdit}
            existingCodes={rules.map((row) => row.code)}
            value={ruleDraft === "new" || ruleDraft === null ? null : ruleDraft}
            pending={ruleMut.isPending}
            onClose={() => setRuleDraft(null)}
            onSave={(payload) => ruleMut.mutate({ restaurantId, ...payload })}
          />
          <ManageTaxGroupsDialog
            open={manageGroupsOpen}
            canEdit={canEdit}
            groups={groups}
            taxes={taxes}
            draft={groupDraft}
            pending={groupMut.isPending}
            onDraftChange={setGroupDraft}
            onClose={() => {
              setManageGroupsOpen(false);
              setGroupDraft(null);
            }}
            onSave={(payload) => groupMut.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function SetupField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[#251605]">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CodeFields({
  code,
  name,
  locked,
  canEdit,
  codeError,
  hint,
  onName,
}: {
  code: string;
  name: string;
  locked: boolean;
  canEdit: boolean;
  codeError?: string | null;
  hint: string;
  onName: (value: string) => void;
}) {
  return (
    <>
      <SetupField label="Code" htmlFor="setup-code" hint={hint} error={codeError}>
        <div className="relative">
          <Input
            id="setup-code"
            value={code}
            readOnly
            aria-readonly="true"
            aria-invalid={codeError ? true : undefined}
            autoComplete="off"
            tabIndex={0}
            className={cn(
              TAX_FIELD_CLASS,
              "cursor-default font-mono uppercase read-only:cursor-default",
              !locked && code && "pr-14",
            )}
            onChange={() => {}}
            onBeforeInput={(event) => event.preventDefault()}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
          />
          {!locked && code ? (
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#EDE6D8] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5C4528]"
              data-testid="setup-code-auto"
            >
              Auto
            </span>
          ) : null}
        </div>
      </SetupField>
      <SetupField label="Name" htmlFor="setup-name">
        <Input
          id="setup-name"
          value={name}
          disabled={!canEdit}
          className={TAX_FIELD_CLASS}
          onChange={(event) => onName(event.target.value)}
        />
      </SetupField>
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
      <SetupField label="Type">
        <Select
          value={chargeType}
          disabled={!canEdit}
          onValueChange={(value) => onType(value as TaxChargeType)}
        >
          <SelectTrigger className={TAX_SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
            {TAX_CHARGE_TYPES.map((row) => (
              <SelectItem key={row} value={row}>
                {TAX_CHARGE_TYPE_LABELS[row]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SetupField>
      <SetupField
        label={chargeType === "percentage" ? "Rate (%)" : "Amount"}
        htmlFor="setup-amount"
      >
        <Input
          id="setup-amount"
          type="number"
          min={0}
          step="any"
          value={amount}
          disabled={!canEdit}
          className={TAX_FIELD_CLASS}
          onChange={(event) => onAmount(Number(event.target.value))}
        />
      </SetupField>
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
    <div className={TAX_TOGGLE_ROW_CLASS}>
      <Label htmlFor="setup-active" className="text-[#251605]">
        Active
      </Label>
      <Switch id="setup-active" checked={active} disabled={!canEdit} onCheckedChange={onChange} />
    </div>
  );
}

function AppliesToFields({
  scope,
  departmentIds,
  departments,
  canEdit,
  onScope,
  onDepartments,
}: {
  scope: TaxApplicabilityScope;
  departmentIds: string[];
  departments: TaxDepartmentOption[];
  canEdit: boolean;
  onScope: (scope: TaxApplicabilityScope) => void;
  onDepartments: (ids: string[]) => void;
}) {
  const choices =
    scope === "folio"
      ? (["folio", ...TAX_APPLICABILITY_SCOPES] as const)
      : TAX_APPLICABILITY_SCOPES;
  return (
    <div className="space-y-3">
      <SetupField label="Applies to">
        <Select
          value={scope}
          disabled={!canEdit}
          onValueChange={(next) => onScope(next as TaxApplicabilityScope)}
        >
          <SelectTrigger className={TAX_SELECT_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
            {choices.map((row) => (
              <SelectItem key={row} value={row}>
                {TAX_APPLICABILITY_LABELS[row]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SetupField>
      {scope === "departments" ? (
        <div className="space-y-2">
          <Label>Departments</Label>
          {departments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active departments are set up yet.</p>
          ) : (
            departments.map((department) => {
              const checked = departmentIds.includes(department.id);
              return (
                <label key={department.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    onChange={(event) => {
                      onDepartments(
                        event.target.checked
                          ? [...departmentIds, department.id]
                          : departmentIds.filter((id) => id !== department.id),
                      );
                    }}
                  />
                  <span>
                    {department.name}
                    {department.code ? ` (${department.code})` : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function TaxDrawer({
  open,
  canEdit,
  departments,
  existingCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  departments: TaxDepartmentOption[];
  existingCodes: string[];
  value: TaxRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<TaxRow, "id"> & { id?: string }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "percentage");
  const [amount, setAmount] = useState(value?.amount ?? 15);
  const [scope, setScope] = useState<TaxApplicabilityScope>(value?.applicabilityScope ?? "all");
  const [departmentIds, setDepartmentIds] = useState<string[]>(value?.departmentIds ?? []);
  const [calculation, setCalculation] = useState<TaxCalculation>(value?.calculation ?? "exclusive");
  const [active, setActive] = useState(value?.active ?? true);
  const includeRate = chargeType === "percentage" && amountIsValid("percentage", amount);
  const code = value
    ? value.code
    : suggestTaxSetupCode(name, { percentageRate: includeRate ? amount : null });
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);
  const conflictMessage = includeRate ? TAX_CODE_CONFLICT_WITH_RATE : TAX_CODE_CONFLICT;

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit tax" : "Add tax"}
      description="Applied to matching charges at cashiering."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save tax"
      onSubmit={() => {
        if (blockUnusableCode({ name, code, conflict: codeConflict, conflictMessage })) return;
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis: value?.basis ?? "all",
          applicabilityScope: scope,
          departmentIds: scope === "departments" ? departmentIds : [],
          calculation,
          active,
        });
      }}
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          codeError={codeConflict ? conflictMessage : null}
          hint={
            value
              ? "Saved with this record. Editing the name will not change it."
              : includeRate
                ? "Generated from the name and rate. Letters, numbers, and underscores only."
                : "Generated from the name. Letters, numbers, and underscores only."
          }
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <AppliesToFields
          scope={scope}
          departmentIds={departmentIds}
          departments={departments}
          canEdit={canEdit}
          onScope={setScope}
          onDepartments={setDepartmentIds}
        />
        <SetupField label="Calculation">
          <Select
            value={calculation}
            disabled={!canEdit}
            onValueChange={(next) => setCalculation(next as TaxCalculation)}
          >
            <SelectTrigger className={TAX_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
              {TAX_CALCULATIONS.map((row) => (
                <SelectItem key={row} value={row}>
                  {TAX_CALCULATION_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function ServiceDrawer({
  open,
  canEdit,
  departments,
  existingCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  departments: TaxDepartmentOption[];
  existingCodes: string[];
  value: ServiceChargeRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ServiceChargeRow, "id"> & { id?: string }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "percentage");
  const [amount, setAmount] = useState(value?.amount ?? 10);
  const [scope, setScope] = useState<TaxApplicabilityScope>(
    value?.applicabilityScope ?? "services",
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(value?.departmentIds ?? []);
  const [active, setActive] = useState(value?.active ?? true);
  const code = value ? value.code : suggestTaxSetupCode(name);
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit service charge" : "Add service charge"}
      description="Applied to matching charges at cashiering."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save service charge"
      onSubmit={() => {
        if (
          blockUnusableCode({
            name,
            code,
            conflict: codeConflict,
            conflictMessage: TAX_CODE_CONFLICT,
          })
        ) {
          return;
        }
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis: value?.basis ?? "fnb",
          applicabilityScope: scope,
          departmentIds: scope === "departments" ? departmentIds : [],
          active,
        });
      }}
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          codeError={codeConflict ? TAX_CODE_CONFLICT : null}
          hint={
            value
              ? "Saved with this record. Editing the name will not change it."
              : "Generated from the name. Letters, numbers, and underscores only."
          }
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <AppliesToFields
          scope={scope}
          departmentIds={departmentIds}
          departments={departments}
          canEdit={canEdit}
          onScope={setScope}
          onDepartments={setDepartmentIds}
        />
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function FeeDrawer({
  open,
  canEdit,
  existingCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  existingCodes: string[];
  value: FeeRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<FeeRow, "id"> & { id?: string }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [chargeType, setChargeType] = useState<TaxChargeType>(value?.chargeType ?? "fixed");
  const [amount, setAmount] = useState(value?.amount ?? 5);
  const [basis, setBasis] = useState<FeeBasis>(value?.basis ?? "stay");
  const [active, setActive] = useState(value?.active ?? true);
  const code = value ? value.code : suggestTaxSetupCode(name);
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit fee" : "Add fee"}
      description="Additional charges only. Cancel and no-show fees stay in Front Office policy."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save fee"
      onSubmit={() => {
        if (
          blockUnusableCode({
            name,
            code,
            conflict: codeConflict,
            conflictMessage: TAX_CODE_CONFLICT,
          })
        ) {
          return;
        }
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          chargeType,
          amount,
          basis,
          active,
        });
      }}
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          codeError={codeConflict ? TAX_CODE_CONFLICT : null}
          hint={
            value
              ? "Saved with this record. Editing the name will not change it."
              : "Generated from the name. Letters, numbers, and underscores only."
          }
          onName={setName}
        />
        <ChargeTypeFields
          chargeType={chargeType}
          amount={amount}
          canEdit={canEdit}
          onType={setChargeType}
          onAmount={setAmount}
        />
        <SetupField label="Basis">
          <Select
            value={basis}
            disabled={!canEdit}
            onValueChange={(next) => setBasis(next as FeeBasis)}
          >
            <SelectTrigger className={TAX_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
              {FEE_BASIS.map((row) => (
                <SelectItem key={row} value={row}>
                  {FEE_BASIS_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
        <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}

function RuleDrawer({
  open,
  canEdit,
  existingCodes,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  existingCodes: string[];
  value: ExemptionRuleRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ExemptionRuleRow, "id"> & { id?: string }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [reasonCategory, setReasonCategory] = useState<ExemptionReason>(
    value?.reasonCategory ?? "government",
  );
  const [customReason, setCustomReason] = useState(value?.customReason ?? "");
  const [documentationRequired, setDocumentationRequired] = useState(
    value?.documentationRequired ?? false,
  );
  const [approvalRequired, setApprovalRequired] = useState(value?.approvalRequired ?? false);
  const [active, setActive] = useState(value?.active ?? true);
  const code = value ? value.code : suggestTaxSetupCode(name);
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit exemption rule" : "Add exemption rule"}
      description="Defines when an exemption can be requested."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save exemption rule"
      onSubmit={() => {
        if (
          blockUnusableCode({
            name,
            code,
            conflict: codeConflict,
            conflictMessage: TAX_CODE_CONFLICT,
          })
        ) {
          return;
        }
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description,
          reasonCategory,
          customReason:
            reasonCategory === "other" && customReason.trim() ? customReason.trim() : null,
          documentationRequired,
          approvalRequired,
          active,
        });
      }}
    >
      <div className="space-y-3">
        <CodeFields
          code={code}
          name={name}
          locked={Boolean(value)}
          canEdit={canEdit}
          codeError={codeConflict ? TAX_CODE_CONFLICT : null}
          hint={
            value
              ? "Saved with this record. Editing the name will not change it."
              : "Generated from the name. Letters, numbers, and underscores only."
          }
          onName={setName}
        />
        <SetupField label="Reason category">
          <Select
            value={reasonCategory}
            disabled={!canEdit}
            onValueChange={(next) => setReasonCategory(next as ExemptionReason)}
          >
            <SelectTrigger className={TAX_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={TAX_SELECT_CONTENT_CLASS}>
              {EXEMPTION_REASONS.map((row) => (
                <SelectItem key={row} value={row}>
                  {EXEMPTION_REASON_LABELS[row]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
        {reasonCategory === "other" && (
          <SetupField label="Custom reason" htmlFor="rule-custom-reason">
            <Input
              id="rule-custom-reason"
              placeholder="Enter custom reason"
              value={customReason}
              disabled={!canEdit}
              className={TAX_FIELD_CLASS}
              onChange={(event) => setCustomReason(event.target.value)}
            />
          </SetupField>
        )}
        <SetupField label="Description" htmlFor="rule-desc">
          <Input
            id="rule-desc"
            value={description}
            disabled={!canEdit}
            className={TAX_FIELD_CLASS}
            onChange={(event) => setDescription(event.target.value)}
          />
        </SetupField>
        <div className={TAX_TOGGLE_ROW_CLASS}>
          <Label htmlFor="rule-docs" className="text-[#251605]">
            Documentation required
          </Label>
          <Switch
            id="rule-docs"
            checked={documentationRequired}
            disabled={!canEdit}
            onCheckedChange={setDocumentationRequired}
          />
        </div>
        <div className={TAX_TOGGLE_ROW_CLASS}>
          <Label htmlFor="rule-approval" className="text-[#251605]">
            Approval required
          </Label>
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

function ManageTaxGroupsDialog({
  open,
  canEdit,
  groups,
  taxes,
  draft,
  pending,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  groups: TaxGroupRow[];
  taxes: TaxRow[];
  draft: TaxGroupRow | "new" | null;
  pending: boolean;
  onDraftChange: (value: TaxGroupRow | "new" | null) => void;
  onClose: () => void;
  onSave: (payload: Omit<TaxGroupRow, "id"> & { id?: string }) => void;
}) {
  const editing = draft !== null;
  const editorValue = draft === "new" || draft === null ? null : draft;
  const taxById = useMemo(() => new Map(taxes.map((tax) => [tax.id, tax])), [taxes]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-[#1F140A]/60 z-[70]"
        className="z-[80] flex max-h-[90vh] w-[min(560px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white p-0 shadow-xl sm:max-w-none [&>button.absolute]:hidden"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="manage-tax-groups-dialog"
      >
        <DialogHeader className="relative shrink-0 space-y-0.5 bg-[#1F140A] px-5 py-2.5 pr-12 text-left">
          <DialogTitle className="font-display text-sm font-semibold text-white">
            {editing ? (editorValue ? "Edit tax group" : "Add tax group") : "Manage tax groups"}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#C4B6A0]">
            {editing
              ? "Group existing taxes for room charges. Taxes stay in the catalogue."
              : "Create groups from the Taxes catalogue, then choose one as the room default."}
          </DialogDescription>
          <button
            type="button"
            className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C89933]" aria-hidden />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {editing ? (
            <TaxGroupEditor
              key={editorValue?.id ?? "group-new"}
              canEdit={canEdit}
              taxes={taxes}
              existingCodes={groups.map((group) => group.code)}
              value={editorValue}
              pending={pending}
              onCancel={() => onDraftChange(null)}
              onSave={onSave}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {groups.length === 0
                    ? "No tax groups yet."
                    : `${groups.length} tax group${groups.length === 1 ? "" : "s"}`}
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="h-9 rounded-[6px] bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
                    data-testid="add-tax-group"
                    onClick={() => onDraftChange("new")}
                  >
                    Add tax group
                  </Button>
                ) : null}
              </div>
              {groups.length === 0 ? (
                <div className="rounded-[6px] border border-dashed border-[#D9D2C4] bg-[#FBF9F5] px-4 py-8 text-center">
                  <p className="text-sm text-[#251605]">Create a group for room taxes</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Example: Standard Room Taxes with Value Added Tax.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#EDE6D8] rounded-[6px] border border-[#E6E1D8]">
                  {groups.map((group) => {
                    const linked = group.taxIds
                      .map((id) => taxById.get(id))
                      .filter((tax): tax is TaxRow => Boolean(tax));
                    return (
                      <li
                        key={group.id}
                        className="flex items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-[#251605]">{group.name}</p>
                            <Card3StatusDot active={group.active} />
                          </div>
                          <p className="font-mono text-[11px] uppercase tracking-wide text-[#756A5B]">
                            {group.code}
                          </p>
                          {linked.length > 0 ? (
                            <ul className="space-y-0.5">
                              {linked.map((tax) => (
                                <li key={tax.id} className="text-xs text-[#756A5B]">
                                  {taxSummaryLine(tax)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">No taxes linked</p>
                          )}
                        </div>
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 shrink-0 rounded-[6px] border-[#CCCCCC] px-2.5 text-xs"
                            onClick={() => onDraftChange(group)}
                          >
                            Edit
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex justify-end border-t border-[#E6E1D8] pt-4">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaxGroupEditor({
  canEdit,
  taxes,
  existingCodes,
  value,
  pending,
  onCancel,
  onSave,
}: {
  canEdit: boolean;
  taxes: TaxRow[];
  existingCodes: string[];
  value: TaxGroupRow | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (payload: Omit<TaxGroupRow, "id"> & { id?: string }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [taxIds, setTaxIds] = useState<string[]>(value?.taxIds ?? []);
  const code = value ? value.code : suggestTaxSetupCode(name);
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);
  const activeTaxes = taxes.filter((tax) => tax.active || taxIds.includes(tax.id));

  return (
    <div className="space-y-3" data-testid="tax-group-editor">
      <CodeFields
        code={code}
        name={name}
        locked={Boolean(value)}
        canEdit={canEdit}
        codeError={codeConflict ? TAX_CODE_CONFLICT : null}
        hint={
          value
            ? "Saved with this record. Editing the name will not change it."
            : "Generated from the name. Letters, numbers, and underscores only."
        }
        onName={setName}
      />
      <ActiveField active={active} canEdit={canEdit} onChange={setActive} />
      <SetupField
        label="Taxes"
        hint="Select taxes from the catalogue. Groups reference existing taxes; they do not create copies."
      >
        {activeTaxes.length === 0 ? (
          <p className="rounded-[6px] border border-dashed border-[#D9D2C4] px-3 py-4 text-xs text-muted-foreground">
            Save an active tax first, then add it to this group.
          </p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] p-3">
            {activeTaxes.map((tax) => {
              const checked = taxIds.includes(tax.id);
              return (
                <label
                  key={tax.id}
                  className="flex cursor-pointer items-start gap-2 text-sm text-[#251605]"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded-[3px] border-[#CCCCCC]"
                    checked={checked}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setTaxIds(
                        event.target.checked
                          ? [...taxIds, tax.id]
                          : taxIds.filter((id) => id !== tax.id),
                      );
                    }}
                  />
                  <span>
                    <span className="font-medium">{tax.name}</span>
                    <span className="text-[#756A5B]"> — {taxAmountLabel(tax)}</span>
                    {!tax.active ? (
                      <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </SetupField>
      <div className="flex justify-end gap-2 border-t border-[#E6E1D8] pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Back
        </Button>
        {canEdit ? (
          <Button
            type="button"
            disabled={pending}
            className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => {
              if (
                blockUnusableCode({
                  name,
                  code,
                  conflict: codeConflict,
                  conflictMessage: TAX_CODE_CONFLICT,
                })
              ) {
                return;
              }
              onSave({
                ...(value ? { id: value.id } : {}),
                code,
                name,
                active,
                taxIds,
              });
            }}
          >
            {pending ? "Saving…" : "Save tax group"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
