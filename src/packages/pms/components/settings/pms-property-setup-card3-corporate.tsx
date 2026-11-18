import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ellipsis, Plus } from "lucide-react";
import { toast } from "sonner";

import { CorporateAgreementWizard } from "@/packages/pms/components/settings/corporate-agreement-wizard";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3EmptyRow,
  Card3OverlapSheet,
  Card3SearchAddBar,
  Card3Section,
  Card3StatusDot,
  Card3Table,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getCorporateCard3,
  saveCorporateAgreementCard3,
} from "@/packages/pms/lib/corporate-card3.functions";
import {
  isOpenEndedAgreementTo,
  type CorporateAgreementRow,
  type CorporateCard3Snapshot,
} from "@/packages/pms/lib/corporate-card3.server";
import {
  listPmsContractTypes,
  savePmsContractType,
} from "@/packages/pms/lib/corporate-contracts.functions";
import {
  PROPERTY_SETUP_CONTROL_CLASS,
  PROPERTY_SETUP_TEXTAREA_CLASS,
} from "@/packages/pms/lib/pms-property-setup-ui";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

function agreementValidity(row: CorporateAgreementRow): string {
  if (isOpenEndedAgreementTo(row.validTo)) return `${row.validFrom} → No end date`;
  return `${row.validFrom} → ${row.validTo}`;
}

