import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Edit2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { GuestCompanyCreateModal } from "@/packages/pms/components/guests/guest-company-create-modal";
import {
  Card3OverlapSheet,
  Card3StatusDot,
  Card3Table,
  Card3EmptyRow,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import {
  saveContractRateCard3,
  saveCorporateAgreementCard3,
} from "@/packages/pms/lib/corporate-card3.functions";
import {
  CONTRACT_RATE_KIND_LABELS,
  CONTRACT_RATE_KINDS,
  CORPORATE_AGREEMENT_OPEN_ENDED_TO,
  CORPORATE_AGREEMENT_WIZARD_STEPS,
  isOpenEndedAgreementTo,
  suggestCorporateAgreementCode,
  type ContractRateKind,
  type ContractRateRow,
  type CorporateAgreementRow,
  type CorporateCard3Snapshot,
} from "@/packages/pms/lib/corporate-card3.server";
import {
  listPmsContractTypes,
  savePmsContractType,
} from "@/packages/pms/lib/corporate-contracts.functions";
import type { ContractTypeRecord } from "@/packages/pms/lib/corporate-contracts.server";
import {
  PROPERTY_SETUP_CONTROL_CLASS,
  PROPERTY_SETUP_TEXTAREA_CLASS,
} from "@/packages/pms/lib/pms-property-setup-ui";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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

type WizardStepId = (typeof CORPORATE_AGREEMENT_WIZARD_STEPS)[number]["id"];

type DraftRate = {
  localId: string;
  id?: string;
  roomTypeId: string;
  rateKind: ContractRateKind;
  amount: string;
  validFrom: string;
  validTo: string;
  active: boolean;
};

export type CorporateAgreementWizardForm = {
  companyId: string;
  name: string;
  code: string;
  contractNumber: string;
  contractTypeId: string;
  description: string;
  active: boolean;
  validFrom: string;
  validTo: string;
  noEndDate: boolean;
  currencyCode: string;
  rates: DraftRate[];
};

function emptyForm(snapshot: CorporateCard3Snapshot): CorporateAgreementWizardForm {
  const baseCurrency =
    snapshot.currencies.find((row) => row.isBase)?.code ?? snapshot.currencies[0]?.code ?? "";
  return {
    companyId: "",
    name: "",
    code: suggestCorporateAgreementCode(snapshot.agreements.map((row) => row.code)),
    contractNumber: "",
    contractTypeId: "",
    description: "",
    active: true,
    validFrom: "",
    validTo: "",
    noEndDate: false,
    currencyCode: baseCurrency,
    rates: [],
  };
}

function formFromAgreement(
  agreement: CorporateAgreementRow,
  rates: ContractRateRow[],
  snapshot: CorporateCard3Snapshot,
): CorporateAgreementWizardForm {
  return {
    companyId: agreement.companyId,
    name: agreement.name,
    code: agreement.code,
    contractNumber: agreement.contractNumber,
    contractTypeId: agreement.contractTypeId ?? "",
    description: agreement.description,
    active: agreement.active,
    validFrom: agreement.validFrom,
    validTo: isOpenEndedAgreementTo(agreement.validTo) ? "" : agreement.validTo,
    noEndDate: isOpenEndedAgreementTo(agreement.validTo),
    currencyCode:
      agreement.currencyCode ||
      snapshot.currencies.find((row) => row.isBase)?.code ||
      snapshot.currencies[0]?.code ||
      "",
    rates: rates
      .filter((row) => row.agreementId === agreement.id)
      .map((row) => ({
        localId: row.id,
        id: row.id,
        roomTypeId: row.roomTypeId,
        rateKind: row.rateKind,
        amount: String(row.amount),
        validFrom: row.validFrom,
        validTo: row.validTo,
        active: row.active,
      })),
  };
}

function newDraftRate(defaults: { validFrom: string; validTo: string }): DraftRate {
  return {
    localId: `local-${crypto.randomUUID()}`,
    roomTypeId: "",
    rateKind: "negotiated",
    amount: "",
    validFrom: defaults.validFrom,
    validTo: defaults.validTo,
    active: true,
  };
}

function validityLabel(from: string, to: string, noEndDate?: boolean): string {
  if (!from) return "—";
  if (noEndDate || isOpenEndedAgreementTo(to)) return `${from} → No end date`;
  if (!to) return from;
  return `${from} → ${to}`;
}

export function CorporateAgreementWizard({
  restaurantId,
  canEdit,
  snapshot,
  editing,
  initialStep = 1,
  onClose,
  onCompleted,
}: {
  restaurantId: string;
  canEdit: boolean;
  snapshot: CorporateCard3Snapshot;
  editing?: CorporateAgreementRow | null;
  initialStep?: WizardStepId;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const queryClient = useQueryClient();
  const saveAgreement = useServerFn(saveCorporateAgreementCard3);
  const saveRate = useServerFn(saveContractRateCard3);
  const fetchContractTypes = useServerFn(listPmsContractTypes);
  const saveContractTypeFn = useServerFn(savePmsContractType);

  const [step, setStep] = useState<WizardStepId>(initialStep);
  const [form, setForm] = useState<CorporateAgreementWizardForm>(() =>
    editing
      ? formFromAgreement(editing, snapshot.contractRates, snapshot)
      : emptyForm(snapshot),
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyCreateOpen, setCompanyCreateOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState<DraftRate | "new" | null>(null);
  const [typeDraft, setTypeDraft] = useState<{
    id?: string;
    code: string;
    name: string;
    description: string;
    active: boolean;
  } | null>(null);

  const contractTypesQuery = useQuery({
    queryKey: ["pms-contract-types", restaurantId],
    queryFn: () => fetchContractTypes({ data: { restaurantId } }),
  });
  const contractTypes = useMemo(
    () => (contractTypesQuery.data ?? []).filter((row) => row.active || row.id === form.contractTypeId),
    [contractTypesQuery.data, form.contractTypeId],
  );

  const companies = snapshot.companies;
  const selectedCompany = companies.find((row) => row.id === form.companyId);
  const selectedBillingRule = snapshot.billingRules.find(
    (row) => row.id === selectedCompany?.defaultBillingRuleId,
  );
  const selectedType = contractTypes.find((row) => row.id === form.contractTypeId);

  const step1Valid = Boolean(
    form.companyId && form.name.trim() && form.code.trim() && form.contractNumber.trim(),
  );
  const step2Valid = Boolean(
    form.validFrom &&
      form.currencyCode &&
      (form.noEndDate || (form.validTo && form.validTo >= form.validFrom)),
  );

  function patchForm(partial: Partial<CorporateAgreementWizardForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function goNext() {
    if (step === 1 && !step1Valid) {
      setAttempted(true);
      toast.error("Company, agreement name, and contract number are required.");
      return;
    }
    if (step === 2 && !step2Valid) {
      setAttempted(true);
      toast.error("Valid from and currency are required.");
      return;
    }
    setStep((prev) => Math.min(5, prev + 1) as WizardStepId);
  }

  function goBack() {
    setStep((prev) => Math.max(1, prev - 1) as WizardStepId);
  }

  async function completeWizard() {
    if (!canEdit || saving) return;
    if (!step1Valid || !step2Valid) {
      setAttempted(true);
      toast.error("Finish required agreement fields before completing.");
      setStep(!step1Valid ? 1 : 2);
      return;
    }
    setSaving(true);
    try {
      const validTo = form.noEndDate ? CORPORATE_AGREEMENT_OPEN_ENDED_TO : form.validTo;
      const result = await saveAgreement({
        data: {
          restaurantId,
          ...(editing ? { id: editing.id } : {}),
          companyId: form.companyId,
          code: form.code,
          name: form.name.trim(),
          contractNumber: form.contractNumber.trim(),
          contractTypeId: form.contractTypeId || null,
          validFrom: form.validFrom,
          validTo,
          currencyCode: form.currencyCode,
          description: form.description.trim() || undefined,
          active: form.active,
        },
      });
      const agreementId = result.agreementId || editing?.id;
      if (!agreementId) throw new Error("Agreement could not be saved.");

      for (const rate of form.rates) {
        if (!rate.roomTypeId || !rate.validFrom || !rate.validTo) continue;
        const amount = Number(rate.amount);
        if (!Number.isFinite(amount) || amount < 0) continue;
        await saveRate({
          data: {
            restaurantId,
            ...(rate.id ? { id: rate.id } : {}),
            agreementId,
            roomTypeId: rate.roomTypeId,
            rateKind: rate.rateKind,
            amount,
            validFrom: rate.validFrom,
            validTo: rate.validTo,
            active: rate.active,
          },
        });
      }

      toast.success(
        editing ? "Corporate agreement updated." : "Corporate agreement created.",
      );
      onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save corporate agreement.");
    } finally {
      setSaving(false);
    }
  }

  const typeMutation = useMutation({
    mutationFn: (draft: {
      id?: string;
      code: string;
      name: string;
      description?: string;
      displayOrder: number;
      active: boolean;
    }) => saveContractTypeFn({ data: { restaurantId, draft } }),
    onSuccess: (saved) => {
      toast.success("Contract type saved.");
      setTypeDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["pms-contract-types", restaurantId] });
      if (saved?.id) patchForm({ contractTypeId: saved.id });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function upsertRate(draft: DraftRate) {
    setForm((prev) => {
      const exists = prev.rates.some((row) => row.localId === draft.localId);
      return {
        ...prev,
        rates: exists
          ? prev.rates.map((row) => (row.localId === draft.localId ? draft : row))
          : [...prev.rates, draft],
      };
    });
    setRateDraft(null);
  }

  function removeRate(localId: string) {
    setForm((prev) => ({ ...prev, rates: prev.rates.filter((row) => row.localId !== localId) }));
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          overlayClassName="bg-[#1F140A]/70"
          data-testid="pms-card3-corporate-agreement-wizard"
          className={cn(
            "z-50 flex max-h-[88vh] min-h-0 w-[min(900px,calc(100vw-48px))] max-w-none sm:max-w-none",
            "flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl",
            "[&>button.absolute]:hidden",
          )}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <header className="relative shrink-0 bg-[#1F140A] px-5 py-2.5 pr-12 text-[#F3E9D8]">
            <DialogTitle className="font-display text-sm font-semibold text-white">
              {editing ? "Edit Corporate Agreement" : "Create Corporate Agreement"}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              Step {step} of 5
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
          </header>

          <nav
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#E6DFD3] bg-[#FBF9F5] px-3 py-1.5"
            aria-label="Corporate agreement wizard steps"
          >
            {CORPORATE_AGREEMENT_WIZARD_STEPS.map((row) => {
              const active = step === row.id;
              const done = step > row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#C89933] text-[#251605] shadow-xs"
                      : done
                        ? "text-[#251605] hover:bg-[#F4EDE0]"
                        : "text-muted-foreground hover:text-[#251605]"
                  }`}
                  onClick={() => setStep(row.id)}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                      active
                        ? "bg-[#251605] text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[#E6DFD3] text-[#5C4528]"
                    }`}
                  >
                    {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : row.id}
                  </span>
                  <span className="whitespace-nowrap">{row.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === 1 ? (
              <StepCompanyAgreement
                form={form}
                canEdit={canEdit}
                attempted={attempted}
                companies={companies}
                contractTypes={contractTypes}
                onPatch={patchForm}
                onCreateCompany={() => setCompanyCreateOpen(true)}
                onManageTypes={() => setManageTypesOpen(true)}
              />
            ) : null}
            {step === 2 ? (
              <StepContractTerms
                form={form}
                canEdit={canEdit}
                attempted={attempted}
                currencies={snapshot.currencies}
                onPatch={patchForm}
              />
            ) : null}
            {step === 3 ? (
              <StepContractRates
                form={form}
                canEdit={canEdit}
                roomTypes={snapshot.roomTypes}
                onAdd={() =>
                  setRateDraft(
                    newDraftRate({
                      validFrom: form.validFrom,
                      validTo: form.noEndDate
                        ? CORPORATE_AGREEMENT_OPEN_ENDED_TO
                        : form.validTo,
                    }),
                  )
                }
                onEdit={(row) => setRateDraft(row)}
                onRemove={removeRate}
              />
            ) : null}
            {step === 4 ? (
              <StepBillingCommercial
                company={selectedCompany}
                billingRule={selectedBillingRule}
                paymentTermsFromRule={selectedBillingRule?.paymentTerms ?? null}
              />
            ) : null}
            {step === 5 ? (
              <StepReview
                form={form}
                companyLabel={
                  selectedCompany
                    ? `${selectedCompany.code} — ${selectedCompany.name}`
                    : "—"
                }
                contractTypeLabel={
                  selectedType ? `${selectedType.code} — ${selectedType.name}` : "—"
                }
                billingRuleLabel={
                  selectedBillingRule
                    ? `${selectedBillingRule.code} — ${selectedBillingRule.name}`
                    : "—"
                }
                roomTypes={snapshot.roomTypes}
                onEditStep={setStep}
              />
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E6DFD3] bg-white px-5 py-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-[6px] border-[#D9D2C4]"
              disabled={step === 1 || saving}
              onClick={goBack}
            >
              <ArrowLeft className="mr-1.5 size-3.5" />
              Back
            </Button>
            {step < 5 ? (
              <Button
                type="button"
                className="rounded-[6px] bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
                disabled={!canEdit}
                onClick={goNext}
              >
                Continue
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-[6px] bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
                disabled={!canEdit || saving}
                onClick={() => void completeWizard()}
              >
                {saving ? "Saving…" : "Complete Corporate Agreement"}
              </Button>
            )}
          </footer>
        </DialogContent>
      </Dialog>

      <GuestCompanyCreateModal
        restaurantId={restaurantId}
        open={companyCreateOpen}
        onOpenChange={setCompanyCreateOpen}
        onCreated={(companyId) => {
          setCompanyCreateOpen(false);
          patchForm({ companyId });
          void queryClient
            .invalidateQueries({ queryKey: ["pms-card3-corporate", restaurantId] })
            .then(() =>
              queryClient.refetchQueries({ queryKey: ["pms-card3-corporate", restaurantId] }),
            );
          toast.success("Company created. It is selected for this agreement.");
        }}
      />

      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="max-w-lg rounded-2xl border-[#E6E1D8] bg-[#F7F4EE] p-0">
          <div className="border-b border-[#E6E1D8] bg-[#1F140A] px-4 py-3 text-white">
            <DialogTitle className="text-sm font-semibold">Manage contract types</DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              Supporting catalogue for corporate agreements.
            </DialogDescription>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                className="rounded-[6px] bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={!canEdit}
                onClick={() =>
                  setTypeDraft({
                    code: "",
                    name: "",
                    description: "",
                    active: true,
                  })
                }
              >
                <Plus className="mr-1 size-3.5" />
                Add type
              </Button>
            </div>
            <Card3Table headers={["Code", "Name", "Status"]}>
              {(contractTypesQuery.data ?? []).length === 0 ? (
                <Card3EmptyRow colSpan={3}>No contract types yet.</Card3EmptyRow>
              ) : (
                (contractTypesQuery.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-[#E6E1D8]">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{row.code}</td>
                    <td className="px-3 py-2 text-sm text-[#251605]">{row.name}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left"
                        disabled={!canEdit}
                        onClick={() =>
                          setTypeDraft({
                            id: row.id,
                            code: row.code,
                            name: row.name,
                            description: row.description ?? "",
                            active: row.active,
                          })
                        }
                      >
                        <Card3StatusDot active={row.active} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </Card3Table>
          </div>
        </DialogContent>
      </Dialog>

      {rateDraft ? (
        <RateEditorSheet
          open
          canEdit={canEdit}
          roomTypes={snapshot.roomTypes}
          value={rateDraft === "new" ? newDraftRate({
            validFrom: form.validFrom,
            validTo: form.noEndDate ? CORPORATE_AGREEMENT_OPEN_ENDED_TO : form.validTo,
          }) : rateDraft}
          onClose={() => setRateDraft(null)}
          onSave={upsertRate}
        />
      ) : null}

      {typeDraft ? (
        <ContractTypeQuickSheet
          open
          canEdit={canEdit}
          value={typeDraft}
          pending={typeMutation.isPending}
          onClose={() => setTypeDraft(null)}
          onSave={(draft) =>
            typeMutation.mutate({
              ...draft,
              displayOrder: 0,
            })
          }
        />
      ) : null}
    </>
  );
}

function FieldError({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return <p className="text-xs text-red-600">{message}</p>;
}

function StepCompanyAgreement({
  form,
  canEdit,
  attempted,
  companies,
  contractTypes,
  onPatch,
  onCreateCompany,
  onManageTypes,
}: {
  form: CorporateAgreementWizardForm;
  canEdit: boolean;
  attempted: boolean;
  companies: CorporateCard3Snapshot["companies"];
  contractTypes: ContractTypeRecord[];
  onPatch: (partial: Partial<CorporateAgreementWizardForm>) => void;
  onCreateCompany: () => void;
  onManageTypes: () => void;
}) {
  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">
          Company & Agreement
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Link a Guest Profile company and name the commercial agreement.
        </p>
      </header>

      <div className="space-y-3 rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="corp-wizard-company">Company *</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#9A6A12]"
              disabled={!canEdit}
              onClick={onCreateCompany}
            >
              <Plus className="mr-1 size-3.5" />
              Create company
            </Button>
          </div>
          {companies.length === 0 ? (
            <p className="rounded-[6px] border border-dashed border-[#D9D2C4] bg-[#FBF9F5] px-3 py-3 text-xs text-muted-foreground">
              No companies yet. Use + Create company to add one from Guest Profile.
            </p>
          ) : (
            <Select
              value={form.companyId || undefined}
              onValueChange={(value) => onPatch({ companyId: value })}
              disabled={!canEdit}
            >
              <SelectTrigger
                id="corp-wizard-company"
                className={PROPERTY_SETUP_CONTROL_CLASS}
                aria-invalid={attempted && !form.companyId}
              >
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldError show={attempted && !form.companyId} message="Select a company." />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-name">Agreement name *</Label>
          <Input
            id="corp-wizard-name"
            value={form.name}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => onPatch({ name: event.target.value })}
          />
          <FieldError show={attempted && !form.name.trim()} message="Enter an agreement name." />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-code">Agreement code</Label>
          <Input
            id="corp-wizard-code"
            value={form.code}
            readOnly
            className={cn(PROPERTY_SETUP_CONTROL_CLASS, "bg-[#F7F4EE] text-muted-foreground")}
          />
          <p className="text-[11px] text-muted-foreground">Auto-generated for this property.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-number">Contract number *</Label>
          <Input
            id="corp-wizard-number"
            value={form.contractNumber}
            maxLength={40}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => onPatch({ contractNumber: event.target.value })}
          />
          <FieldError
            show={attempted && !form.contractNumber.trim()}
            message="Enter a contract number."
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="corp-wizard-type">Contract type</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-[#9A6A12]"
              onClick={onManageTypes}
            >
              Manage contract types
            </Button>
          </div>
          <Select
            value={form.contractTypeId || "__none"}
            onValueChange={(value) =>
              onPatch({ contractTypeId: value === "__none" ? "" : value })
            }
            disabled={!canEdit}
          >
            <SelectTrigger id="corp-wizard-type" className={PROPERTY_SETUP_CONTROL_CLASS}>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {contractTypes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-description">Description</Label>
          <Textarea
            id="corp-wizard-description"
            value={form.description}
            maxLength={500}
            disabled={!canEdit}
            className={PROPERTY_SETUP_TEXTAREA_CLASS}
            onChange={(event) => onPatch({ description: event.target.value })}
          />
        </div>

        <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2">
          <Label htmlFor="corp-wizard-active">Active</Label>
          <Switch
            id="corp-wizard-active"
            checked={form.active}
            disabled={!canEdit}
            onCheckedChange={(value) => onPatch({ active: value })}
          />
        </div>
      </div>
    </div>
  );
}

function StepContractTerms({
  form,
  canEdit,
  attempted,
  currencies,
  onPatch,
}: {
  form: CorporateAgreementWizardForm;
  canEdit: boolean;
  attempted: boolean;
  currencies: CorporateCard3Snapshot["currencies"];
  onPatch: (partial: Partial<CorporateAgreementWizardForm>) => void;
}) {
  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">Contract Terms</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Validity and currency for this agreement.
        </p>
      </header>
      <div className="space-y-3 rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-from">Valid from *</Label>
          <Input
            id="corp-wizard-from"
            type="date"
            value={form.validFrom}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => onPatch({ validFrom: event.target.value })}
          />
          <FieldError show={attempted && !form.validFrom} message="Choose a start date." />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="corp-wizard-to">Valid to</Label>
            <label className="flex items-center gap-2 text-xs text-[#251605]">
              <input
                type="checkbox"
                checked={form.noEndDate}
                disabled={!canEdit}
                onChange={(event) =>
                  onPatch({
                    noEndDate: event.target.checked,
                    validTo: event.target.checked ? "" : form.validTo,
                  })
                }
              />
              No end date
            </label>
          </div>
          <Input
            id="corp-wizard-to"
            type="date"
            value={form.noEndDate ? "" : form.validTo}
            disabled={!canEdit || form.noEndDate}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => onPatch({ validTo: event.target.value, noEndDate: false })}
          />
          <FieldError
            show={attempted && !form.noEndDate && !form.validTo}
            message="Choose an end date or select No end date."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="corp-wizard-currency">Currency *</Label>
          <Select
            value={form.currencyCode || undefined}
            onValueChange={(value) => onPatch({ currencyCode: value })}
            disabled={!canEdit}
          >
            <SelectTrigger id="corp-wizard-currency" className={PROPERTY_SETUP_CONTROL_CLASS}>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((row) => (
                <SelectItem key={row.code} value={row.code}>
                  {row.code}
                  {row.isBase ? " (base)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function StepContractRates({
  form,
  canEdit,
  roomTypes,
  onAdd,
  onEdit,
  onRemove,
}: {
  form: CorporateAgreementWizardForm;
  canEdit: boolean;
  roomTypes: CorporateCard3Snapshot["roomTypes"];
  onAdd: () => void;
  onEdit: (row: DraftRate) => void;
  onRemove: (localId: string) => void;
}) {
  const roomById = useMemo(
    () => new Map(roomTypes.map((row) => [row.id, `${row.code} — ${row.name}`])),
    [roomTypes],
  );
  return (
    <div className="space-y-3">
      <header className="flex items-start justify-between gap-3 rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <div>
          <h3 className="font-display text-base font-semibold text-[#251605]">Contract Rates</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Negotiated room-type rates for this agreement. Optional.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="rounded-[6px] bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          disabled={!canEdit}
          onClick={onAdd}
        >
          <Plus className="mr-1 size-3.5" />
          Add contract rate
        </Button>
      </header>
      <div className="overflow-hidden rounded-xl border border-[#E6E1D8] bg-white shadow-xs">
        <Card3Table headers={["Room Type", "Rate Kind", "Amount", "Validity", "Status", ""]}>
          {form.rates.length === 0 ? (
            <Card3EmptyRow colSpan={6}>No contract rates configured yet.</Card3EmptyRow>
          ) : (
            form.rates.map((row) => (
              <tr key={row.localId} className="border-t border-[#E6E1D8]">
                <td className="px-3 py-2 text-sm text-[#251605]">
                  {roomById.get(row.roomTypeId) ?? "—"}
                </td>
                <td className="px-3 py-2 text-sm text-[#251605]">
                  {CONTRACT_RATE_KIND_LABELS[row.rateKind]}
                </td>
                <td className="px-3 py-2 text-sm text-[#251605]">{row.amount || "—"}</td>
                <td className="px-3 py-2 text-sm text-[#251605]">
                  {validityLabel(row.validFrom, row.validTo)}
                </td>
                <td className="px-3 py-2">
                  <Card3StatusDot active={row.active} />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!canEdit}
                      onClick={() => onEdit(row)}
                    >
                      Edit
                    </Button>
                    {!row.id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        disabled={!canEdit}
                        onClick={() => onRemove(row.localId)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </Card3Table>
      </div>
    </div>
  );
}

function StepBillingCommercial({
  company,
  billingRule,
  paymentTermsFromRule,
}: {
  company: CorporateCard3Snapshot["companies"][number] | undefined;
  billingRule: CorporateCard3Snapshot["billingRules"][number] | undefined;
  paymentTermsFromRule: string | null;
}) {
  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">
          Billing & Commercial Rules
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Inherited from Company Profile and Billing & Invoicing. Not duplicated here.
        </p>
      </header>
      <div className="space-y-2 rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
        <ReviewRow
          label="Billing rule"
          value={
            billingRule ? `${billingRule.code} — ${billingRule.name}` : "None assigned on company"
          }
        />
        <ReviewRow
          label="Payment terms"
          value={
            company?.paymentTerms ||
            paymentTermsFromRule ||
            "None on company profile"
          }
        />
        <ReviewRow
          label="Credit note"
          value={company?.creditLimitNote || "—"}
        />
        <p className="pt-2 text-xs text-muted-foreground">
          Guest/company split billing and rate-plan cancellation policies stay on their owning
          catalogues. Update company billing on Guest Profile → Company Profile.
        </p>
      </div>
    </div>
  );
}

function StepReview({
  form,
  companyLabel,
  contractTypeLabel,
  billingRuleLabel,
  roomTypes,
  onEditStep,
}: {
  form: CorporateAgreementWizardForm;
  companyLabel: string;
  contractTypeLabel: string;
  billingRuleLabel: string;
  roomTypes: CorporateCard3Snapshot["roomTypes"];
  onEditStep: (step: WizardStepId) => void;
}) {
  const roomById = useMemo(
    () => new Map(roomTypes.map((row) => [row.id, row.name])),
    [roomTypes],
  );
  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">Review & Complete</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Confirm the agreement before completing. Use Edit to return to any step.
        </p>
      </header>

      <ReviewSection title="Company & Agreement" onEdit={() => onEditStep(1)}>
        <ReviewRow label="Company" value={companyLabel} />
        <ReviewRow label="Agreement" value={form.name || "—"} />
        <ReviewRow label="Contract number" value={form.contractNumber || "—"} />
        <ReviewRow label="Contract type" value={contractTypeLabel} />
        <ReviewRow label="Status" value={form.active ? "Active" : "Inactive"} />
      </ReviewSection>

      <ReviewSection title="Contract Terms" onEdit={() => onEditStep(2)}>
        <ReviewRow
          label="Validity"
          value={validityLabel(form.validFrom, form.validTo, form.noEndDate)}
        />
        <ReviewRow label="Currency" value={form.currencyCode || "—"} />
        <ReviewRow label="Billing rule" value={billingRuleLabel} />
        <ReviewRow label="Payment terms" value="From company profile" />
      </ReviewSection>

      <ReviewSection title="Contract Rates" onEdit={() => onEditStep(3)}>
        <p className="mb-2 text-xs font-medium text-[#251605]">
          {form.rates.length} contract rate{form.rates.length === 1 ? "" : "s"}
        </p>
        {form.rates.length === 0 ? (
          <p className="text-xs text-muted-foreground">None configured.</p>
        ) : (
          form.rates.map((row) => (
            <div key={row.localId} className="border-t border-[#EDE6D8] py-1.5 first:border-0">
              <ReviewRow
                label="Room type"
                value={roomById.get(row.roomTypeId) ?? "—"}
              />
              <ReviewRow label="Rate kind" value={CONTRACT_RATE_KIND_LABELS[row.rateKind]} />
              <ReviewRow label="Amount" value={row.amount || "—"} />
              <ReviewRow
                label="Validity"
                value={validityLabel(row.validFrom, row.validTo)}
              />
            </div>
          ))
        )}
      </ReviewSection>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value}</span>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
          onClick={onEdit}
        >
          <Edit2 className="mr-1 h-3 w-3" />
          Edit
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  );
}

function RateEditorSheet({
  open,
  canEdit,
  roomTypes,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  roomTypes: CorporateCard3Snapshot["roomTypes"];
  value: DraftRate;
  onClose: () => void;
  onSave: (draft: DraftRate) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value.id ? "Edit contract rate" : "Add contract rate"}
      canEdit={canEdit}
      pending={false}
      submitLabel="Save rate"
      onSubmit={() => {
        if (!draft.roomTypeId || !draft.validFrom || !draft.validTo) {
          toast.error("Room type and validity dates are required.");
          return;
        }
        onSave(draft);
      }}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Room type</Label>
          <Select
            value={draft.roomTypeId || undefined}
            onValueChange={(roomTypeId) => setDraft((prev) => ({ ...prev, roomTypeId }))}
            disabled={!canEdit}
          >
            <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
              <SelectValue placeholder="Select room type" />
            </SelectTrigger>
            <SelectContent>
              {roomTypes
                .filter((row) => row.active)
                .map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Rate kind</Label>
          <Select
            value={draft.rateKind}
            onValueChange={(rateKind) =>
              setDraft((prev) => ({ ...prev, rateKind: rateKind as ContractRateKind }))
            }
            disabled={!canEdit}
          >
            <SelectTrigger className={PROPERTY_SETUP_CONTROL_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_RATE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {CONTRACT_RATE_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={draft.amount}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Valid from</Label>
          <Input
            type="date"
            value={draft.validFrom}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => setDraft((prev) => ({ ...prev, validFrom: event.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>Valid to</Label>
          <Input
            type="date"
            value={draft.validTo}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => setDraft((prev) => ({ ...prev, validTo: event.target.value }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2">
          <Label>Active</Label>
          <Switch
            checked={draft.active}
            disabled={!canEdit}
            onCheckedChange={(active) => setDraft((prev) => ({ ...prev, active }))}
          />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}

function ContractTypeQuickSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: { id?: string; code: string; name: string; description: string; active: boolean };
  pending: boolean;
  onClose: () => void;
  onSave: (draft: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value.code);
  const [name, setName] = useState(value.name);
  const [description, setDescription] = useState(value.description);
  const [active, setActive] = useState(value.active);
  useEffect(() => {
    setCode(value.code);
    setName(value.name);
    setDescription(value.description);
    setActive(value.active);
  }, [value]);

  const isCreate = !value.id;
  const autoCode = useMemo(() => {
    if (!isCreate) return value.code;
    const raw = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30);
    return raw || "TYPE";
  }, [isCreate, name, value.code]);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value.id ? "Edit contract type" : "Add contract type"}
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save contract type"
      onSubmit={() =>
        onSave({
          ...(value.id ? { id: value.id } : {}),
          code: (isCreate ? autoCode : code).trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            value={name}
            disabled={!canEdit}
            className={PROPERTY_SETUP_CONTROL_CLASS}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Code</Label>
          <Input
            value={isCreate ? autoCode : code}
            readOnly={isCreate}
            disabled={!canEdit || isCreate}
            className={cn(
              PROPERTY_SETUP_CONTROL_CLASS,
              isCreate && "bg-[#F7F4EE] text-muted-foreground",
            )}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          {isCreate ? (
            <p className="text-[11px] text-muted-foreground">Auto-generated from the name.</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea
            value={description}
            disabled={!canEdit}
            className={PROPERTY_SETUP_TEXTAREA_CLASS}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-[6px] border border-[#CCCCCC] px-3 py-2">
          <Label>Active</Label>
          <Switch checked={active} disabled={!canEdit} onCheckedChange={setActive} />
        </div>
      </div>
    </Card3OverlapSheet>
  );
}
