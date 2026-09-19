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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { PmsPropertySetupCard7Workspace } from "./pms-property-setup-card7-workspace";
import { propertySetupStatusLabel } from "../../lib/pms-property-setup-card1";
import {
  getCard7Import,
  saveCard7ImportDuplicates,
  saveCard7ImportPolicy,
  saveCard7ImportTemplates,
  saveCard7ImportTypes,
  saveCard7ImportValidation,
} from "../../lib/import-card7.functions";
import {
  CARD7_IMPORT_DUPLICATE_ACTIONS,
  CARD7_IMPORT_NO_MERGE,
  CARD7_IMPORT_NO_RUNNER,
  CARD7_IMPORT_SETUP_ONLY,
  emptyImportPolicy,
  emptyImportSnapshot,
  evaluateCard7ImportReadiness,
  importTypeSettingFor,
  supportedImportTypes,
  type Card7ImportDuplicateAction,
  type Card7ImportDuplicatePolicy,
  type Card7ImportMappingTemplate,
  type Card7ImportPolicy,
  type Card7ImportReadiness,
  type Card7ImportSnapshot,
  type Card7ImportTypeSetting,
  type Card7ImportValidationRule,
} from "../../lib/import-card7.server";

const INNER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "types", label: "Import Types" },
  { id: "templates", label: "Mapping Templates" },
  { id: "validation", label: "Validation" },
  { id: "duplicates", label: "Duplicate Policy" },
  { id: "history", label: "Migration History" },
] as const;

