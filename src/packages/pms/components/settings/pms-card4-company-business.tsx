import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import {
  deletePmsCard4BusinessType,
  getPmsCard4CompanyBusiness,
  savePmsCard4BusinessSettings,
  savePmsCard4BusinessType,
  setPmsCard4BusinessTypeActive,
} from "@/packages/pms/lib/company-business-card4.functions";
import {
  emptyBusinessSettings,
  emptyBusinessTypeDraft,
  normalizeBusinessTypeCode,
  validateBusinessSettings,
  validateBusinessTypeDraft,
  type BusinessProfileSettings,
  type BusinessProfileTypeDraft,
  type BusinessProfileTypeRecord,
} from "@/packages/pms/lib/company-business-card4.server";
import { cn } from "@/shared/lib/utils";

function recordToDraft(row: BusinessProfileTypeRecord): BusinessProfileTypeDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    active: row.active,
    requiredFieldIds: [...row.requiredFieldIds],
    taxIdRequired: row.taxIdRequired,
    contactRequired: row.contactRequired,
    creditAccountAllowed: row.creditAccountAllowed,
  };
}

function toggleId(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "default" : "secondary"} className={value ? "bg-[#436436]" : ""}>
      {value ? "Yes" : "No"}
    </Badge>
  );
}

function YesNoSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ? "yes" : "no"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "yes")}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PmsCard4CompanyBusiness({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
  onGoRequiredFields,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
  onGoRequiredFields: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4CompanyBusiness);
  const saveType = useServerFn(savePmsCard4BusinessType);
  const saveSettings = useServerFn(savePmsCard4BusinessSettings);
  const setActive = useServerFn(setPmsCard4BusinessTypeActive);
  const remove = useServerFn(deletePmsCard4BusinessType);
  const queryKey = ["pms-card4-company-business", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const types = query.data?.types ?? [];
  const fields = query.data?.fields ?? [];
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<BusinessProfileTypeDraft>(emptyBusinessTypeDraft());
  const [settings, setSettings] = useState<BusinessProfileSettings>(emptyBusinessSettings());
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BusinessProfileTypeRecord | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  useEffect(() => {
    if (!query.data) return;
    if (!settingsDirty) setSettings(query.data.settings);
    if (selectedId && query.data.types.some((row) => row.id === selectedId)) return;
    setSelectedId(query.data.types[0]?.id ?? null);
  }, [query.data, selectedId, settingsDirty]);

  const visibleTypes = types.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q);
  });
  const selected = types.find((row) => row.id === selectedId) ?? null;
  const typeErrors = validateBusinessTypeDraft(draft, types, fields);
  const settingsErrors = validateBusinessSettings(settings, types);
  const errorFor = (field: string) =>
    typeErrors.find((row) => row.field === field)?.message ?? null;
  const settingsError = settingsErrors.find(
    (row) => row.field === "defaultBusinessTypeId",
  )?.message;
  const activeFields = fields.filter((row) => row.active);
  const staleOnDraft = draft.requiredFieldIds.filter(
    (id) => !fields.some((row) => row.id === id && row.active),
  );

  const typeMutation = useMutation({
    mutationFn: () =>
      saveType({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeBusinessTypeCode(draft.code),
          description: draft.description,
          active: draft.active,
          requiredFieldIds: draft.requiredFieldIds,
          taxIdRequired: draft.taxIdRequired,
          contactRequired: draft.contactRequired,
          creditAccountAllowed: draft.creditAccountAllowed,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-required-fields", restaurantId],
      });
      setEditorOpen(false);
      setDraftDirty(false);
      if (result.id) setSelectedId(result.id);
      toast.success("Business type saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save business type."),
  });

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          restaurantId,
          enabled: settings.enabled,
          defaultBusinessTypeId: settings.defaultBusinessTypeId,
          autoApproval: settings.autoApproval,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setSettingsDirty(false);
      toast.success("Company & Business saved.");
      onSaved(thenNextRef.current);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save business settings."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Business type enabled." : "Business type disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      setSelectedId(null);
      toast.success("Business type deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = typeMutation.isPending || settingsMutation.isPending || toggleMutation.isPending;
  const editorValid = !editorOpen || typeErrors.length === 0;
  const canSave =
    canEdit && !busy && editorValid && settingsErrors.length === 0 && Boolean(query.data);
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !query.data) {
      toast.error("Unable to save business profile settings.");
      return;
    }
    if (editorOpen && typeErrors.length > 0) {
      toast.error(typeErrors[0]?.message ?? "Fix the business type before saving.");
      return;
    }
    if (settingsErrors.length > 0) {
      toast.error(settingsErrors[0]?.message ?? "Fix business settings before saving.");
      return;
    }
    if (editorOpen && draftDirty) {
      typeMutation.mutate(undefined, {
        onSuccess: () => settingsMutation.mutate(),
      });
      return;
    }
    if (!settingsDirty && !thenNextRef.current) {
      toast.success("Company & Business saved.");
      onSaved(false);
      return;
    }
    settingsMutation.mutate();
  }, [
    saveRequest,
    canEdit,
    query.data,
    editorOpen,
    typeErrors,
    settingsErrors,
    draftDirty,
    settingsDirty,
    onSaved,
    typeMutation,
    settingsMutation,
  ]);

  function markType<K extends keyof BusinessProfileTypeDraft>(
    key: K,
    value: BusinessProfileTypeDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDraftDirty(true);
  }

  function markSettings<K extends keyof BusinessProfileSettings>(
    key: K,
    value: BusinessProfileSettings[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: value, defaultInvalid: false }));
    setSettingsDirty(true);
  }

  function openCreate() {
    setDraft(emptyBusinessTypeDraft());
    setDraftDirty(true);
    setEditorOpen(true);
  }

  function openEdit(row: BusinessProfileTypeRecord) {
    setSelectedId(row.id);
    setDraft(recordToDraft(row));
    setDraftDirty(false);
    setEditorOpen(true);
  }

  function requestCloseEditor() {
    if (draftDirty) {
      setPendingClose(true);
      return;
    }
    setEditorOpen(false);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";
  const activeTypes = types.filter((row) => row.active);

  return (
    <div className="space-y-5" data-testid="card4-company-business">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">6.1 Business Profile Types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the business profile types you want to offer at your property.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Business Type
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <div className="space-y-2 p-6">
            {["a", "b", "c"].map((row) => (
              <div key={row} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load business profile settings.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : types.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">No business types configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a business profile type to configure company and business profiles.
            </p>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={openCreate}
              >
                <Plus className="mr-1 size-4" /> Add Business Type
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="border-b border-[#CCCCCC] p-3">
              <Input
                value={search}
                placeholder="Search type name or code"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Required Fields</TableHead>
                    <TableHead>Tax ID Required</TableHead>
                    <TableHead>Contact Required</TableHead>
                    <TableHead>Credit Account</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTypes.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(row.id === selectedId && "bg-[#C89933]/5")}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>
                        <Switch
                          checked={row.active}
                          disabled={!canEdit || toggleMutation.isPending}
                          aria-label={`${row.active ? "Disable" : "Enable"} ${row.name}`}
                          onCheckedChange={(active) =>
                            toggleMutation.mutate({ id: row.id, active })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {row.requiredFieldIds.length}
                        {row.staleRequiredFieldIds.length > 0 ? (
                          <span className="ml-1 text-xs text-destructive">needs review</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <YesNo value={row.taxIdRequired} />
                      </TableCell>
                      <TableCell>
                        <YesNo value={row.contactRequired} />
                      </TableCell>
                      <TableCell>
                        <YesNo value={row.creditAccountAllowed} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${row.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(row);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${row.name}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(row)}>
                                Edit
                              </DropdownMenuItem>
                              {canEdit ? (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    toggleMutation.mutate({ id: row.id, active: !row.active })
                                  }
                                >
                                  {row.active ? "Disable" : "Enable"}
                                </DropdownMenuItem>
                              ) : null}
                              {canEdit ? (
                                <DropdownMenuItem onSelect={() => setPendingDelete(row)}>
                                  Delete
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {selected ? (
        <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4">
          <h3 className="text-sm font-medium text-[#251605]">Business Type Details</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Type Name</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Code</dt>
              <dd>{selected.code}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active</dt>
              <dd>{selected.active ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Required Fields</dt>
              <dd>{selected.requiredFieldIds.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tax ID Required</dt>
              <dd>{selected.taxIdRequired ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contact Required</dt>
              <dd>{selected.contactRequired ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Credit Account Allowed</dt>
              <dd>{selected.creditAccountAllowed ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 space-y-4">
        <div>
          <h2 className="font-display text-xl text-[#251605]">6.2 Business Profile Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure general settings for business profiles.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] px-3 py-3">
          <div>
            <p className="text-sm font-medium text-[#251605]">Enable Business Profile</p>
            <p className="text-xs text-muted-foreground">Allow business profiles in the system.</p>
          </div>
          <Switch
            checked={settings.enabled}
            disabled={!canEdit}
            onCheckedChange={(enabled) => markSettings("enabled", enabled)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Default Business Type</Label>
          {activeTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active business types configured.</p>
          ) : (
            <Select
              value={settings.defaultBusinessTypeId ?? ""}
              disabled={!canEdit || !settings.enabled}
              onValueChange={(value) => markSettings("defaultBusinessTypeId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a default type" />
              </SelectTrigger>
              <SelectContent>
                {activeTypes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {settingsError || settings.defaultInvalid ? (
            <p className="text-xs text-destructive">
              {settingsError ?? "The default business type must be an active configured type."}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] px-3 py-3">
          <div>
            <p className="text-sm font-medium text-[#251605]">Auto-Approval</p>
            <p className="text-xs text-muted-foreground">
              Automatically approve new business profiles.
            </p>
          </div>
          <Switch
            checked={settings.autoApproval}
            disabled={!canEdit}
            onCheckedChange={(autoApproval) => markSettings("autoApproval", autoApproval)}
          />
        </div>
      </section>

      <Sheet
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) requestCloseEditor();
          else setEditorOpen(true);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{draft.id ? "Edit Business Profile Type" : "Add Business Type"}</SheetTitle>
            <SheetDescription>
              Business classification for company profiles. This does not change billing or guest
              records.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-4 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || typeErrors.length > 0) {
                toast.error(typeErrors[0]?.message ?? "Fix the business type before saving.");
                return;
              }
              typeMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="bt-name">Type Name *</Label>
              <Input
                id="bt-name"
                value={draft.name}
                disabled={!canEdit}
                onChange={(event) => markType("name", event.target.value)}
              />
              {errorFor("name") ? (
                <p className="text-xs text-destructive">{errorFor("name")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="bt-code">Code *</Label>
              <Input
                id="bt-code"
                value={draft.code}
                disabled={!canEdit}
                onChange={(event) =>
                  markType("code", normalizeBusinessTypeCode(event.target.value))
                }
              />
              {errorFor("code") ? (
                <p className="text-xs text-destructive">{errorFor("code")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="bt-description">Description</Label>
              <Textarea
                id="bt-description"
                value={draft.description}
                disabled={!canEdit}
                maxLength={400}
                onChange={(event) => markType("description", event.target.value)}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-[#251605]">Required Fields</p>
              <p className="text-xs text-muted-foreground">
                Select the mandatory fields for this business type.
              </p>
              <p className="mt-1 text-xs text-[#251605]">
                {draft.requiredFieldIds.length} fields selected
              </p>
              <div className="mt-2 space-y-2">
                {activeFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`bf-${field.id}`}
                      checked={draft.requiredFieldIds.includes(field.id)}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        markType(
                          "requiredFieldIds",
                          toggleId(draft.requiredFieldIds, field.id, checked === true),
                        )
                      }
                    />
                    <Label htmlFor={`bf-${field.id}`} className="font-normal">
                      {field.name}
                    </Label>
                  </div>
                ))}
              </div>
              {staleOnDraft.length > 0 ? (
                <p className="mt-2 text-xs text-destructive">
                  {staleOnDraft.length} selected field(s) are missing or inactive.
                </p>
              ) : null}
              {errorFor("requiredFieldIds") ? (
                <p className="mt-1 text-xs text-destructive">{errorFor("requiredFieldIds")}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onGoRequiredFields}
              >
                Manage Fields
              </Button>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#251605]">Business Rules</p>
              <YesNoSelect
                id="bt-tax"
                label="Tax ID Required"
                value={draft.taxIdRequired}
                disabled={!canEdit}
                onChange={(value) => markType("taxIdRequired", value)}
              />
              <YesNoSelect
                id="bt-contact"
                label="Contact Required"
                value={draft.contactRequired}
                disabled={!canEdit}
                onChange={(value) => markType("contactRequired", value)}
              />
              <YesNoSelect
                id="bt-credit"
                label="Credit Account Allowed"
                value={draft.creditAccountAllowed}
                disabled={!canEdit}
                onChange={(value) => markType("creditAccountAllowed", value)}
              />
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="bt-active">Active</Label>
                <Switch
                  id="bt-active"
                  checked={draft.active}
                  disabled={!canEdit}
                  onCheckedChange={(active) => markType("active", active)}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={!canEdit || typeMutation.isPending || typeErrors.length > 0}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              {typeMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Business Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this business profile type from the property&apos;s configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved business type changes. Discard them to close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setEditorOpen(false);
                setDraftDirty(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Card4CompanyBusinessGuide({
  typeCount,
  typesWithFields,
  settingsReady,
  saved,
}: {
  typeCount: number;
  typesWithFields: number;
  settingsReady: boolean;
  saved: boolean;
}) {
  const rulesReady = typeCount > 0;
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm">
        <li className={typeCount > 0 ? "text-[#436436]" : "text-muted-foreground"}>
          Configure Business Types
          <span className="mt-0.5 block text-muted-foreground">{typeCount} configured</span>
        </li>
        <li className={typesWithFields > 0 ? "text-[#436436]" : "text-muted-foreground"}>
          Define Required Fields
          <span className="mt-0.5 block text-muted-foreground">{typesWithFields} configured</span>
        </li>
        <li className={rulesReady ? "text-[#436436]" : "text-muted-foreground"}>
          Set Business Rules
          <span className="mt-0.5 block text-muted-foreground">
            {rulesReady ? "Configured" : "Incomplete"}
          </span>
        </li>
        <li className={settingsReady ? "text-[#436436]" : "text-muted-foreground"}>
          Configure General Settings
          <span className="mt-0.5 block text-muted-foreground">
            {settingsReady ? "Configured" : "Incomplete"}
          </span>
        </li>
        <li className={saved && settingsReady ? "text-[#436436]" : "text-muted-foreground"}>
          Review and Save
        </li>
      </ol>
    </section>
  );
}
