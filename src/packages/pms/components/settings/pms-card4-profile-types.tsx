import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Building, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
import { GUEST_PROFILE_TYPES } from "@/packages/pms/lib/guest-profile-wave1";
import {
  getPmsCard4RequiredFields,
  setPmsCard4RequiredFieldFlags,
} from "@/packages/pms/lib/required-fields-card4.functions";
import { getPmsCard4IdentityDocumentTypes } from "@/packages/pms/lib/identity-documents-card4.functions";
import { getPmsCard4Preferences } from "@/packages/pms/lib/preferences-card4.functions";
import {
  deletePmsCard4ProfileType,
  getPmsCard4ProfileTypes,
  savePmsCard4ProfileType,
  setPmsCard4ProfileTypeActive,
} from "@/packages/pms/lib/profile-types-card4.functions";
import {
  PROFILE_TYPE_COMMUNICATION,
  PROFILE_TYPE_CURRENCIES,
  PROFILE_TYPE_ICONS,
  PROFILE_TYPE_LANGUAGES,
  emptyProfileTypeDraft,
  normalizeProfileTypeCode,
  type ProfileTypeDraft,
  type ProfileTypeRecord,
  validateProfileTypeDraft,
} from "@/packages/pms/lib/profile-types-card4.server";
import {
  GUEST_FIELD_TYPE_LABELS,
  type GuestFieldRecord,
} from "@/packages/pms/lib/required-fields-card4.server";
import type { IdentityDocumentTypeRecord } from "@/packages/pms/lib/identity-documents-card4.server";
import {
  PREFERENCE_VALUE_TYPE_LABELS,
  type PreferenceCategoryRecord,
  type PreferenceTypeRecord,
} from "@/packages/pms/lib/preferences-card4.server";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";
import { cn } from "@/shared/lib/utils";

import {
  GuestFieldCatalogSheet,
  GuestFieldEditorSheet,
} from "./catalog-sheets/guest-field-catalog-sheet";
import {
  IdentityDocumentCatalogSheet,
  IdentityDocumentEditorSheet,
} from "./catalog-sheets/identity-document-catalog-sheet";
import {
  PreferenceCatalogSheet,
  PreferenceTypeEditorSheet,
} from "./catalog-sheets/preference-catalog-sheet";
import {
  INDIVIDUAL_GUEST_CREATION_FIELDS,
  ESSENTIAL_GUEST_FIELD_CODES,
} from "@/packages/pms/lib/guest-creation-field-definitions";
import { ManageGuestFieldsDrawer } from "./catalog-sheets/manage-guest-fields-drawer";

function recordToDraft(row: ProfileTypeRecord): ProfileTypeDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    icon: row.icon,
    active: row.active,
    requiredFieldIds: [...row.requiredFieldIds],
    documentTypeIds: [...row.documentTypeIds],
    preferenceTypeIds: [...row.preferenceTypeIds],
    defaults: { ...row.defaults },
  };
}

function toggleId(list: string[], id: string, on: boolean): string[] {
  if (on) return list.includes(id) ? list : [...list, id];
  return list.filter((item) => item !== id);
}

export type ProfileTypeTabId = "general" | "fields" | "documents" | "preferences" | "defaults";