export function Card7ImportTab({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCard7Import);
  const savePolicy = useServerFn(saveCard7ImportPolicy);
  const saveTypes = useServerFn(saveCard7ImportTypes);
  const saveTemplates = useServerFn(saveCard7ImportTemplates);
  const saveValidation = useServerFn(saveCard7ImportValidation);
  const saveDuplicates = useServerFn(saveCard7ImportDuplicates);
  const query = useQuery({
    queryKey: ["pms-card7-import", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: Card7ImportSnapshot = query.data?.snapshot ?? emptyImportSnapshot();
  const readiness: Card7ImportReadiness =
    query.data?.readiness ?? evaluateCard7ImportReadiness(snapshot);
  const editor = canEdit && (query.data?.canEdit ?? canEdit);
  const types = supportedImportTypes(snapshot);

  const [inner, setInner] = useState<(typeof INNER_TABS)[number]["id"]>("overview");
  const [search, setSearch] = useState("");
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number | null>(null);
  const [policyDraft, setPolicyDraft] = useState<Card7ImportPolicy | undefined>();
  const [typeDraft, setTypeDraft] = useState<Record<string, Card7ImportTypeSetting> | undefined>();
  const [templateDraft, setTemplateDraft] = useState<Card7ImportMappingTemplate[] | undefined>();
  const [validationDraft, setValidationDraft] = useState<Card7ImportValidationRule[] | undefined>();
  const [duplicateDraft, setDuplicateDraft] = useState<Card7ImportDuplicatePolicy[] | undefined>();
  const [validated, setValidated] = useState<Card7ImportReadiness | null>(null);

  const policy = policyDraft ?? snapshot.policy ?? emptyImportPolicy();
  const typeSettings = useMemo(() => {
    if (typeDraft) return typeDraft;
    return Object.fromEntries(
      types.map((type) => [
        type.id,
        importTypeSettingFor(snapshot, type.id) ?? {
          id: "",
          importTypeId: type.id,
          enabled: false,
        },
      ]),
    );
  }, [snapshot, typeDraft, types]);
  const templates = templateDraft ?? snapshot.templates;
  const validationRules = validationDraft ?? snapshot.validationRules;
  const duplicates = duplicateDraft ?? snapshot.duplicatePolicies;
  const shownReadiness = validated ?? readiness;
  const selectedTemplate =
    selectedTemplateIndex != null ? (templates[selectedTemplateIndex] ?? null) : null;

  const filteredTemplates = useMemo(() => {
    const value = search.trim().toLowerCase();
    return templates
      .map((template, index) => ({ template, index }))
      .filter(({ template }) => {
        const type = types.find((row) => row.id === template.importTypeId);
        return (
          !value ||
          `${template.name} ${type?.code ?? ""} ${type?.name ?? ""}`.toLowerCase().includes(value)
        );
      });
  }, [search, templates, types]);

  function refresh(result: { snapshot: Card7ImportSnapshot; readiness: Card7ImportReadiness }) {
    queryClient.setQueryData(["pms-card7-import", restaurantId], {
      ...query.data,
      snapshot: result.snapshot,
      readiness: result.readiness,
      canEdit: editor,
    });
    void queryClient.invalidateQueries({ queryKey: ["pms-card7-validation", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-card1", restaurantId] });
    setValidated(null);
  }

  const policyMutation = useMutation({
    mutationFn: () =>
      savePolicy({
        data: {
          restaurantId,
          enabled: policy.enabled,
          previewRequired: policy.previewRequired,
          maxRows: policy.maxRows,
          ownerManagerExecuteOnly: policy.ownerManagerExecuteOnly,
          active: policy.active,
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setPolicyDraft(result.snapshot.policy);
      toast.success("Import policy saved. No file was parsed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const typesMutation = useMutation({
    mutationFn: () =>
      saveTypes({
        data: {
          restaurantId,
          settings: types.map((type) => ({
            importTypeId: type.id,
            enabled: typeSettings[type.id]?.enabled === true,
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setTypeDraft(undefined);
      toast.success("Supported import types saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const templatesMutation = useMutation({
    mutationFn: () =>
      saveTemplates({
        data: {
          restaurantId,
          templates: templates.map((template) => ({
            importTypeId: template.importTypeId,
            name: template.name,
            active: template.active,
            fields: template.fields.map((field) => ({
              fieldDefinitionId: field.fieldDefinitionId,
              sourceColumn: field.sourceColumn,
            })),
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setTemplateDraft(result.snapshot.templates);
      toast.success("Mapping templates saved. Approved Noru fields only.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validationMutation = useMutation({
    mutationFn: () =>
      saveValidation({
        data: {
          restaurantId,
          rules: validationRules.map((row) => ({
            importTypeId: row.importTypeId,
            fieldCode: row.fieldCode,
            ruleKind: row.ruleKind,
            enabled: row.enabled,
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setValidationDraft(undefined);
      toast.success("Validation flags saved. No import was executed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicatesMutation = useMutation({
    mutationFn: () =>
      saveDuplicates({
        data: {
          restaurantId,
          policies: duplicates.map((row) => ({
            importTypeId: row.importTypeId,
            matchKeys: row.matchKeys,
            action: row.action,
          })),
        },
      }),
    onSuccess: (result) => {
      refresh(result);
      setDuplicateDraft(undefined);
      toast.success("Duplicate policy saved. Auto-merge remains unavailable.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function addTemplate() {
    const type = types[0];
    if (!type) return;
    setTemplateDraft([
      ...templates,
      {
        id: `draft-${templates.length}`,
        importTypeId: type.id,
        name: `${type.name} template`,
        active: true,
        fields: [],
      },
    ]);
    setSelectedTemplateIndex(templates.length);
  }

  function updateSelectedTemplate(next: Card7ImportMappingTemplate) {
    if (selectedTemplateIndex == null) return;
    const copy = [...templates];
    copy[selectedTemplateIndex] = next;
    setTemplateDraft(copy);
  }

  return (
    <PmsPropertySetupCard7Workspace
      validate={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = evaluateCard7ImportReadiness(snapshot);
            setValidated(next);
            if (next.ready) toast.success("Data Import setup is ready. Card 7 is not complete.");
            else toast.error(next.blockers[0] ?? "Data Import setup is not ready.");
          }}
        >
          Validate
        </Button>
      }
      search={
        inner === "templates" ? (
          <div className="min-w-[14rem] flex-1 space-y-1">
            <Label htmlFor="card7-import-search">Search templates</Label>
            <Input
              id="card7-import-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or import type"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {CARD7_IMPORT_SETUP_ONLY} {CARD7_IMPORT_NO_RUNNER} {CARD7_IMPORT_NO_MERGE}
          </p>
        )
      }
      drawer={
        selectedTemplate ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4" data-testid="card7-import-drawer">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Mapping template</p>
              <Input
                value={selectedTemplate.name}
                disabled={!editor}
                onChange={(event) =>
                  updateSelectedTemplate({ ...selectedTemplate, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Import type</Label>
              <Select
                value={selectedTemplate.importTypeId}
                disabled={!editor}
                onValueChange={(value) =>
                  updateSelectedTemplate({ ...selectedTemplate, importTypeId: value, fields: [] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={selectedTemplate.active}
                disabled={!editor}
                onCheckedChange={(active) => updateSelectedTemplate({ ...selectedTemplate, active })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Source columns map to approved Noru fields only. Database column names are not accepted.
            </p>
            {snapshot.fields
              .filter((field) => field.importTypeId === selectedTemplate.importTypeId && field.active)
              .map((field) => {
                const mapped = selectedTemplate.fields.find((row) => row.fieldDefinitionId === field.id);
                return (
                  <div key={field.id} className="space-y-1">
                    <Label>
                      {field.name}
                      {field.required ? " (required)" : ""}
                    </Label>
                    <Input
                      value={mapped?.sourceColumn ?? ""}
                      disabled={!editor}
                      placeholder="External column name"
                      onChange={(event) => {
                        const sourceColumn = event.target.value;
                        const nextFields = selectedTemplate.fields.filter(
                          (row) => row.fieldDefinitionId !== field.id,
                        );
                        if (sourceColumn.trim()) {
                          nextFields.push({
                            id: mapped?.id ?? "",
                            templateId: selectedTemplate.id,
                            fieldDefinitionId: field.id,
                            sourceColumn,
                          });
                        }
                        updateSelectedTemplate({ ...selectedTemplate, fields: nextFields });
                      }}
                    />
                  </div>
                );
              })}
          </div>
        ) : undefined
      }
      status={
        <div>
          <p className="text-sm text-[#251605]">
            Data Import: {propertySetupStatusLabel(shownReadiness.status)}
          </p>
          <p className={shownReadiness.blockers[0] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {shownReadiness.blockers[0] ?? shownReadiness.warnings[0]}
          </p>
        </div>
      }
      actions={<p className="text-xs text-muted-foreground">Configure only · No import runner</p>}
    >
      <Tabs value={inner} onValueChange={(value) => setInner(value as typeof inner)}>
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          {INNER_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-testid={`card7-import-${tab.id}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Supported types", types.length],
              ["Enabled types", Object.values(typeSettings).filter((row) => row.enabled).length],
              ["Mapping templates", templates.length],
              ["History records", snapshot.jobs.length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-medium text-[#251605]">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-4 rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <Label>Enable import policy</Label>
              <Switch
                checked={policy.enabled}
                disabled={!editor}
                onCheckedChange={(enabled) => setPolicyDraft({ ...policy, enabled })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Preview required before run</Label>
              <Switch
                checked={policy.previewRequired}
                disabled={!editor}
                onCheckedChange={(previewRequired) => setPolicyDraft({ ...policy, previewRequired })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Owner/manager execute only</Label>
              <Switch
                checked={policy.ownerManagerExecuteOnly}
                disabled={!editor}
                onCheckedChange={(ownerManagerExecuteOnly) =>
                  setPolicyDraft({ ...policy, ownerManagerExecuteOnly })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Max rows</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={policy.maxRows}
                disabled={!editor}
                onChange={(event) =>
                  setPolicyDraft({ ...policy, maxRows: Number(event.target.value) })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">Allowed format: CSV only. Excel is not supported.</p>
            {editor ? (
              <Button onClick={() => policyMutation.mutate()} disabled={policyMutation.isPending}>
                {policyMutation.isPending ? "Saving…" : "Save import policy"}
              </Button>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="types" className="space-y-3">
          {types.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              No supported import types are available yet.
            </p>
          ) : (
            types.map((type) => (
              <div key={type.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                <div>
                  <p className="font-medium text-[#251605]">{type.name}</p>
                  <p className="text-xs text-muted-foreground">{type.code} · domain writer only</p>
                  <p className="mt-1 text-sm">{type.description}</p>
                </div>
                <Switch
                  checked={typeSettings[type.id]?.enabled === true}
                  disabled={!editor}
                  onCheckedChange={(enabled) =>
                    setTypeDraft({
                      ...typeSettings,
                      [type.id]: {
                        id: typeSettings[type.id]?.id ?? "",
                        importTypeId: type.id,
                        enabled,
                      },
                    })
                  }
                />
              </div>
            ))
          )}
          {editor ? (
            <Button onClick={() => typesMutation.mutate()} disabled={typesMutation.isPending}>
              {typesMutation.isPending ? "Saving…" : "Save import types"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          {filteredTemplates.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              No mapping templates yet. Create one to map external columns onto approved Noru fields.
            </p>
          ) : (
            filteredTemplates.map(({ template, index }) => {
              const type = types.find((row) => row.id === template.importTypeId);
              return (
                <button
                  type="button"
                  key={`${template.id}-${index}`}
                  onClick={() => setSelectedTemplateIndex(index)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left hover:border-[#C89933]"
                >
                  <span>
                    <span className="font-medium text-[#251605]">{template.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {type?.name ?? "Unknown type"} · {template.fields.length} fields
                    </span>
                  </span>
                  <span className="text-xs">{template.active ? "Active" : "Inactive"}</span>
                </button>
              );
            })
          )}
          {editor ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={addTemplate}>
                Add mapping template
              </Button>
              <Button onClick={() => templatesMutation.mutate()} disabled={templatesMutation.isPending}>
                {templatesMutation.isPending ? "Saving…" : "Save mapping templates"}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="validation" className="space-y-3">
          {validationRules.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              No validation flags yet. Required, format and referential flags can be enabled here.
            </p>
          ) : (
            types.map((type) => {
              const rules = validationRules.filter((row) => row.importTypeId === type.id);
              if (rules.length === 0) return null;
              return (
                <div key={type.id} className="rounded-2xl border bg-card p-4">
                  <p className="mb-3 font-medium text-[#251605]">{type.name}</p>
                  <div className="space-y-2">
                    {rules.map((rule, index) => {
                      const globalIndex = validationRules.findIndex((row) => row === rule);
                      return (
                        <div key={`${rule.id}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                          <span className="text-sm">
                            {rule.fieldCode} · {rule.ruleKind}
                          </span>
                          <Switch
                            checked={rule.enabled}
                            disabled={!editor}
                            onCheckedChange={(enabled) => {
                              const next = [...validationRules];
                              if (globalIndex >= 0) next[globalIndex] = { ...rule, enabled };
                              setValidationDraft(next);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          {editor ? (
            <Button onClick={() => validationMutation.mutate()} disabled={validationMutation.isPending}>
              {validationMutation.isPending ? "Saving…" : "Save validation rules"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="duplicates" className="space-y-3">
          {duplicates.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              No duplicate policies yet. Warn, skip or block are the only allowed actions.
            </p>
          ) : (
            duplicates.map((row, index) => {
              const type = types.find((item) => item.id === row.importTypeId);
              return (
                <div key={`${row.id}-${index}`} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="font-medium text-[#251605]">{type?.name ?? row.importTypeId}</p>
                    <p className="text-xs text-muted-foreground">Match keys</p>
                    <Input
                      value={row.matchKeys}
                      disabled={!editor}
                      onChange={(event) => {
                        const next = [...duplicates];
                        next[index] = { ...row, matchKeys: event.target.value };
                        setDuplicateDraft(next);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Action</Label>
                    <Select
                      value={row.action}
                      disabled={!editor}
                      onValueChange={(value) => {
                        const next = [...duplicates];
                        next[index] = { ...row, action: value as Card7ImportDuplicateAction };
                        setDuplicateDraft(next);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARD7_IMPORT_DUPLICATE_ACTIONS.map((action) => (
                          <SelectItem key={action} value={action}>{action}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          )}
          {editor ? (
            <Button onClick={() => duplicatesMutation.mutate()} disabled={duplicatesMutation.isPending}>
              {duplicatesMutation.isPending ? "Saving…" : "Save duplicate policy"}
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <p className="text-sm text-muted-foreground">{CARD7_IMPORT_NO_RUNNER}</p>
          {snapshot.jobs.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              No migration jobs have been recorded. History is preserved when a later domain-safe run writes a job.
            </p>
          ) : (
            snapshot.jobs.map((job) => {
              const type = types.find((row) => row.id === job.importTypeId);
              const issues = snapshot.jobIssues.filter((issue) => issue.jobId === job.id);
              return (
                <div key={job.id} className="rounded-2xl border bg-card p-4">
                  <p className="font-medium text-[#251605]">{type?.name ?? "Import"} · {job.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.originalFilename ?? "No file"} · {job.rowCount ?? 0} rows · {job.createdAt}
                  </p>
                  {issues.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs">
                      {issues.map((issue) => (
                        <li key={issue.id}>
                          {issue.severity}: {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </PmsPropertySetupCard7Workspace>
  );
}
