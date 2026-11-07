import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card3OverlapSheet } from "./pms-property-setup-card3-primitives";
import { PipelineStageDialog } from "./pipeline-stage-dialog";
import {
  CARD5_ACTIONS_TD_CLASS,
  CARD5_ACTIONS_TH_CLASS,
  CARD5_FILTER_CLASS,
  CARD5_SEARCH_CLASS,
  CARD5_SELECT_CONTENT_CLASS,
  CARD5_SELECT_ITEM_CLASS,
  CARD5_STATUS_TD_CLASS,
  CARD5_STATUS_TH_CLASS,
  CARD5_TH_CLASS,
  CARD5_THEAD_CLASS,
  CARD5_TOOLBAR_CLASS,
  Card5ConfigNotice,
  Card5CreateButton,
  Card5RowMenuButton,
  Card5Status,
  Card5TableShell,
  PmsPropertySetupCard5Workspace,
} from "./pms-property-setup-card5-workspace";
import { LocalSectionNavigator } from "./setup-kit";
import {
  getCard5SalesEvents,
  saveCard5ContractDefault,
  saveCard5FunctionSpace,
  saveCard5PackageTemplate,
  saveCard5SalesCatalogue,
  saveCard5SalesOrdered,
} from "../../lib/sales-events-card5.functions";
import {
  CARD5_PRICING_METHODS,
  CARD5_SALES_CATALOGUE_LABELS,
  CARD5_SALES_CATALOGUES,
  emptyContractDefault,
  emptyFunctionSpace,
  emptyOrderedItem,
  emptyPackageTemplate,
  emptyPipelineStage,
  emptySalesItem,
  emptySalesSnapshot,
  evaluateCard5SalesReadiness,
  type Card5ContractDefault,
  type Card5FunctionSpace,
  type Card5NamedOption,
  type Card5OrderedItem,
  type Card5PackageTemplate,
  type Card5PipelineStage,
  type Card5SalesCatalogue,
  type Card5SalesItem,
  type Card5SalesReadiness,
} from "../../lib/sales-events-card5.server";

type Draft =
  | {
      kind: "item";
      catalogue: "market_segments" | "source_codes" | "lead_types" | "event_types";
      value: Card5SalesItem;
    }
  | { kind: "status"; value: Card5OrderedItem }
  | { kind: "pipeline"; value: Card5PipelineStage }
  | { kind: "space"; value: Card5FunctionSpace }
  | { kind: "package"; value: Card5PackageTemplate }
  | { kind: "contract"; value: Card5ContractDefault };

function none(value: string): string | null {
  return value === "none" ? null : value;
}

function title(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function IdChecks({
  label,
  ids,
  options,
  disabled,
  onChange,
}: {
  label: string;
  ids: string[];
  options: Card5NamedOption[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-2">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No options available from the owning catalogue.
          </p>
        ) : (
          options
            .filter((row) => row.active || ids.includes(row.id))
            .map((row) => (
              <label key={row.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {row.name}
                  {!row.active ? " (inactive)" : ""}
                </span>
                <Switch
                  checked={ids.includes(row.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))
                  }
                />
              </label>
            ))
        )}
      </div>
    </div>
  );
}