export function PmsPropertySetupCard3Corporate({
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
  const load = useServerFn(getCorporateCard3);
  const saveAgreement = useServerFn(saveCorporateAgreementCard3);
  const fetchContractTypes = useServerFn(listPmsContractTypes);
  const saveContractTypeFn = useServerFn(savePmsContractType);

  const [agreementSearch, setAgreementSearch] = useState("");
  const [rateSearch, setRateSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<CorporateAgreementRow | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 3>(1);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [typeDraft, setTypeDraft] = useState<{
    id?: string;
    code: string;
    name: string;
    description: string;
    active: boolean;
  } | null>(null);
  const [showRatesView, setShowRatesView] = useState(false);

  const query = useQuery({
    queryKey: ["pms-card3-corporate", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: CorporateCard3Snapshot | undefined = query.data?.snapshot;
  const readiness = query.data?.readiness;
  const agreements = useMemo(() => snapshot?.agreements ?? [], [snapshot?.agreements]);
  const contractRates = useMemo(() => snapshot?.contractRates ?? [], [snapshot?.contractRates]);

  const ratesByAgreement = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of contractRates) {
      map.set(row.agreementId, (map.get(row.agreementId) ?? 0) + 1);
    }
    return map;
  }, [contractRates]);

  const filteredAgreements = useMemo(
    () =>
      agreements.filter((row) =>
        matchesQuery(
          agreementSearch,
          row.code,
          row.name,
          row.contractNumber,
          row.companyLabel,
          row.contractTypeLabel,
          row.currencyCode,
        ),
      ),
    [agreements, agreementSearch],
  );

  const filteredRates = useMemo(
    () =>
      contractRates.filter((row) =>
        matchesQuery(
          rateSearch,
          row.agreementLabel,
          row.roomTypeLabel,
          row.rateKindLabel,
          String(row.amount),
        ),
      ),
    [contractRates, rateSearch],
  );

  const contractTypesQuery = useQuery({
    queryKey: ["pms-contract-types", restaurantId],
    queryFn: () => fetchContractTypes({ data: { restaurantId } }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-corporate", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-contract-types", restaurantId] });
  }

  const deactivateMutation = useMutation({
    mutationFn: (row: CorporateAgreementRow) =>
      saveAgreement({
        data: {
          restaurantId,
          id: row.id,
          companyId: row.companyId,
          code: row.code,
          name: row.name,
          contractNumber: row.contractNumber,
          contractTypeId: row.contractTypeId,
          validFrom: row.validFrom,
          validTo: row.validTo,
          currencyCode: row.currencyCode,
          description: row.description || undefined,
          active: false,
        },
      }),
    onSuccess: () => {
      toast.success("Agreement deactivated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const contractTypeMutation = useMutation({
    mutationFn: (draft: {
      id?: string;
      code: string;
      name: string;
      description?: string;
      displayOrder: number;
      active: boolean;
    }) => saveContractTypeFn({ data: { restaurantId, draft } }),
    onSuccess: () => {
      toast.success("Contract type saved.");
      setTypeDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreateWizard() {
    setEditingAgreement(null);
    setWizardStep(1);
    setWizardOpen(true);
  }

  function openEditWizard(row: CorporateAgreementRow, step: 1 | 3 = 1) {
    setEditingAgreement(row);
    setWizardStep(step);
    setWizardOpen(true);
  }

  const isEmpty = agreements.length === 0;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading corporate and contract rates…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ??
            "Corporate & Contract Rates are unavailable."}
        </p>
      ) : (
        <div className="space-y-3" data-testid="pms-card3-corporate">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-[6px] bg-[#ECEAE4] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Optional
              </span>
              <p className="text-xs text-muted-foreground">
                Corporate agreements — not required for activation.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-[6px] border-[#D9D2C4]"
              onClick={() => setManageTypesOpen(true)}
            >
              Manage contract types
            </Button>
          </div>
          {readiness?.warnings && readiness.warnings.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-[#9A6A12]">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <Card3Section title="Agreements" icon="facility">
            <div className="mb-3">
              <Card3SearchAddBar
                value={agreementSearch}
                onChange={setAgreementSearch}
                placeholder="Search corporate agreements"
                addLabel="New Corporate Agreement"
                onAdd={openCreateWizard}
                canEdit={canEdit}
              />
            </div>
            <Card3Table
              headers={[
                "Agreement",
                "Company",
                "Contract Type",
                "Validity",
                "Currency",
                "Rates",
                "Status",
                "",
              ]}
            >
              {filteredAgreements.length === 0 ? (
                <Card3EmptyRow colSpan={8}>
                  {isEmpty ? (
                    <span className="block space-y-1 text-center">
                      <span className="block text-sm font-medium text-[#251605]">Optional</span>
                      <span className="block text-xs text-muted-foreground">
                        No corporate agreements configured
                      </span>
                    </span>
                  ) : (
                    "No matching corporate agreements."
                  )}
                </Card3EmptyRow>
              ) : (
                filteredAgreements.map((row) => (
                  <tr key={row.id} className="border-t border-[#E6E1D8]">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-[#251605]">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground">{row.code}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-[#251605]">
                      {row.companyLabel || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-[#251605]">
                      {row.contractTypeLabel || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-[#251605]">
                      {agreementValidity(row)}
                    </td>
                    <td className="px-3 py-2 text-sm text-[#251605]">{row.currencyCode}</td>
                    <td className="px-3 py-2 text-sm text-[#251605]">
                      {ratesByAgreement.get(row.id) ?? 0}
                    </td>
                    <td className="px-3 py-2">
                      <Card3StatusDot active={row.active} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-[6px] text-[#251605] hover:bg-[#F4EDE0]"
                            aria-label={`Actions for ${row.name}`}
                          >
                            <Ellipsis className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          <DropdownMenuItem
                            disabled={!canEdit}
                            onSelect={() => openEditWizard(row, 1)}
                          >
                            Edit Agreement
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canEdit}
                            onSelect={() => openEditWizard(row, 3)}
                          >
                            View/Edit Rates
                          </DropdownMenuItem>
                          {row.active ? (
                            <DropdownMenuItem
                              disabled={!canEdit || deactivateMutation.isPending}
                              onSelect={() => deactivateMutation.mutate(row)}
                            >
                              Deactivate
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </Card3Table>
          </Card3Section>

          <div className="rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-xs">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowRatesView((prev) => !prev)}
            >
              <div>
                <p className="text-sm font-semibold text-[#251605]">Contract rates (read-only)</p>
                <p className="text-xs text-muted-foreground">
                  Global view across agreements. Create and edit rates inside an agreement.
                </p>
              </div>
              <span className="text-xs text-[#9A6A12]">
                {showRatesView ? "Hide" : "Show"}
              </span>
            </button>
            {showRatesView ? (
              <div className="mt-3 space-y-3">
                <Input
                  value={rateSearch}
                  onChange={(event) => setRateSearch(event.target.value)}
                  placeholder="Filter contract rates"
                  className={PROPERTY_SETUP_CONTROL_CLASS}
                  aria-label="Filter contract rates"
                />
                <Card3Table
                  headers={["Agreement", "Room Type", "Rate Kind", "Amount", "Validity", "Status"]}
                >
                  {filteredRates.length === 0 ? (
                    <Card3EmptyRow colSpan={6}>No contract rates.</Card3EmptyRow>
                  ) : (
                    filteredRates.map((row) => (
                      <tr key={row.id} className="border-t border-[#E6E1D8]">
                        <td className="px-3 py-2 text-sm text-[#251605]">{row.agreementLabel}</td>
                        <td className="px-3 py-2 text-sm text-[#251605]">{row.roomTypeLabel}</td>
                        <td className="px-3 py-2 text-sm text-[#251605]">{row.rateKindLabel}</td>
                        <td className="px-3 py-2 text-sm text-[#251605]">{row.amount}</td>
                        <td className="px-3 py-2 text-sm text-[#251605]">
                          {row.validFrom} → {row.validTo}
                        </td>
                        <td className="px-3 py-2">
                          <Card3StatusDot active={row.active} />
                        </td>
                      </tr>
                    ))
                  )}
                </Card3Table>
              </div>
            ) : null}
          </div>

          {wizardOpen && snapshot ? (
            <CorporateAgreementWizard
              key={editingAgreement?.id ?? "new-agreement"}
              restaurantId={restaurantId}
              canEdit={canEdit}
              snapshot={snapshot}
              editing={editingAgreement}
              initialStep={wizardStep}
              onClose={() => setWizardOpen(false)}
              onCompleted={() => {
                setWizardOpen(false);
                invalidate();
              }}
            />
          ) : null}

          {manageTypesOpen ? (
            <Card3OverlapSheet
              open
              onClose={() => setManageTypesOpen(false)}
              title="Manage contract types"
              description="Supporting catalogue for corporate agreements."
              canEdit={canEdit}
              pending={false}
              submitLabel="Done"
              onSubmit={() => setManageTypesOpen(false)}
            >
              <div className="space-y-3">
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
                <Card3Table headers={["Code", "Name", "Status", ""]}>
                  {(contractTypesQuery.data ?? []).length === 0 ? (
                    <Card3EmptyRow colSpan={4}>No contract types yet.</Card3EmptyRow>
                  ) : (
                    (contractTypesQuery.data ?? []).map((row) => (
                      <tr key={row.id} className="border-t border-[#E6E1D8]">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.code}</td>
                        <td className="px-3 py-2 text-sm text-[#251605]">{row.name}</td>
                        <td className="px-3 py-2">
                          <Card3StatusDot active={row.active} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
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
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </Card3Table>
              </div>
            </Card3OverlapSheet>
          ) : null}

          {typeDraft ? (
            <ContractTypeSheet
              open
              canEdit={canEdit}
              value={typeDraft}
              pending={contractTypeMutation.isPending}
              onClose={() => setTypeDraft(null)}
              onSave={(draft) =>
                contractTypeMutation.mutate({
                  ...draft,
                  displayOrder: 0,
                })
              }
            />
          ) : null}
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function ContractTypeSheet({
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
  const isCreate = !value.id;
  const autoCode = useMemo(() => {
    if (!isCreate) return value.code;
    return (
      name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30) || "TYPE"
    );
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
