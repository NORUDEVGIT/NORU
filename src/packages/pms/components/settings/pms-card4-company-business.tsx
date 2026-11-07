import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Search } from "lucide-react";
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
import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
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
  savePmsCard4ContactRole,
  setPmsCard4BusinessTypeActive,
  setPmsCard4ContactRoleActive,
} from "@/packages/pms/lib/company-business-card4.functions";
import {
  deletePmsCompanyDocumentType,
  listPmsCompanyDocumentTypes,
  savePmsCompanyDocumentType,
  setPmsCompanyDocumentTypeActive,
  setPmsCompanyDocumentTypeRequired,
  type CompanyDocumentTypeRecord,
} from "@/packages/pms/lib/corporate-contracts.functions";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";
import {
  emptyBusinessSettings,
  emptyBusinessTypeDraft,
  emptyContactRoleDraft,
  normalizeBusinessTypeCode,
  validateBusinessSettings,
  validateBusinessTypeDraft,
  validateContactRoleDraft,
  type BusinessContactRoleDraft,
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
  const saveRole = useServerFn(savePmsCard4ContactRole);
  const setRoleActive = useServerFn(setPmsCard4ContactRoleActive);
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
  const [roleDraft, setRoleDraft] = useState<BusinessContactRoleDraft>(emptyContactRoleDraft());
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleAttempted, setRoleAttempted] = useState(false);
  const requiredFieldsRef = useRef<HTMLDivElement>(null);
  const [editorFocus, setEditorFocus] = useState<"details" | "fields">("details");
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);

  const fetchDocTypes = useServerFn(listPmsCompanyDocumentTypes);
  const saveDocType = useServerFn(savePmsCompanyDocumentType);
  const setDocTypeActive = useServerFn(setPmsCompanyDocumentTypeActive);
  const setDocTypeRequired = useServerFn(setPmsCompanyDocumentTypeRequired);
  const deleteDocType = useServerFn(deletePmsCompanyDocumentType);

  const docTypesQuery = useQuery({
    queryKey: ["pms-company-document-types", restaurantId],
    queryFn: () => fetchDocTypes({ data: { restaurantId } }),
  });
  const docTypes = docTypesQuery.data ?? [];
  const [docTypeDraft, setDocTypeDraft] = useState<CompanyDocumentTypeRecord | "new" | null>(null);
  const [pendingDeleteDocType, setPendingDeleteDocType] = useState<CompanyDocumentTypeRecord | null>(null);
  const [docTypePage, setDocTypePage] = useState(1);
  const [docTypeSearch, setDocTypeSearch] = useState("");
  const [docTypeApplicability, setDocTypeApplicability] = useState<"all" | "company" | "travel_agency">("all");
  const [docTypeRequirement, setDocTypeRequirement] = useState<"all" | "required" | "optional">("all");
  const [docTypeStatus, setDocTypeStatus] = useState<"all" | "active" | "inactive">("all");
  const DOC_TYPE_PAGE_SIZE = 25;

  const invalidateDocumentTypeQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pms-company-document-types"] }),
      queryClient.invalidateQueries({ queryKey: ["company-contract-create-config"] }),
      queryClient.invalidateQueries({ queryKey: ["travel-agency-step4-config"] }),
      queryClient.invalidateQueries({ queryKey: ["guest-company-create-context"] }),
      queryClient.invalidateQueries({ queryKey: ["pms-guest-travel-agent-create-context"] }),
      queryClient.invalidateQueries({ queryKey: ["pms-corporate-contracts-context"] }),
      invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId),
    ]);
  };

  const docTypeMutation = useMutation({
    mutationFn: (input: { id?: string; name: string; code: string; description?: string; required: boolean; appliesToContract: boolean; appliesToCompany: boolean; appliesToTravelAgency: boolean; displayOrder: number; active: boolean }) =>
      saveDocType({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      await invalidateDocumentTypeQueries();
      setDocTypeDraft(null);
      toast.success("Document type saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save document type."),
  });

  const docTypeActiveMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setDocTypeActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await invalidateDocumentTypeQueries();
      toast.success(input.active ? "Document type enabled." : "Document type disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const docTypeRequiredMutation = useMutation({
    mutationFn: (input: { id: string; required: boolean }) =>
      setDocTypeRequired({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await invalidateDocumentTypeQueries();
      toast.success(input.required ? "Document marked as required." : "Document marked as optional.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const docTypeDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocType({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await invalidateDocumentTypeQueries();
      setPendingDeleteDocType(null);
      toast.success("Document type deleted.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete document type."),
  });

  const filteredDocTypes = useMemo(() => {
    return docTypes.filter((row) => {
      const q = docTypeSearch.trim().toLowerCase();
      if (q) {
        const matchesName = row.name.toLowerCase().includes(q);
        const matchesCode = row.code.toLowerCase().includes(q);
        const matchesDesc = (row.description ?? "").toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesDesc) return false;
      }
      if (docTypeApplicability === "company" && !row.appliesToCompany) return false;
      if (docTypeApplicability === "travel_agency" && !row.appliesToTravelAgency) return false;
      if (docTypeRequirement === "required" && !row.required) return false;
      if (docTypeRequirement === "optional" && row.required) return false;
      if (docTypeStatus === "active" && !row.active) return false;
      if (docTypeStatus === "inactive" && row.active) return false;
      return true;
    });
  }, [docTypes, docTypeSearch, docTypeApplicability, docTypeRequirement, docTypeStatus]);

  const docTypePageCount = Math.max(1, Math.ceil(filteredDocTypes.length / DOC_TYPE_PAGE_SIZE));
  const safeDocTypePage = Math.min(docTypePage, docTypePageCount);
  const docTypeStart = filteredDocTypes.length === 0 ? 0 : (safeDocTypePage - 1) * DOC_TYPE_PAGE_SIZE + 1;
  const docTypeEnd = Math.min(safeDocTypePage * DOC_TYPE_PAGE_SIZE, filteredDocTypes.length);
  const visibleDocTypes = filteredDocTypes.slice(
    (safeDocTypePage - 1) * DOC_TYPE_PAGE_SIZE,
    safeDocTypePage * DOC_TYPE_PAGE_SIZE,
  );

  useEffect(() => {
    if (!query.data) return;
    if (!settingsDirty) setSettings(query.data.settings);
  }, [query.data, settingsDirty]);

  const visibleTypes = types.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q);
  });
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
          active: draft.id
            ? (types.find((row) => row.id === draft.id)?.active ?? draft.active)
            : draft.active,
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
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
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
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setSettingsDirty(false);
      toast.success("Company & Business saved.");
      onSaved(thenNextRef.current);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save business settings."),
  });

  const roleMutation = useMutation({
    mutationFn: () =>
      saveRole({
        data: {
          restaurantId,
          ...(roleDraft.id ? { id: roleDraft.id } : {}),
          name: roleDraft.name,
          code: normalizeBusinessTypeCode(roleDraft.code),
          active: roleDraft.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setRoleDraft(emptyContactRoleDraft());
      setRoleAttempted(false);
      setRoleEditorOpen(false);
      toast.success("Contact role saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save contact role."),
  });

  const roleActiveMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setRoleActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Contact role enabled." : "Contact role disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      toast.success(input.active ? "Business type enabled." : "Business type disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
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
    setEditorFocus("details");
    setEditorOpen(true);
  }

  function openEdit(row: BusinessProfileTypeRecord, focus: "details" | "fields" = "details") {
    setSelectedId(row.id);
    setDraft(recordToDraft(row));
    setDraftDirty(false);
    setEditorFocus(focus);
    setEditorOpen(true);
  }

  function openAddRole() {
    setRoleDraft(emptyContactRoleDraft());
    setRoleAttempted(false);
    setRoleEditorOpen(true);
  }

  function openEditRole(row: { id: string; name: string; code: string; active: boolean }) {
    setRoleDraft({
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
    });
    setRoleAttempted(false);
    setRoleEditorOpen(true);
  }

  const roleErrors = validateContactRoleDraft(roleDraft, query.data?.roles ?? []);
  const roleErrorFor = (field: string) =>
    roleAttempted ? (roleErrors.find((row) => row.field === field)?.message ?? null) : null;

  function requestCloseEditor() {
    if (draftDirty) {
      setPendingClose(true);
      return;
    }
    setEditorOpen(false);
  }

  const activeTypes = types.filter((row) => row.active);

  useEffect(() => {
    if (!editorOpen || editorFocus !== "fields") return;
    requiredFieldsRef.current?.scrollIntoView({ block: "nearest" });
  }, [editorOpen, editorFocus]);

  return (
    <div className="space-y-4" data-testid="card4-company-business">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#251605]">Business Profile Types</h2>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Business Type
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white">
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
                    <TableHead>Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Required Fields</TableHead>
                    <TableHead>Tax ID</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Credit Account</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTypes.map((row) => (
                    <TableRow key={row.id} className="hover:bg-[#FAF8F5]/80">
                      <TableCell className="py-2 font-medium text-[#251605]">{row.name}</TableCell>
                      <TableCell className="py-2">{row.code}</TableCell>
                      <TableCell className="py-2">
                        {row.requiredFieldIds.length}
                        {row.staleRequiredFieldIds.length > 0 ? (
                          <span className="ml-1 text-xs text-destructive">needs review</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2">
                        <YesNo value={row.taxIdRequired} />
                      </TableCell>
                      <TableCell className="py-2">
                        <YesNo value={row.contactRequired} />
                      </TableCell>
                      <TableCell className="py-2">
                        <YesNo value={row.creditAccountAllowed} />
                      </TableCell>
                      <TableCell className="py-2">
                        <Switch
                          checked={row.active}
                          disabled={!canEdit || toggleMutation.isPending}
                          aria-label={`${row.active ? "Deactivate" : "Activate"} ${row.name}`}
                          onCheckedChange={(active) =>
                            toggleMutation.mutate({ id: row.id, active })
                          }
                        />
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 border-[#DDD4C5]">
                            <DropdownMenuItem onSelect={() => openEdit(row, "details")}>
                              Edit Business Type
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEdit(row, "fields")}>
                              Configure Required Fields
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  toggleMutation.mutate({ id: row.id, active: !row.active })
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            ) : null}
                            {canEdit ? (
                              <DropdownMenuItem onSelect={() => setPendingDelete(row)}>
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <section className="rounded-xl border border-[#CCCCCC] bg-white p-4">
        <h2 className="font-display text-lg text-[#251605]">Business Profile Settings</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bp-enabled" className="text-sm font-medium text-[#251605]">
              Business Profiles
            </Label>
            <Switch
              id="bp-enabled"
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
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bp-auto-approval" className="text-sm font-medium text-[#251605]">
                Auto Approval
              </Label>
              <Switch
                id="bp-auto-approval"
                checked={settings.autoApproval}
                disabled={!canEdit}
                onCheckedChange={(autoApproval) => markSettings("autoApproval", autoApproval)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Automatically approve newly created business profiles.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white" data-testid="card4-contact-roles">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-display text-lg text-[#251605]">Contact Roles</h2>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={openAddRole}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              <Plus className="mr-1 size-4" /> Add Role
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.roles ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="py-2">{row.name}</TableCell>
                  <TableCell className="py-2">{row.code}</TableCell>
                  <TableCell className="py-2">{row.active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Actions for ${row.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
                        <DropdownMenuItem disabled={!canEdit} onSelect={() => openEditRole(row)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!canEdit}
                          onSelect={() =>
                            roleActiveMutation.mutate({ id: row.id, active: !row.active })
                          }
                        >
                          {row.active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white" data-testid="card4-company-document-types">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CCCCCC] px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg text-[#251605]">Document Types</h2>
            <Badge variant="outline" className="text-xs font-normal">
              {docTypes.length} configured
            </Badge>
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setDocTypeDraft("new")}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              <Plus className="mr-1 size-4" /> Add Document Type
            </Button>
          ) : null}
        </div>

        {/* Search & Filter Bar */}
        <div className="border-b border-[#E5E7EB] bg-[#FAF8F5]/60 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={docTypeSearch}
                placeholder="Search document name, code, or description..."
                className="pl-8 h-8 text-xs bg-white"
                onChange={(event) => {
                  setDocTypeSearch(event.target.value);
                  setDocTypePage(1);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Applies to:</span>
              <button
                type="button"
                onClick={() => { setDocTypeApplicability("all"); setDocTypePage(1); }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  docTypeApplicability === "all"
                    ? "bg-[#251605] text-white"
                    : "bg-white border border-[#E5E7EB] text-[#251605] hover:bg-muted",
                )}
              >
                All ({docTypes.length})
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeApplicability("company"); setDocTypePage(1); }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  docTypeApplicability === "company"
                    ? "bg-[#C89933] text-[#251605] font-semibold"
                    : "bg-white border border-[#E5E7EB] text-[#251605] hover:bg-muted",
                )}
              >
                Company ({docTypes.filter((d) => d.appliesToCompany).length})
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeApplicability("travel_agency"); setDocTypePage(1); }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  docTypeApplicability === "travel_agency"
                    ? "bg-[#C89933] text-[#251605] font-semibold"
                    : "bg-white border border-[#E5E7EB] text-[#251605] hover:bg-muted",
                )}
              >
                Travel Agency ({docTypes.filter((d) => d.appliesToTravelAgency).length})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#EDE6D8]/60">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Requirement:</span>
              <button
                type="button"
                onClick={() => { setDocTypeRequirement("all"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeRequirement === "all"
                    ? "bg-[#EDE6D8] font-semibold text-[#251605]"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeRequirement("required"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeRequirement === "required"
                    ? "bg-[#436436]/15 font-semibold text-[#436436]"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                Required ({docTypes.filter((d) => d.required).length})
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeRequirement("optional"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeRequirement === "optional"
                    ? "bg-stone-200 font-semibold text-[#251605]"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                Optional ({docTypes.filter((d) => !d.required).length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground mr-1">Status:</span>
              <button
                type="button"
                onClick={() => { setDocTypeStatus("all"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeStatus === "all"
                    ? "bg-[#EDE6D8] font-semibold text-[#251605]"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeStatus("active"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeStatus === "active"
                    ? "bg-emerald-100 font-semibold text-emerald-800"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                Active ({docTypes.filter((d) => d.active).length})
              </button>
              <button
                type="button"
                onClick={() => { setDocTypeStatus("inactive"); setDocTypePage(1); }}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  docTypeStatus === "inactive"
                    ? "bg-amber-100 font-semibold text-amber-800"
                    : "text-muted-foreground hover:text-[#251605]",
                )}
              >
                Inactive ({docTypes.filter((d) => !d.active).length})
              </button>
            </div>
          </div>
        </div>

        {filteredDocTypes.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">
              {docTypes.length === 0 ? "No document types configured." : "No document types match your filters."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {docTypes.length === 0
                ? "Add a document type to define compliance and registration documents accepted for companies and travel agencies."
                : "Try adjusting your search terms or filter selection."}
            </p>
            {docTypes.length === 0 && canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={() => setDocTypeDraft("new")}
              >
                <Plus className="mr-1 size-4" /> Add Document Type
              </Button>
            ) : docTypes.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setDocTypeSearch("");
                  setDocTypeApplicability("all");
                  setDocTypeRequirement("all");
                  setDocTypeStatus("all");
                  setDocTypePage(1);
                }}
              >
                Reset Filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDocTypes.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[16rem] truncate py-2 font-medium text-[#251605]">
                        <span title={row.name}>{row.name}</span>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-xs">{row.code}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.required}
                            disabled={!canEdit || docTypeRequiredMutation.isPending}
                            onCheckedChange={(required) =>
                              docTypeRequiredMutation.mutate({ id: row.id, required })
                            }
                            aria-label={`${row.required ? "Make optional" : "Make required"} ${row.name}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {row.required ? "Required" : "Optional"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.appliesToCompany ? (
                            <span className="rounded-full border border-[#DDD4C5] bg-[#FAF8F5] px-2 py-0.5 text-[10px] text-[#251605]">
                              Company
                            </span>
                          ) : null}
                          {row.appliesToTravelAgency ? (
                            <span className="rounded-full border border-[#DDD4C5] bg-[#FAF8F5] px-2 py-0.5 text-[10px] text-[#251605]">
                              Travel Agency
                            </span>
                          ) : null}
                          {!row.appliesToCompany && !row.appliesToTravelAgency ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Switch
                          checked={row.active}
                          disabled={!canEdit || docTypeActiveMutation.isPending}
                          onCheckedChange={(active) =>
                            docTypeActiveMutation.mutate({ id: row.id, active })
                          }
                          aria-label={`Toggle active for ${row.name}`}
                        />
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 border-[#DDD4C5]">
                            <DropdownMenuItem onSelect={() => setDocTypeDraft(row)}>
                              Edit
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  docTypeRequiredMutation.mutate({
                                    id: row.id,
                                    required: !row.required,
                                  })
                                }
                              >
                                {row.required ? "Make Optional" : "Make Required"}
                              </DropdownMenuItem>
                            ) : null}
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  docTypeActiveMutation.mutate({ id: row.id, active: !row.active })
                                }
                              >
                                {row.active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                            ) : null}
                            {canEdit ? (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setPendingDeleteDocType(row)}
                              >
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {docTypeStart}–{docTypeEnd} of {docTypes.length} document types
                {filteredDocTypes.length !== docTypes.length ? ` (filtered from ${filteredDocTypes.length} active matching)` : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeDocTypePage <= 1}
                  onClick={() => setDocTypePage((v) => Math.max(1, v - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeDocTypePage >= docTypePageCount}
                  onClick={() => setDocTypePage((v) => Math.min(docTypePageCount, v + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <Card3OverlapSheet
        open={editorOpen}
        title={draft.id ? "Edit Business Type" : "Add Business Type"}
        onClose={requestCloseEditor}
        onSubmit={() => {
          if (!canEdit || typeErrors.length > 0) {
            toast.error(typeErrors[0]?.message ?? "Fix the business type before saving.");
            return;
          }
          typeMutation.mutate();
        }}
        submitLabel="Save Changes"
        pending={typeMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-[850px]"
        footerJustify="between"
      >
        <div className="grid gap-3 sm:grid-cols-2">
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
        <div ref={requiredFieldsRef}>
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
        </div>
      </Card3OverlapSheet>

      <Card3OverlapSheet
        open={roleEditorOpen}
        title={roleDraft.id ? "Edit Contact Role" : "Add Role"}
        onClose={() => {
          setRoleEditorOpen(false);
          setRoleAttempted(false);
        }}
        onSubmit={() => {
          setRoleAttempted(true);
          if (roleErrors.length > 0) return;
          roleMutation.mutate();
        }}
        submitLabel={roleDraft.id ? "Save Changes" : "Add Role"}
        pending={roleMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-md"
        footerJustify="between"
      >
        <div className="space-y-1">
          <Label htmlFor="cr-name">Role Name</Label>
          <Input
            id="cr-name"
            value={roleDraft.name}
            disabled={!canEdit}
            onChange={(event) => setRoleDraft((current) => ({ ...current, name: event.target.value }))}
          />
          {roleErrorFor("name") ? (
            <p className="text-xs text-destructive">{roleErrorFor("name")}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="cr-code">Code</Label>
          <Input
            id="cr-code"
            value={roleDraft.code}
            disabled={!canEdit}
            onChange={(event) => setRoleDraft((current) => ({ ...current, code: event.target.value }))}
          />
          {roleErrorFor("code") ? (
            <p className="text-xs text-destructive">{roleErrorFor("code")}</p>
          ) : null}
        </div>
      </Card3OverlapSheet>

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

      <AlertDialog
        open={Boolean(pendingDeleteDocType)}
        onOpenChange={(open) => !open && setPendingDeleteDocType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{pendingDeleteDocType?.name}&quot; from property settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDeleteDocType && docTypeDeleteMutation.mutate(pendingDeleteDocType.id)}
            >
              {docTypeDeleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompanyDocumentTypeSheet
        key={docTypeDraft === "new" ? "new" : docTypeDraft?.id ?? "closed"}
        open={docTypeDraft !== null}
        canEdit={canEdit}
        value={docTypeDraft === "new" || docTypeDraft === null ? null : docTypeDraft}
        pending={docTypeMutation.isPending}
        onClose={() => setDocTypeDraft(null)}
        onSave={docTypeMutation.mutate}
      />
    </div>
  );
}

function CompanyDocumentTypeSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: CompanyDocumentTypeRecord | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; code: string; description?: string; required: boolean; appliesToContract: boolean; appliesToCompany: boolean; appliesToTravelAgency: boolean; displayOrder: number; active: boolean }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [required, setRequired] = useState(Boolean(value?.required));
  const [appliesToCompany, setAppliesToCompany] = useState(value?.appliesToCompany ?? true);
  const [appliesToTravelAgency, setAppliesToTravelAgency] = useState(value?.appliesToTravelAgency ?? false);
  const [displayOrder, setDisplayOrder] = useState(String(value?.displayOrder ?? 0));
  const [active, setActive] = useState(value?.active ?? true);

  useEffect(() => {
    if (open) {
      setName(value?.name ?? "");
      setCode(value?.code ?? "");
      setDescription(value?.description ?? "");
      setRequired(Boolean(value?.required));
      setAppliesToCompany(value?.appliesToCompany ?? true);
      setAppliesToTravelAgency(value?.appliesToTravelAgency ?? false);
      setDisplayOrder(String(value?.displayOrder ?? 0));
      setActive(value?.active ?? true);
    }
  }, [open, value]);

  function submitDocumentType() {
    if (!canEdit || !name.trim() || !code.trim()) {
      toast.error("Please enter a valid document name and code.");
      return;
    }
    onSave({
      ...(value ? { id: value.id } : {}),
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || undefined,
      required,
      appliesToContract: appliesToCompany,
      appliesToCompany,
      appliesToTravelAgency,
      displayOrder: Number(displayOrder) || 0,
      active,
    });
  }

  return (
    <Card3OverlapSheet
      open={open}
      title={value ? "Edit Document Type" : "Add Document Type"}
      onClose={onClose}
      onSubmit={submitDocumentType}
      submitLabel={value ? "Save Document Type" : "Add Document Type"}
      pending={pending}
      canEdit={canEdit}
      maxWidth="max-w-[750px]"
      footerJustify="between"
    >
      <div className="space-y-1">
        <Label htmlFor="dt-name">Document Name *</Label>
        <Input
          id="dt-name"
          value={name}
          disabled={!canEdit}
          placeholder="e.g. Tax Registration Certificate"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dt-code">Code *</Label>
        <Input
          id="dt-code"
          value={code}
          disabled={!canEdit}
          placeholder="e.g. TAX_CERT, TRADE_LIC"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dt-desc">Description</Label>
        <Textarea
          id="dt-desc"
          value={description}
          disabled={!canEdit}
          maxLength={400}
          placeholder="Operational instructions for verification"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-3 border-t border-[#E6E1D8] pt-3">
        <p className="text-sm font-medium text-[#251605]">Usage</p>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="dt-required">Mandatory Requirement</Label>
          <Switch
            id="dt-required"
            checked={required}
            disabled={!canEdit}
            onCheckedChange={setRequired}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="dt-applies-company">Applies to Company</Label>
          <Switch
            id="dt-applies-company"
            checked={appliesToCompany}
            disabled={!canEdit}
            onCheckedChange={setAppliesToCompany}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="dt-applies-travel-agency">Applies to Travel Agency</Label>
          <Switch
            id="dt-applies-travel-agency"
            checked={appliesToTravelAgency}
            disabled={!canEdit}
            onCheckedChange={setAppliesToTravelAgency}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="dt-active">Active</Label>
          <Switch
            id="dt-active"
            checked={active}
            disabled={!canEdit}
            onCheckedChange={setActive}
          />
        </div>
      </div>
      <details className="rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-[#251605]">
          Advanced Settings
        </summary>
        <div className="mt-3 space-y-1">
          <Label htmlFor="dt-order">Display Order</Label>
          <Input
            id="dt-order"
            type="number"
            min={0}
            value={displayOrder}
            disabled={!canEdit}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </div>
      </details>
    </Card3OverlapSheet>
  );
}