export function Card5SalesEventsTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  function invalidateHub() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card5-validation", restaurantId] });
  }
  const load = useServerFn(getCard5SalesEvents);
  const saveCatalogue = useServerFn(saveCard5SalesCatalogue);
  const saveOrdered = useServerFn(saveCard5SalesOrdered);
  const saveSpace = useServerFn(saveCard5FunctionSpace);
  const savePackage = useServerFn(saveCard5PackageTemplate);
  const saveContract = useServerFn(saveCard5ContractDefault);
  const query = useQuery({
    queryKey: ["pms-card5-sales-events", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot = query.data?.snapshot ?? emptySalesSnapshot();
  const readiness = query.data?.readiness ?? evaluateCard5SalesReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);

  const [catalogue, setCatalogue] = useState<Card5SalesCatalogue>("market_segments");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validated, setValidated] = useState<Card5SalesReadiness | null>(null);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [selectedPipelineStage, setSelectedPipelineStage] = useState<Card5PipelineStage | null>(null);
  const [isSavingPipelineStage, setIsSavingPipelineStage] = useState(false);

  async function handleSavePipelineStage(payload: {
    id?: string;
    name: string;
    description: string;
    defaultProbability: number;
    sortOrder: number;
    active: boolean;
  }) {
    setIsSavingPipelineStage(true);
    try {
      const res = await saveOrdered({
        data: {
          restaurantId,
          kind: "pipeline_stage",
          ...(payload.id ? { id: payload.id } : {}),
          name: payload.name,
          description: payload.description,
          defaultProbability: payload.defaultProbability,
          sortOrder: payload.sortOrder,
          active: payload.active,
        },
      });
      cache(res);
      setPipelineDialogOpen(false);
      setSelectedPipelineStage(null);
      setValidated(null);
      if (payload.id) {
        toast.success("Pipeline stage updated successfully.");
      } else {
        toast.success("Pipeline stage created successfully.");
      }
    } finally {
      setIsSavingPipelineStage(false);
    }
  }

  function cache(result: { snapshot: typeof snapshot; readiness: Card5SalesReadiness }) {
    invalidateHub();
    queryClient.setQueryData(["pms-card5-sales-events", restaurantId], {
      ...query.data,
      snapshot: result.snapshot,
      readiness: result.readiness,
    });
  }

  const mutation = useMutation({
    mutationFn: async (next: Draft) => {
      if (next.kind === "item") {
        const kind =
          next.catalogue === "market_segments"
            ? "market_segment"
            : next.catalogue === "source_codes"
              ? "source_code"
              : next.catalogue === "event_types"
                ? "event_type"
                : "lead_type";
        return saveCatalogue({
          data: {
            restaurantId,
            kind,
            ...(next.value.id ? { id: next.value.id } : {}),
            code: next.value.code,
            name: next.value.name,
            description: next.value.description,
            active: next.value.active,
          },
        });
      }
      if (next.kind === "status" || next.kind === "pipeline") {
        return saveOrdered({
          data: {
            restaurantId,
            kind: next.kind === "status" ? "event_status" : "pipeline_stage",
            ...(next.value.id ? { id: next.value.id } : {}),
            code: next.value.code,
            name: next.value.name,
            description: "description" in next.value ? next.value.description : "",
            sortOrder: next.value.sortOrder,
            isTerminal: next.kind === "pipeline" ? next.value.isTerminal : false,
            active: next.value.active,
          },
        });
      }
      if (next.kind === "space") {
        return saveSpace({
          data: {
            restaurantId,
            ...(next.value.id ? { id: next.value.id } : {}),
            code: next.value.code,
            name: next.value.name,
            description: next.value.description,
            active: next.value.active,
            outletIds: next.value.outletIds,
          },
        });
      }
      if (next.kind === "package") {
        const { id, ...rest } = next.value;
        return savePackage({
          data: {
            restaurantId,
            ...(id ? { id } : {}),
            ...rest,
          },
        });
      }
      const { id, ...rest } = next.value;
      return saveContract({
        data: {
          restaurantId,
          ...(id ? { id } : {}),
          ...rest,
        },
      });
    },
    onSuccess: (result) => {
      cache(result);
      toast.success("Saved.");
      setDraft(null);
      setValidated(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filter = <T extends { name: string; active: boolean; code?: string }>(list: T[]) =>
      list.filter((row) => {
        if (status === "active" && !row.active) return false;
        if (status === "inactive" && row.active) return false;
        return !term || `${row.name} ${row.code ?? ""}`.toLowerCase().includes(term);
      });
    if (catalogue === "market_segments") return filter(snapshot.marketSegments);
    if (catalogue === "source_codes") return filter(snapshot.sourceCodes);
    if (catalogue === "lead_types") return filter(snapshot.leadTypes);
    if (catalogue === "event_types") return filter(snapshot.eventTypes);
    if (catalogue === "event_statuses") return filter(snapshot.eventStatuses);
    if (catalogue === "function_spaces") return filter(snapshot.functionSpaces);
    if (catalogue === "pipeline_stages") {
      const filtered = filter(snapshot.pipelineStages);
      return filtered.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    if (catalogue === "package_templates") return filter(snapshot.packageTemplates);
    return filter(
      snapshot.contractDefaults.map((row) => ({ ...row, name: row.contractType, code: "" })),
    );
  }, [catalogue, search, status, snapshot]);

  function openCreate() {
    if (catalogue === "event_statuses") setDraft({ kind: "status", value: emptyOrderedItem() });
    else if (catalogue === "pipeline_stages") {
      setSelectedPipelineStage(null);
      setPipelineDialogOpen(true);
    }
    else if (catalogue === "function_spaces")
      setDraft({ kind: "space", value: emptyFunctionSpace() });
    else if (catalogue === "package_templates")
      setDraft({ kind: "package", value: emptyPackageTemplate() });
    else if (catalogue === "contract_defaults")
      setDraft({ kind: "contract", value: emptyContractDefault() });
    else
      setDraft({
        kind: "item",
        catalogue,
        value: emptySalesItem(),
      });
  }

  const shownReadiness = validated ?? readiness;
  const addLabel =
    catalogue === "market_segments"
      ? "+ Add Market Segment"
      : catalogue === "source_codes"
        ? "+ Add Sales Source"
        : catalogue === "lead_types"
          ? "+ Add Lead Type"
          : catalogue === "event_types"
            ? "+ Add Event Type"
            : catalogue === "event_statuses"
              ? "+ Add Event Status"
              : catalogue === "function_spaces"
                ? "+ Add Function Space"
                : catalogue === "pipeline_stages"
                  ? "+ Add Pipeline Stage"
                  : catalogue === "package_templates"
                    ? "+ Add Package Template"
                    : "+ Add Contract Default";

  return (
    <>
    <PmsPropertySetupCard5Workspace
      search={
        <div className="space-y-2">
          <LocalSectionNavigator
            testId="pms-card5-sales-local-nav"
            activeId={catalogue}
            onSelect={(id) => {
              setCatalogue(id as Card5SalesCatalogue);
              setDraft(null);
            }}
            items={CARD5_SALES_CATALOGUES.map((item) => ({
              id: item,
              label: CARD5_SALES_CATALOGUE_LABELS[item],
            }))}
          />
          <Tabs value={catalogue} className="sr-only">
            <TabsList data-testid="pms-card5-sales-catalogues">
              {CARD5_SALES_CATALOGUES.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {CARD5_SALES_CATALOGUE_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <h3 className="font-display text-lg text-[#251605]">
            {CARD5_SALES_CATALOGUE_LABELS[catalogue]}
          </h3>
          <div className={CARD5_TOOLBAR_CLASS}>
            <Input
              id="card5-sales-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className={CARD5_SEARCH_CLASS}
            />
            <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
              <SelectTrigger className={`${CARD5_FILTER_CLASS} w-[7.5rem]`} aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={CARD5_SELECT_CONTENT_CLASS}>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="all">
                  All
                </SelectItem>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="active">
                  Active
                </SelectItem>
                <SelectItem className={CARD5_SELECT_ITEM_CLASS} value="inactive">
                  Inactive
                </SelectItem>
              </SelectContent>
            </Select>
            {editor ? (
              <Card5CreateButton onClick={openCreate}>
                <Plus className="size-4" /> {addLabel.replace(/^\+ /, "")}
              </Card5CreateButton>
            ) : null}
          </div>
          <Card5ConfigNotice
            loading={query.isLoading}
            blockers={shownReadiness.blockers}
            warnings={shownReadiness.warnings}
          />
        </div>
      }
    >
    <Card3OverlapSheet
      open={catalogue !== "pipeline_stages" && Boolean(draft)}
      title={
        draft && "id" in draft.value && draft.value.id
          ? `Edit ${CARD5_SALES_CATALOGUE_LABELS[catalogue]}`
          : addLabel.replace(/^\+ /, "")
      }
      onClose={() => setDraft(null)}
      onSubmit={draft && editor ? () => mutation.mutate(draft) : undefined}
      submitLabel="Save"
      pending={mutation.isPending}
      canEdit={editor}
      maxWidth="max-w-2xl"
      className="max-h-[85vh]"
      footerJustify="between"
    >
      {draft && catalogue !== "pipeline_stages" ? (
          <div
            data-testid="pms-card5-sales-drawer"
          >
            <div className="space-y-3">
              {draft.kind === "contract" ? (
                <>
                  <div className="space-y-1">
                    <Label>Contract type</Label>
                    <Input
                      value={draft.value.contractType}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          value: { ...draft.value, contractType: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Deposit policy</Label>
                    <Select
                      value={draft.value.depositPolicyId ?? "none"}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          value: { ...draft.value, depositPolicyId: none(value) },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {snapshot.depositPolicies
                          .filter((row) => row.active || row.id === draft.value.depositPolicyId)
                          .map((row) => (
                            <SelectItem key={row.id} value={row.id}>
                              {row.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Payment terms</Label>
                    <Input
                      value={draft.value.paymentTerms}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          value: { ...draft.value, paymentTerms: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cancellation policy</Label>
                    <Textarea
                      value={draft.value.cancellationPolicy}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          value: { ...draft.value, cancellationPolicy: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Default validity (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.value.defaultValidityDays ?? ""}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          value: {
                            ...draft.value,
                            defaultValidityDays: event.target.value
                              ? Number(event.target.value)
                              : null,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Approval required</Label>
                    <Switch
                      checked={draft.value.approvalRequired}
                      disabled={!editor}
                      onCheckedChange={(approvalRequired) =>
                        setDraft({ ...draft, value: { ...draft.value, approvalRequired } })
                      }
                    />
                  </div>
                </>
              ) : draft.kind === "package" ? (
                <>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={draft.value.name}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({ ...draft, value: { ...draft.value, name: event.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Code</Label>
                    <Input
                      value={draft.value.code}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({ ...draft, value: { ...draft.value, code: event.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Event type</Label>
                    <Select
                      value={draft.value.eventTypeId ?? "none"}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setDraft({ ...draft, value: { ...draft.value, eventTypeId: none(value) } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {snapshot.eventTypes.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Pricing method</Label>
                    <Select
                      value={draft.value.pricingMethod}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          value: {
                            ...draft.value,
                            pricingMethod: value as Card5PackageTemplate["pricingMethod"],
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CARD5_PRICING_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>
                            {title(method)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Default price</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.value.defaultPrice ?? ""}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          value: {
                            ...draft.value,
                            defaultPrice:
                              event.target.value === "" ? null : Number(event.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Select
                      value={draft.value.currencyCode ?? "none"}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setDraft({ ...draft, value: { ...draft.value, currencyCode: none(value) } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Property default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Property default</SelectItem>
                        {snapshot.currencies.map((row) => (
                          <SelectItem key={row.code} value={row.code}>
                            {row.code} — {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tax group</Label>
                    <Select
                      value={draft.value.taxGroupId ?? "none"}
                      disabled={!editor}
                      onValueChange={(value) =>
                        setDraft({ ...draft, value: { ...draft.value, taxGroupId: none(value) } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {snapshot.taxGroups.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Valid from</Label>
                      <Input
                        type="date"
                        value={draft.value.validFrom ?? ""}
                        disabled={!editor}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            value: { ...draft.value, validFrom: event.target.value || null },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valid to</Label>
                      <Input
                        type="date"
                        value={draft.value.validTo ?? ""}
                        disabled={!editor}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            value: { ...draft.value, validTo: event.target.value || null },
                          })
                        }
                      />
                    </div>
                  </div>
                  <IdChecks
                    label="Included facilities"
                    ids={draft.value.outletIds}
                    options={snapshot.facilities}
                    disabled={!editor}
                    onChange={(outletIds) =>
                      setDraft({ ...draft, value: { ...draft.value, outletIds } })
                    }
                  />
                  <IdChecks
                    label="Included services"
                    ids={draft.value.serviceIds}
                    options={snapshot.services}
                    disabled={!editor}
                    onChange={(serviceIds) =>
                      setDraft({ ...draft, value: { ...draft.value, serviceIds } })
                    }
                  />
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={draft.value.name}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({ ...draft, value: { ...draft.value, name: event.target.value } })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Code</Label>
                    <Input
                      value={draft.value.code}
                      disabled={!editor}
                      onChange={(event) =>
                        setDraft({ ...draft, value: { ...draft.value, code: event.target.value } })
                      }
                    />
                  </div>
                  {"description" in draft.value ? (
                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Textarea
                        value={draft.value.description}
                        disabled={!editor}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            value: { ...draft.value, description: event.target.value },
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {"sortOrder" in draft.value ? (
                    <div className="space-y-1">
                      <Label>Sequence</Label>
                      <Input
                        type="number"
                        value={draft.value.sortOrder}
                        disabled={!editor}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            value: { ...draft.value, sortOrder: Number(event.target.value) },
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {draft.kind === "pipeline" ? (
                    <div className="flex items-center justify-between">
                      <Label>Terminal stage</Label>
                      <Switch
                        checked={draft.value.isTerminal}
                        disabled={!editor}
                        onCheckedChange={(isTerminal) =>
                          setDraft({ ...draft, value: { ...draft.value, isTerminal } })
                        }
                      />
                    </div>
                  ) : null}
                  {draft.kind === "space" ? (
                    <IdChecks
                      label="Mapped facilities"
                      ids={draft.value.outletIds}
                      options={snapshot.facilities}
                      disabled={!editor}
                      onChange={(outletIds) =>
                        setDraft({ ...draft, value: { ...draft.value, outletIds } })
                      }
                    />
                  ) : null}
                </>
              )}
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={draft.value.active}
                  disabled={!editor}
                  onCheckedChange={(active) =>
                    setDraft({ ...draft, value: { ...draft.value, active } })
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
      </Card3OverlapSheet>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Sales & Events setup…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : catalogue === "pipeline_stages" ? (
        rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#D8CDBB] p-6 text-sm text-muted-foreground">
            {snapshot.pipelineStages.length === 0
              ? "No pipeline stages configured yet."
              : `No ${CARD5_SALES_CATALOGUE_LABELS[catalogue].toLowerCase()} match this view.`}
          </p>
        ) : (
          <Card5TableShell>
            <table
              className="w-full table-fixed text-left text-sm"
              data-testid="pms-card5-pipeline-stages-table"
            >
              <thead className={CARD5_THEAD_CLASS}>
                <tr>
                  <th className={`w-20 ${CARD5_TH_CLASS}`}>Order</th>
                  <th className={CARD5_TH_CLASS}>Stage Name</th>
                  <th className={CARD5_TH_CLASS}>Description</th>
                  <th className={`w-32 ${CARD5_TH_CLASS}`}>Probability</th>
                  <th className={CARD5_STATUS_TH_CLASS}>Status</th>
                  <th className={CARD5_ACTIONS_TH_CLASS}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rows as Card5PipelineStage[]).map((stage) => {
                  const descDisplay = stage.description ? stage.description : "—";
                  const probDisplay =
                    stage.defaultProbability != null
                      ? `${stage.defaultProbability}%`
                      : "Not configured";
                  return (
                    <tr
                      key={stage.id}
                      className={cn(
                        "border-b last:border-0 hover:bg-[#FAF8F5]/50 transition-colors",
                        editor && "cursor-pointer",
                      )}
                      onClick={() => {
                        if (editor) {
                          setSelectedPipelineStage(stage);
                          setPipelineDialogOpen(true);
                        }
                      }}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {stage.sortOrder}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#251605]">{stage.name}</td>
                      <td
                        className="px-3 py-2.5 text-muted-foreground max-w-xs truncate"
                        title={stage.description ?? ""}
                      >
                        {descDisplay}
                      </td>
                      <td className="px-3 py-2.5 text-[#251605]">{probDisplay}</td>
                      <td className={CARD5_STATUS_TD_CLASS}>
                        <Card5Status
                          active={stage.active}
                          activeLabel="Enabled"
                          inactiveLabel="Disabled"
                        />
                      </td>
                      <td className={CARD5_ACTIONS_TD_CLASS} onClick={(e) => e.stopPropagation()}>
                        {editor ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Card5RowMenuButton label={`Actions for ${stage.name}`} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white border-[#E6D7B8]">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setSelectedPipelineStage(stage);
                                  setPipelineDialogOpen(true);
                                }}
                                className="cursor-pointer text-[#251605]"
                              >
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card5TableShell>
        )
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#D8CDBB] p-6 text-sm text-muted-foreground">
          No {CARD5_SALES_CATALOGUE_LABELS[catalogue].toLowerCase()} match this view.
        </p>
      ) : (
        <Card5TableShell>
          <table
            className="w-full table-fixed text-left text-sm"
            data-testid="pms-card5-sales-table"
          >
            <thead className={CARD5_THEAD_CLASS}>
              <tr>
                <th className={CARD5_TH_CLASS}>Name</th>
                <th className={`w-28 ${CARD5_TH_CLASS}`}>Code</th>
                <th className={CARD5_TH_CLASS}>Detail</th>
                <th className={CARD5_STATUS_TH_CLASS}>Status</th>
                <th className={CARD5_ACTIONS_TH_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const detail =
                  "outletIds" in row
                    ? `${row.outletIds.length} facilities`
                    : "sortOrder" in row
                      ? `Sequence ${row.sortOrder}`
                      : "contractType" in row
                        ? row.contractType
                        : "pricingMethod" in row
                          ? title(row.pricingMethod)
                          : "";
                const open = () => {
                  if (catalogue === "event_statuses")
                    setDraft({ kind: "status", value: row as Card5OrderedItem });
                  else if (catalogue === "pipeline_stages")
                    setDraft({ kind: "pipeline", value: row as Card5PipelineStage });
                  else if (catalogue === "function_spaces")
                    setDraft({ kind: "space", value: row as Card5FunctionSpace });
                  else if (catalogue === "package_templates")
                    setDraft({ kind: "package", value: row as Card5PackageTemplate });
                  else if (catalogue === "contract_defaults")
                    setDraft({
                      kind: "contract",
                      value: snapshot.contractDefaults.find(
                        (item) => item.id === row.id,
                      ) as Card5ContractDefault,
                    });
                  else
                    setDraft({
                      kind: "item",
                      catalogue: catalogue as
                        "market_segments" | "source_codes" | "lead_types" | "event_types",
                      value: row as Card5SalesItem,
                    });
                };
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-[#251605]">{row.name}</td>
                    <td className="px-3 py-2">{"code" in row ? row.code : "—"}</td>
                    <td className="px-3 py-2">{detail || "—"}</td>
                    <td className={CARD5_STATUS_TD_CLASS}>
                      <Card5Status active={row.active} />
                    </td>
                    <td className={CARD5_ACTIONS_TD_CLASS}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Card5RowMenuButton label={`Actions for ${row.name}`} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
                          <DropdownMenuItem onSelect={open}>Edit</DropdownMenuItem>
                          {editor ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                const next = { ...row, active: !row.active };
                                if (catalogue === "event_statuses")
                                  mutation.mutate({
                                    kind: "status",
                                    value: next as Card5OrderedItem,
                                  });
                                else if (catalogue === "pipeline_stages")
                                  mutation.mutate({
                                    kind: "pipeline",
                                    value: next as Card5PipelineStage,
                                  });
                                else if (catalogue === "function_spaces")
                                  mutation.mutate({
                                    kind: "space",
                                    value: next as Card5FunctionSpace,
                                  });
                                else if (catalogue === "package_templates")
                                  mutation.mutate({
                                    kind: "package",
                                    value: next as Card5PackageTemplate,
                                  });
                                else if (catalogue === "contract_defaults")
                                  mutation.mutate({
                                    kind: "contract",
                                    value: {
                                      ...(snapshot.contractDefaults.find(
                                        (item) => item.id === row.id,
                                      ) as Card5ContractDefault),
                                      active: !row.active,
                                    },
                                  });
                                else
                                  mutation.mutate({
                                    kind: "item",
                                    catalogue: catalogue as
                                      | "market_segments"
                                      | "source_codes"
                                      | "lead_types"
                                      | "event_types",
                                    value: next as Card5SalesItem,
                                  });
                              }}
                            >
                              {row.active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card5TableShell>
      )}
      {catalogue === "pipeline_stages" ? (
        <PipelineStageDialog
          open={pipelineDialogOpen}
          onOpenChange={(open) => {
            setPipelineDialogOpen(open);
            if (!open) setSelectedPipelineStage(null);
          }}
          stage={selectedPipelineStage}
          onSave={handleSavePipelineStage}
          isSubmitting={isSavingPipelineStage}
        />
      ) : null}
    </PmsPropertySetupCard5Workspace>
    </>
  );
}