export function PmsCard4ProfileTypes({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
  initialTab = "general",
  onTabChange,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
  initialTab?: ProfileTypeTabId;
  onTabChange?: (tab: ProfileTypeTabId) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4ProfileTypes);
  const loadFields = useServerFn(getPmsCard4RequiredFields);
  const loadDocs = useServerFn(getPmsCard4IdentityDocumentTypes);
  const loadPrefs = useServerFn(getPmsCard4Preferences);
  const save = useServerFn(savePmsCard4ProfileType);
  const setActive = useServerFn(setPmsCard4ProfileTypeActive);
  const remove = useServerFn(deletePmsCard4ProfileType);
  const setFieldFlags = useServerFn(setPmsCard4RequiredFieldFlags);

  const queryKey = ["pms-card4-profile-types", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const fieldsQuery = useQuery({
    queryKey: ["pms-card4-required-fields", restaurantId],
    queryFn: () => loadFields({ data: { restaurantId } }),
    retry: false,
  });
  const allFields = fieldsQuery.data?.fields ?? [];

  const docsQuery = useQuery({
    queryKey: ["pms-card4-identity-documents", restaurantId],
    queryFn: () => loadDocs({ data: { restaurantId } }),
    retry: false,
  });
  const allDocs = docsQuery.data?.documentTypes ?? [];

  const prefsQuery = useQuery({
    queryKey: ["pms-card4-preferences", restaurantId],
    queryFn: () => loadPrefs({ data: { restaurantId } }),
    retry: false,
  });
  const categories = prefsQuery.data?.categories ?? [];
  const allPrefs = prefsQuery.data?.types ?? [];

  const types = query.data?.types ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileTypeDraft>(emptyProfileTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProfileTypeRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTypeTabId>(initialTab);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  // Sheets state for catalog management & item editors
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
  const [fieldCatalogOpen, setFieldCatalogOpen] = useState(false);
  const [manageFieldsDrawerOpen, setManageFieldsDrawerOpen] = useState(false);
  const [selectedAdditionalCodes, setSelectedAdditionalCodes] = useState<Set<string>>(new Set());
  const [selectedField, setSelectedField] = useState<GuestFieldRecord | null>(null);

  useEffect(() => {
    const matchingCodes = allFields
      .filter((f) => draft.requiredFieldIds.includes(f.id) || f.required)
      .map((f) => f.code.toUpperCase())
      .filter((code) => !ESSENTIAL_GUEST_FIELD_CODES.has(code));
    if (matchingCodes.length > 0) {
      setSelectedAdditionalCodes((prev) => new Set([...prev, ...matchingCodes]));
    }
  }, [draft.requiredFieldIds, allFields]);

  const isIndividual =
    draft.code === "IND" ||
    draft.code === "INDIVIDUAL" ||
    draft.name.toLowerCase().includes("individual");

  const displayedFields = useMemo(() => {
    if (!isIndividual) return [];
    return INDIVIDUAL_GUEST_CREATION_FIELDS.filter((def) => {
      if (def.essential) return true;
      const matched = allFields.find((f) => f.code.toUpperCase() === def.code.toUpperCase());
      const isRequiredInDraft = Boolean(
        matched && (draft.requiredFieldIds.includes(matched.id) || matched.required),
      );
      return selectedAdditionalCodes.has(def.code) || isRequiredInDraft;
    });
  }, [isIndividual, allFields, draft.requiredFieldIds, selectedAdditionalCodes]);

  const [docEditorOpen, setDocEditorOpen] = useState(false);
  const [docCatalogOpen, setDocCatalogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<IdentityDocumentTypeRecord | null>(null);

  const [prefEditorOpen, setPrefEditorOpen] = useState(false);
  const [prefCatalogOpen, setPrefCatalogOpen] = useState(false);
  const [selectedPref, setSelectedPref] = useState<PreferenceTypeRecord | null>(null);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!query.data) return;
    if (selectedId && query.data.types.some((row) => row.id === selectedId)) {
      if (!dirty) {
        const cur = query.data.types.find((row) => row.id === selectedId);
        if (cur) setDraft(recordToDraft(cur));
      }
      return;
    }
    const first = query.data.types[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? recordToDraft(first) : emptyProfileTypeDraft());
    setDirty(false);
  }, [query.data, selectedId, dirty]);

  function applyRecord(row: ProfileTypeRecord | null) {
    setSelectedId(row?.id ?? null);
    setDraft(row ? recordToDraft(row) : emptyProfileTypeDraft());
    setDirty(false);
  }

  function requestSelect(id: string | null) {
    if (dirty) {
      setPendingSwitch(id);
      return;
    }
    const row = types.find((item) => item.id === id) ?? null;
    applyRecord(row);
  }

  function mark<K extends keyof ProfileTypeDraft>(key: K, value: ProfileTypeDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleTabChange(nextTab: string) {
    const tabId = nextTab as ProfileTypeTabId;
    setActiveTab(tabId);
    onTabChange?.(tabId);
  }

  const errors = validateProfileTypeDraft(draft, types);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeProfileTypeCode(draft.code),
          description: draft.description,
          icon: draft.icon,
          active: draft.active,
          requiredFieldIds: draft.requiredFieldIds,
          documentTypeIds: draft.documentTypeIds,
          preferenceTypeIds: draft.preferenceTypeIds,
          defaults: draft.defaults,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-identity-documents", restaurantId],
      });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      if (result.type) applyRecord(result.type);
      toast.success("Profile type saved successfully.");
      onSaved(thenNextRef.current);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save profile type."),
  });

  const fieldFlagsMutation = useMutation({
    mutationFn: (input: { id: string; required?: boolean }) =>
      setFieldFlags({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-required-fields", restaurantId],
      });
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
    },
    onError: (err: Error) => toast.error(err.message || "Unable to update field requirement."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      if (draft.id === input.id) mark("active", input.active);
      toast.success(input.active ? "Profile type activated." : "Profile type deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSave = canEdit && errors.length === 0 && !saveMutation.isPending;
  useEffect(() => {
    onSavingChange(saveMutation.isPending, canSave);
  }, [saveMutation.isPending, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (errors.length > 0 || !canEdit || saveMutation.isPending) {
      toast.error(errors[0]?.message ?? "Fix the profile type before saving.");
      return;
    }
    saveMutation.mutate();
  }, [saveRequest, canEdit, errors, saveMutation]);

  const configuredCount = types.length;
  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-profile-types">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Profile Types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile types are system-defined. Configure which supported profile types are active and which fields, documents, preferences, and defaults apply to each.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading profile types…</p>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load profile types.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile Type</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-[#FAF8F5]/80",
                    row.id === selectedId && "bg-[#F7F4EE]/60",
                  )}
                  onClick={() => requestSelect(row.id)}
                >
                  <TableCell className="font-medium text-[#251605]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestSelect(row.id);
                      }}
                      className="text-left hover:underline font-medium"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell className="max-w-md text-muted-foreground truncate">
                    {row.description || "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={row.active}
                      disabled={!canEdit || toggleMutation.isPending}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: row.id, active })}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => requestSelect(row.id)}>
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[#251605]">Profile Type Details</h3>
            <p className="text-xs text-muted-foreground">Last updated {lastUpdated}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Profile Type</Label>
            <Select
              value={draft.id ?? (types[0]?.id ?? "")}
              onValueChange={(value) => requestSelect(value)}
            >
              <SelectTrigger className="w-[16rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name} ({row.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="general">General Information</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="documents">Identity Documents</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
          </TabsList>

          {/* TAB: GENERAL */}
          <TabsContent value="general" className="space-y-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pt-name">Name *</Label>
                <Input
                  id="pt-name"
                  value={draft.name}
                  disabled={!canEdit}
                  onChange={(event) => mark("name", event.target.value)}
                />
                {errorFor("name") ? (
                  <p className="text-xs text-destructive">{errorFor("name")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pt-code">Code *</Label>
                <Input
                  id="pt-code"
                  value={draft.code}
                  disabled={true}
                  className="bg-muted text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">Canonical system code cannot be changed.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-description">Description</Label>
              <Textarea
                id="pt-description"
                value={draft.description}
                disabled={!canEdit}
                maxLength={400}
                onChange={(event) => mark("description", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{draft.description.length}/400</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="pt-active">Active</Label>
              <Switch
                id="pt-active"
                checked={draft.active}
                disabled={!canEdit}
                onCheckedChange={(active) => mark("active", active)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <Select
                value={draft.icon}
                onValueChange={(value) => mark("icon", value as ProfileTypeDraft["icon"])}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFILE_TYPE_ICONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* TAB: FIELDS */}
          <TabsContent value="fields" className="space-y-4 pt-3">
            {!isIndividual ? (
              <div
                className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF8F5] p-8 text-center"
                data-testid="non-individual-fields-notice"
              >
                <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#EFE8DC] text-[#756A5B]">
                  <Building className="size-5" />
                </div>
                <h4 className="mt-3 font-display text-base font-semibold text-[#251605]">
                  No Individual Guest Fields
                </h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                  Field requirements and catalog configurations in this tab apply specifically to Individual Guest profiles. {draft.name || "This profile type"} operates under its dedicated account and entity structure.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure fields for {draft.name || "Individual Guest"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Essential fields from the guest creation wizard are listed by default. Select additional fields via Manage Fields and control their requirements below.
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 border-[#DDD4C5]"
                        onClick={() => setManageFieldsDrawerOpen(true)}
                        data-testid="manage-fields-btn"
                      >
                        <SlidersHorizontal className="mr-1.5 size-3" /> Manage Fields
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-[#756A5B]"
                        onClick={() => setFieldCatalogOpen(true)}
                      >
                        Field Catalog
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="border rounded-xl overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Required for {draft.name || "Individual Guest"}</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedFields.map((def) => {
                        const matched = allFields.find(
                          (f) => f.code.toUpperCase() === def.code.toUpperCase(),
                        );
                        const isRequired =
                          def.systemRequired ||
                          Boolean(matched && draft.requiredFieldIds.includes(matched.id));

                        return (
                          <TableRow key={def.code}>
                            <TableCell className="font-medium text-[#251605]">
                              <div>
                                <span className="text-xs font-semibold">{def.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                                  {def.description}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-[11px] text-[#756A5B] font-medium">
                                {def.categoryLabel}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {GUEST_FIELD_TYPE_LABELS[def.fieldType]}
                            </TableCell>
                            <TableCell>
                              {def.essential ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Essential
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-muted-foreground bg-[#FAF8F5] border border-[#DDD4C5] px-1.5 py-0.5 rounded">
                                  Additional
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {def.systemRequired ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Switch checked={true} disabled={true} />
                                  <span className="italic text-[11px] font-medium text-amber-900">System required</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <Switch
                                    id={`field-req-${def.code}`}
                                    checked={isRequired}
                                    disabled={!canEdit || !matched || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => {
                                      if (!matched) return;
                                      const nextRequiredIds = toggleId(
                                        draft.requiredFieldIds,
                                        matched.id,
                                        checked === true,
                                      );
                                      mark("requiredFieldIds", nextRequiredIds);
                                      fieldFlagsMutation.mutate({
                                        id: matched.id,
                                        required: checked,
                                      });
                                    }}
                                  />
                                  <Label
                                    htmlFor={`field-req-${def.code}`}
                                    className={cn(
                                      "text-xs cursor-pointer font-medium select-none",
                                      isRequired ? "text-[#C89933] font-semibold" : "text-muted-foreground",
                                    )}
                                  >
                                    {isRequired ? "Required" : "Optional"}
                                  </Label>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {!def.essential && canEdit ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground hover:text-destructive px-2"
                                  onClick={() => {
                                    setSelectedAdditionalCodes((prev) => {
                                      const next = new Set(prev);
                                      next.delete(def.code);
                                      return next;
                                    });
                                    if (matched && draft.requiredFieldIds.includes(matched.id)) {
                                      mark(
                                        "requiredFieldIds",
                                        draft.requiredFieldIds.filter((id) => id !== matched.id),
                                      );
                                    }
                                  }}
                                  title="Remove from listed fields"
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB: DOCUMENTS */}
          <TabsContent value="documents" className="space-y-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <p className="text-xs font-medium text-[#251605]">
                  Configure identity documents accepted for {draft.name || "this profile type"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Select which document types guests of this profile type are allowed to present.
                </p>
              </div>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setDocCatalogOpen(true)}
                  >
                    Manage Document Catalog
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#C89933] text-[#251605] text-xs h-7"
                    onClick={() => {
                      setSelectedDoc(null);
                      setDocEditorOpen(true);
                    }}
                  >
                    <Plus className="mr-1 size-3" /> Add Document Type
                  </Button>
                </div>
              ) : null}
            </div>

            {allDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No identity document types configured yet. Use "+ Add Document Type" above to create one.
              </p>
            ) : (
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Check-in Required</TableHead>
                      <TableHead>Applicable to {draft.name || "Type"}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allDocs.map((doc) => (
                      <TableRow
                        key={doc.id}
                        className={cn(!doc.active && "opacity-70 bg-muted/20")}
                      >
                        <TableCell className="font-medium text-[#251605]">
                          <div className="flex items-center gap-2">
                            <span>{doc.name}</span>
                            {!doc.active ? (
                              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                                Inactive
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{doc.code}</TableCell>
                        <TableCell className="text-xs">
                          {doc.requiredAtCheckIn ? "Yes" : "No"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`doc-${doc.id}`}
                              checked={draft.documentTypeIds.includes(doc.id)}
                              disabled={!canEdit}
                              onCheckedChange={(checked) =>
                                mark(
                                  "documentTypeIds",
                                  toggleId(draft.documentTypeIds, doc.id, checked === true),
                                )
                              }
                            />
                            <Label htmlFor={`doc-${doc.id}`} className="text-xs cursor-pointer font-normal">
                              Accepted for {draft.name}
                            </Label>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canEdit ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                setSelectedDoc(doc);
                                setDocEditorOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* TAB: PREFERENCES */}
          <TabsContent value="preferences" className="space-y-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <p className="text-xs font-medium text-[#251605]">
                  Configure guest preferences applicable to {draft.name || "this profile type"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Select which preference categories and types apply to this profile type.
                </p>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      mark(
                        "preferenceTypeIds",
                        allPrefs.filter((p) => p.active).map((p) => p.id),
                      )
                    }
                  >
                    Select All Active
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => mark("preferenceTypeIds", [])}
                  >
                    Deselect All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setPrefCatalogOpen(true)}
                  >
                    Manage Preference Catalog
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#C89933] text-[#251605] text-xs h-7"
                    onClick={() => {
                      setSelectedPref(null);
                      setPrefEditorOpen(true);
                    }}
                  >
                    <Plus className="mr-1 size-3" /> Add Preference
                  </Button>
                </div>
              ) : null}
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No preference categories configured yet. Use "+ Add Preference" or "Manage Preference Catalog" above to set them up.
              </p>
            ) : (
              <div className="space-y-3">
                {categories.map((cat) => {
                  const catTypes = allPrefs.filter((p) => p.categoryId === cat.id);
                  return (
                    <div key={cat.id} className="border rounded-xl p-3.5 bg-white space-y-2">
                      <div className="font-semibold text-xs text-[#251605] flex items-center justify-between border-b pb-1.5">
                        <div className="flex items-center gap-2">
                          <span>{cat.name} ({cat.code})</span>
                          {!cat.active ? (
                            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                              Inactive Category
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-muted-foreground font-normal">
                          {catTypes.length} type{catTypes.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {catTypes.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                          No preference types in this category.
                        </p>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-2 pt-1">
                          {catTypes.map((pref) => {
                            const isChecked =
                              draft.preferenceTypeIds.length === 0
                                ? pref.active
                                : draft.preferenceTypeIds.includes(pref.id);
                            return (
                              <div
                                key={pref.id}
                                className={cn(
                                  "flex items-center justify-between border rounded-lg p-2 text-xs",
                                  !pref.active && "opacity-70 bg-muted/20",
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Checkbox
                                    id={`pref-${pref.id}`}
                                    checked={isChecked}
                                    disabled={!canEdit}
                                    onCheckedChange={(checked) => {
                                      const baseList =
                                        draft.preferenceTypeIds.length === 0
                                          ? allPrefs.filter((p) => p.active).map((p) => p.id)
                                          : draft.preferenceTypeIds;
                                      mark(
                                        "preferenceTypeIds",
                                        toggleId(baseList, pref.id, checked === true),
                                      );
                                    }}
                                  />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <Label htmlFor={`pref-${pref.id}`} className="font-medium cursor-pointer truncate block">
                                      {pref.name}
                                    </Label>
                                    {!pref.active ? (
                                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground">
                                        Inactive
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground block truncate">
                                    {PREFERENCE_VALUE_TYPE_LABELS[pref.valueType]}
                                  </span>
                                </div>
                              </div>
                              {canEdit ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs ml-1"
                                  onClick={() => {
                                    setSelectedPref(pref);
                                    setPrefEditorOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB: DEFAULTS */}
          <TabsContent value="defaults" className="grid gap-3 sm:grid-cols-2 pt-3">
            <DefaultSelect
              label="Default Country"
              value={draft.defaults.countryId}
              disabled={!canEdit}
              options={ISO_COUNTRIES.map((row) => ({ id: row.code, label: row.name }))}
              onChange={(countryId) => mark("defaults", { ...draft.defaults, countryId })}
            />
            <DefaultSelect
              label="Default Language"
              value={draft.defaults.languageId}
              disabled={!canEdit}
              options={PROFILE_TYPE_LANGUAGES.map((row) => ({ id: row.id, label: row.label }))}
              onChange={(languageId) => mark("defaults", { ...draft.defaults, languageId })}
            />
            <DefaultSelect
              label="Default Currency"
              value={draft.defaults.currencyId}
              disabled={!canEdit}
              options={PROFILE_TYPE_CURRENCIES.map((row) => ({ id: row.id, label: row.label }))}
              onChange={(currencyId) => mark("defaults", { ...draft.defaults, currencyId })}
            />
            <DefaultSelect
              label="Default Communication"
              value={draft.defaults.communicationChannelId}
              disabled={!canEdit}
              options={PROFILE_TYPE_COMMUNICATION.map((row) => ({ id: row.id, label: row.label }))}
              onChange={(communicationChannelId) =>
                mark("defaults", { ...draft.defaults, communicationChannelId })
              }
            />
            <DefaultSelect
              label="Default Guest Type"
              value={draft.defaults.guestTypeId}
              disabled={!canEdit}
              options={GUEST_PROFILE_TYPES.map((row) => ({ id: row.id, label: row.label }))}
              onChange={(guestTypeId) => mark("defaults", { ...draft.defaults, guestTypeId })}
            />
          </TabsContent>
        </Tabs>
      </section>

      {/* Reusable Catalog Sheets */}
      <GuestFieldEditorSheet
        open={fieldEditorOpen}
        onOpenChange={setFieldEditorOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
        field={selectedField}
        onSaved={async () => {
          await fieldsQuery.refetch();
        }}
      />
      <GuestFieldCatalogSheet
        open={fieldCatalogOpen}
        onOpenChange={setFieldCatalogOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
      />
      <ManageGuestFieldsDrawer
        open={manageFieldsDrawerOpen}
        onOpenChange={setManageFieldsDrawerOpen}
        canEdit={canEdit}
        allFields={allFields}
        selectedCodes={selectedAdditionalCodes}
        onToggleCode={(code, active) => {
          setSelectedAdditionalCodes((prev) => {
            const next = new Set(prev);
            if (active) next.add(code);
            else next.delete(code);
            return next;
          });
          if (!active) {
            const matched = allFields.find((f) => f.code.toUpperCase() === code.toUpperCase());
            if (matched && draft.requiredFieldIds.includes(matched.id)) {
              mark(
                "requiredFieldIds",
                draft.requiredFieldIds.filter((id) => id !== matched.id),
              );
            }
          }
        }}
      />

      <IdentityDocumentEditorSheet
        open={docEditorOpen}
        onOpenChange={setDocEditorOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
        documentType={selectedDoc}
        onSaved={async () => {
          await docsQuery.refetch();
        }}
      />
      <IdentityDocumentCatalogSheet
        open={docCatalogOpen}
        onOpenChange={setDocCatalogOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
      />

      <PreferenceTypeEditorSheet
        open={prefEditorOpen}
        onOpenChange={setPrefEditorOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
        preferenceType={selectedPref}
        onSaved={async () => {
          await prefsQuery.refetch();
        }}
      />
      <PreferenceCatalogSheet
        open={prefCatalogOpen}
        onOpenChange={setPrefCatalogOpen}
        restaurantId={restaurantId}
        canEdit={canEdit}
      />

      <p className="sr-only">
        Profile Types {configuredCount} of {Math.max(configuredCount, 4)} configured
      </p>

      <AlertDialog
        open={Boolean(pendingSwitch)}
        onOpenChange={(open) => !open && setPendingSwitch(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this profile type. Switching will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                setDirty(false);
                const row = types.find((item) => item.id === target) ?? null;
                applyRecord(row);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DefaultSelect({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  options: readonly { id: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? "none"}
        disabled={disabled}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {options.map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function Card4ProfileTypesGuide({ count }: { count: number }) {
  const target = Math.max(count, 4);
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Profile Types Guide</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Configure field rules, identity documents, and preferences directly under each profile type.</li>
        <li>Manage the underlying catalogs using the inline "Manage Catalog" actions when needed.</li>
        <li>Individual, Company, Travel Agency, and Group profile types share a consolidated workspace.</li>
      </ul>
      <p className="mt-3 text-sm text-[#251605]">
        {count} of {target} canonical profile types configured
      </p>
    </section>
  );
}
