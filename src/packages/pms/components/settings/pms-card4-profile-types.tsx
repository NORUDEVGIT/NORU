import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Building, SlidersHorizontal, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  COMPANY_CREATION_FIELDS,
  COMPANY_BILLING_FIELDS,
  COMPANY_CONTRACT_FIELDS,
  ALL_COMPANY_CREATION_FIELDS,
  COMPANY_CREATION_CATEGORIES,
  ESSENTIAL_COMPANY_FIELD_CODES,
  GUEST_CREATION_CATEGORIES,
  TRAVEL_AGENCY_CREATION_FIELDS,
  TRAVEL_AGENCY_COMMISSION_FIELDS,
  TRAVEL_AGENCY_PAYMENT_RULES_FIELDS,
  TRAVEL_AGENCY_CREATION_CATEGORIES,
  ESSENTIAL_TRAVEL_AGENCY_FIELD_CODES,
} from "@/packages/pms/lib/guest-creation-field-definitions";
import { FIELD_ALIASES_MAP } from "@/packages/pms/lib/guest-company-create-workspace";
import { TRAVEL_AGENCY_FIELD_ALIASES_MAP } from "@/packages/pms/lib/guest-travel-agent-create-workspace";
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

function profileKind(row: { code: string; name: string }): "company" | "travel" | "guest" {
  const code = row.code.toUpperCase();
  const name = row.name.toLowerCase();
  if (code === "COM" || code === "COMPANY" || name.includes("company")) return "company";
  if (
    code === "TRA" ||
    code === "TRAVEL_AGENCY" ||
    code === "TRAVEL_AGENT" ||
    name.includes("travel agency") ||
    name.includes("travel agent")
  ) {
    return "travel";
  }
  return "guest";
}

export type ProfileTypeTabId =
  | "general"
  | "fields"
  | "documents"
  | "preferences"
  | "defaults"
  | "billing"
  | "contracts"
  | "commission"
  | "payment_rules";

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
  const allFields = useMemo(() => fieldsQuery.data?.fields ?? [], [fieldsQuery.data?.fields]);

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
  const [pendingTab, setPendingTab] = useState<ProfileTypeTabId | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTypeTabId>(initialTab);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);

  // Sheets state for catalog management & item editors
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
  const [fieldCatalogOpen, setFieldCatalogOpen] = useState(false);
  const [manageFieldsDrawerOpen, setManageFieldsDrawerOpen] = useState(false);
  const [selectedAdditionalCodes, setSelectedAdditionalCodes] = useState<Set<string>>(new Set());
  const [selectedField, setSelectedField] = useState<GuestFieldRecord | null>(null);

  const isIndividual =
    draft.code === "IND" ||
    draft.code === "INDIVIDUAL" ||
    draft.name.toLowerCase().includes("individual");

  const isCompany =
    draft.code === "COM" ||
    draft.code === "COMPANY" ||
    draft.name.toLowerCase().includes("company");

  const isTravelAgency =
    draft.code === "TRA" ||
    draft.code === "TRAVEL_AGENCY" ||
    draft.code === "TRAVEL_AGENT" ||
    draft.name.toLowerCase().includes("travel agency") ||
    draft.name.toLowerCase().includes("travel agent");

  const activeCreationFields = isCompany
    ? COMPANY_CREATION_FIELDS
    : isTravelAgency
      ? TRAVEL_AGENCY_CREATION_FIELDS
      : INDIVIDUAL_GUEST_CREATION_FIELDS;

  const essentialCodes = isCompany
    ? ESSENTIAL_COMPANY_FIELD_CODES
    : isTravelAgency
      ? ESSENTIAL_TRAVEL_AGENCY_FIELD_CODES
      : ESSENTIAL_GUEST_FIELD_CODES;

  const activeCategories = isCompany
    ? COMPANY_CREATION_CATEGORIES
    : isTravelAgency
      ? TRAVEL_AGENCY_CREATION_CATEGORIES
      : GUEST_CREATION_CATEGORIES;

  const getFieldMatch = useCallback(
    (def: { code: string }) => {
      const codeUpper = def.code.toUpperCase();
      const strippedCode = codeUpper.startsWith("COMPANY_")
        ? codeUpper.replace(/^COMPANY_/, "")
        : codeUpper.startsWith("TA_")
          ? codeUpper.replace(/^TA_/, "")
          : codeUpper.startsWith("TRAVEL_AGENCY_")
            ? codeUpper.replace(/^TRAVEL_AGENCY_/, "")
            : codeUpper;
      const candidateAliases = isTravelAgency
        ? (TRAVEL_AGENCY_FIELD_ALIASES_MAP[codeUpper] ?? [
            codeUpper,
            strippedCode,
            `TA_${strippedCode}`,
            `TRAVEL_AGENCY_${strippedCode}`,
          ])
        : (FIELD_ALIASES_MAP[codeUpper] ?? [codeUpper, strippedCode, `COMPANY_${strippedCode}`]);

      const matched =
        allFields.find((f) => f.code.toUpperCase() === codeUpper) ??
        allFields.find((f) => candidateAliases.some((a) => a.toUpperCase() === f.code.toUpperCase())) ??
        allFields.find((f) => f.code.toUpperCase() === strippedCode);

      const targetId = matched?.id ?? def.code;
      return { matched, candidateAliases, targetId };
    },
    [allFields, isTravelAgency],
  );

  useEffect(() => {
    const activeAdditional = activeCreationFields
      .filter((def) => !def.essential)
      .filter((def) => {
        const { matched } = getFieldMatch(def);
        if (matched) return matched.active !== false;
        return true;
      })
      .map((def) => def.code);

    const validCodesForCurrentType = new Set(
      activeCreationFields.map((d) => d.code.toUpperCase()),
    );

    const matchingCodes = allFields
      .filter((f) => draft.requiredFieldIds.includes(f.id))
      .map((f) => f.code.toUpperCase())
      .filter((code) => validCodesForCurrentType.has(code) && !essentialCodes.has(code));

    setSelectedAdditionalCodes(new Set([...activeAdditional, ...matchingCodes]));
  }, [selectedId, draft.code, isCompany, isIndividual, isTravelAgency, allFields, activeCreationFields, essentialCodes, draft.requiredFieldIds, getFieldMatch]);

  const isFieldRequired = useCallback(
    (def: { code: string; systemRequired?: boolean }) => {
      if (def.systemRequired) return true;
      const { matched, candidateAliases, targetId } = getFieldMatch(def);
      return Boolean(
        (targetId && draft.requiredFieldIds.includes(targetId)) ||
          (matched && draft.requiredFieldIds.includes(matched.id)) ||
          draft.requiredFieldIds.includes(def.code) ||
          candidateAliases.some((a) => draft.requiredFieldIds.includes(a)),
      );
    },
    [getFieldMatch, draft.requiredFieldIds],
  );

  const displayedFields = useMemo(() => {
    if (!isIndividual && !isCompany && !isTravelAgency) return [];
    return activeCreationFields.filter((def) => {
      if (def.essential) return true;
      return selectedAdditionalCodes.has(def.code) || isFieldRequired(def);
    });
  }, [isIndividual, isCompany, isTravelAgency, activeCreationFields, selectedAdditionalCodes, isFieldRequired]);

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
  }, [initialTab, activeTab]);

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
    const newDraft = row ? recordToDraft(row) : emptyProfileTypeDraft();
    setDraft(newDraft);
    setDirty(false);

    const rowIsCompany =
      newDraft.code === "COM" ||
      newDraft.code === "COMPANY" ||
      newDraft.name.toLowerCase().includes("company");

    const rowIsTravelAgency =
      newDraft.code === "TRA" ||
      newDraft.code === "TRAVEL_AGENCY" ||
      newDraft.code === "TRAVEL_AGENT" ||
      newDraft.name.toLowerCase().includes("travel agency") ||
      newDraft.name.toLowerCase().includes("travel agent");

    setActiveTab((currentTab) => {
      if (
        rowIsCompany &&
        (currentTab === "documents" ||
          currentTab === "preferences" ||
          currentTab === "commission" ||
          currentTab === "payment_rules")
      ) {
        return "billing";
      }
      if (
        rowIsTravelAgency &&
        (currentTab === "documents" ||
          currentTab === "preferences" ||
          currentTab === "billing" ||
          currentTab === "contracts")
      ) {
        return "commission";
      }
      if (
        !rowIsCompany &&
        !rowIsTravelAgency &&
        (currentTab === "billing" ||
          currentTab === "contracts" ||
          currentTab === "commission" ||
          currentTab === "payment_rules")
      ) {
        return "fields";
      }
      return currentTab;
    });
  }

  function requestSelect(id: string | null) {
    if (dirty) {
      setPendingSwitch(id);
      return;
    }
    const row = types.find((item) => item.id === id) ?? null;
    applyRecord(row);
  }

  function openEditor(id: string, tab: ProfileTypeTabId) {
    if (dirty && selectedId && selectedId !== id) {
      setPendingSwitch(id);
      setPendingTab(tab);
      return;
    }
    if (!dirty || selectedId === id) {
      if (selectedId !== id) {
        const row = types.find((item) => item.id === id) ?? null;
        applyRecord(row);
      }
      setActiveTab(tab);
      onTabChange?.(tab);
      setEditorOpen(true);
    }
  }

  function closeEditor() {
    if (dirty) {
      setPendingClose(true);
      return;
    }
    setEditorOpen(false);
  }

  function mark<K extends keyof ProfileTypeDraft>(key: K, value: ProfileTypeDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }


  function handleToggleRequirement(
    def: { code: string; name: string; systemRequired?: boolean },
    checked: boolean,
  ) {
    const { matched, candidateAliases, targetId } = getFieldMatch(def);
    const removeCodes = new Set(
      [
        targetId,
        def.code,
        def.code.toUpperCase(),
        matched?.id,
        ...candidateAliases,
        def.code.replace(/^COMPANY_/, ""),
        def.code.replace(/^TA_/, ""),
        def.code.replace(/^TRAVEL_AGENCY_/, ""),
      ].filter(Boolean) as string[],
    );

    let nextRequiredIds: string[];
    if (checked) {
      const toAdd = [targetId, def.code, matched?.id, ...candidateAliases].filter(Boolean) as string[];
      nextRequiredIds = Array.from(new Set([...draft.requiredFieldIds, ...toAdd]));
    } else {
      nextRequiredIds = draft.requiredFieldIds.filter((id) => !removeCodes.has(id));
    }

    mark("requiredFieldIds", nextRequiredIds);

    if (canEdit) {
      fieldFlagsMutation.mutate({
        id: matched?.id,
        code: def.code,
        profileTypeId: draft.id || undefined,
        required: checked,
        fieldName: def.name,
      });
    }
  }

  function handleTabChange(nextTab: string) {
    const tabId = nextTab as ProfileTypeTabId;
    setActiveTab(tabId);
    onTabChange?.(tabId);
  }

  const errors = validateProfileTypeDraft(draft, types);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () => {
      const validUuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const resolvedFieldIds = new Set<string>();
      for (const item of draft.requiredFieldIds) {
        if (validUuidRegex.test(item)) {
          resolvedFieldIds.add(item);
        } else {
          const itemUpper = item.toUpperCase();
          const stripped = itemUpper
            .replace(/^COMPANY_/, "")
            .replace(/^TA_/, "")
            .replace(/^TRAVEL_AGENCY_/, "");
          const candidateAliases = isTravelAgency
            ? (TRAVEL_AGENCY_FIELD_ALIASES_MAP[itemUpper] ?? [
                itemUpper,
                stripped,
                `TA_${stripped}`,
                `TRAVEL_AGENCY_${stripped}`,
              ])
            : (FIELD_ALIASES_MAP[itemUpper] ?? [itemUpper, stripped, `COMPANY_${stripped}`]);
          const matched = allFields.find((f) => {
            const fUpper = f.code.toUpperCase();
            return candidateAliases.some((a) => a.toUpperCase() === fUpper);
          });
          if (matched?.id && validUuidRegex.test(matched.id)) {
            resolvedFieldIds.add(matched.id);
          }
        }
      }

      return save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeProfileTypeCode(draft.code),
          description: draft.description,
          icon: draft.icon,
          active: draft.active,
          requiredFieldIds: Array.from(resolvedFieldIds),
          documentTypeIds: draft.documentTypeIds,
          preferenceTypeIds: draft.preferenceTypeIds,
          defaults: draft.defaults,
        },
      });
    },
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
    mutationFn: (input: {
      id?: string;
      code?: string;
      profileTypeId?: string;
      required?: boolean;
      active?: boolean;
      fieldName?: string;
    }) => {
      const { fieldName: _fieldName, ...payload } = input;
      return setFieldFlags({ data: { restaurantId, ...payload } });
    },
    onSuccess: async (result, input) => {
      if (result?.id) {
        setDraft((prev) => {
          let updated = prev.requiredFieldIds;
          if (input.required) {
            const idsToAdd = [result.id, input.code].filter(Boolean) as string[];
            updated = Array.from(new Set([...updated, ...idsToAdd]));
          } else {
            const removeSet = new Set([
              result.id,
              input.code,
              input.code?.toUpperCase(),
              input.code?.replace(/^COMPANY_/, ""),
              input.code?.replace(/^TA_/, ""),
              input.code?.replace(/^TRAVEL_AGENCY_/, ""),
            ].filter(Boolean) as string[]);
            updated = updated.filter((id) => !removeSet.has(id));
          }
          return { ...prev, requiredFieldIds: updated };
        });
      }
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-required-fields", restaurantId],
      });
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      if (input.required !== undefined) {
        toast.success(
          `${input.fieldName || "Field"} is now ${input.required ? "required" : "optional"}.`,
        );
      }
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

  return (
    <div className="space-y-3" data-testid="card4-profile-types">
      <h2 className="font-display text-lg text-[#251605]">Profile Types</h2>

      <div className="overflow-x-auto overflow-hidden rounded-xl border border-[#CCCCCC] bg-white">
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
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((row) => {
                const kind = profileKind(row);
                return (
                <TableRow
                  key={row.id}
                  className="hover:bg-[#FAF8F5]/80"
                >
                  <TableCell className="py-2 font-medium text-[#251605]">
                    {row.name}
                  </TableCell>
                  <TableCell className="py-2">{row.code}</TableCell>
                  <TableCell className="max-w-[16rem] truncate py-2 text-muted-foreground">
                    {row.description || "—"}
                  </TableCell>
                  <TableCell className="py-2">
                    <Switch
                      checked={row.active}
                      disabled={!canEdit || toggleMutation.isPending}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: row.id, active })}
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
                        <DropdownMenuItem onSelect={() => openEditor(row.id, "general")}>
                          Edit Profile Type
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openEditor(row.id, "fields")}>
                          Configure Fields
                        </DropdownMenuItem>
                        {kind === "guest" ? (
                          <>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "documents")}>
                              Identity Documents
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "preferences")}>
                              Preferences
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {kind === "company" ? (
                          <>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "billing")}>
                              Billing & Credit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "contracts")}>
                              Contracts & Agreements
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {kind === "travel" ? (
                          <>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "commission")}>
                              Commission & Rates
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEditor(row.id, "payment_rules")}>
                              Payment, Credit & Reservation Rules
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        <DropdownMenuItem onSelect={() => openEditor(row.id, "defaults")}>
                          Defaults
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          overlayClassName="bg-[#1F140A]/70"
          className={cn(
            "flex max-h-[85vh] min-h-0 w-[min(960px,calc(100vw-48px))] max-w-none sm:max-w-none",
            "flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl",
            "[&>button.absolute]:hidden",
          )}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <header className="relative shrink-0 bg-[#1F140A] px-5 py-2.5 pr-12 text-[#F3E9D8]">
            <div className="flex items-center gap-2">
              <DialogTitle className="font-display text-sm font-semibold text-white">
                {draft.name || "Profile Type"}
              </DialogTitle>
              {draft.code ? (
                <span className="rounded-full border border-[#C89933]/70 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#E8D5A8]">
                  {draft.code}
                </span>
              ) : null}
            </div>
            <DialogDescription className="sr-only">
              Configure this profile type
            </DialogDescription>
            <button
              type="button"
              className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={closeEditor}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C89933]" aria-hidden />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="general">General Information</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            {isCompany ? (
              <>
                <TabsTrigger value="billing">Billing & Credit</TabsTrigger>
                <TabsTrigger value="contracts">Contracts & Agreements</TabsTrigger>
              </>
            ) : isTravelAgency ? (
              <>
                <TabsTrigger value="commission">Commission & Rates</TabsTrigger>
                <TabsTrigger value="payment_rules">Payment, Credit & Reservation Rules</TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="documents">Identity Documents</TabsTrigger>
                <TabsTrigger value="preferences">Preferences</TabsTrigger>
              </>
            )}
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
          </TabsContent>

          {/* TAB: FIELDS */}
          <TabsContent value="fields" className="space-y-4 pt-3">
            {!isIndividual && !isCompany && !isTravelAgency ? (
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
                  Field requirements and catalog configurations in this tab apply specifically to Individual Guest, Company, and Travel Agency profiles. {draft.name || "This profile type"} operates under its dedicated account and entity structure.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure fields for {draft.name || (isTravelAgency ? "Travel Agency" : isCompany ? "Company" : "Individual Guest")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Essential fields from the {isTravelAgency ? "travel agency" : isCompany ? "company" : "guest"} creation wizard are listed by default. Select additional fields via Manage Fields and control their requirements below.
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
                        <TableHead>Required for {draft.name || (isTravelAgency ? "Travel Agency" : isCompany ? "Company" : "Individual Guest")}</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedFields.map((def) => {
                        const { matched } = getFieldMatch(def);
                        const isRequired = isFieldRequired(def);

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
                                    disabled={!canEdit || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => handleToggleRequirement(def, checked)}
                                    data-testid={`field-switch-${def.code}`}
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
                                    if (matched && canEdit) {
                                      fieldFlagsMutation.mutate({
                                        id: matched.id,
                                        active: false,
                                        required: false,
                                      });
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

          {/* TABS FOR TRAVEL AGENCY: COMMISSION & RATES, PAYMENT, CREDIT & RESERVATION RULES */}
          {isTravelAgency ? (
            <>
              {/* TAB: COMMISSION & RATES */}
              <TabsContent value="commission" className="space-y-4 pt-3" data-testid="tab-content-commission">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure commission & rates requirements for {draft.name || "Travel Agency"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Control which commercial models, commission values, and net rate parameters are mandatory when creating a travel agency profile.
                    </p>
                  </div>
                </div>

                <div className="border rounded-xl overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Required for {draft.name || "Travel Agency"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TRAVEL_AGENCY_COMMISSION_FIELDS.map((def) => {
                        const isRequired = isFieldRequired(def);

                        return (
                          <TableRow key={def.code}>
                            <TableCell className="font-medium text-[#251605]">
                              <div>
                                <span className="text-xs font-semibold">{def.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[260px]">
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
                                  <span className="italic text-[11px] font-medium text-amber-900">
                                    System required
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <Switch
                                    id={`commission-req-${def.code}`}
                                    checked={isRequired}
                                    disabled={!canEdit || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => handleToggleRequirement(def, checked)}
                                    data-testid={`commission-switch-${def.code}`}
                                  />
                                  <Label
                                    htmlFor={`commission-req-${def.code}`}
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* TAB: PAYMENT, CREDIT & RESERVATION RULES */}
              <TabsContent value="payment_rules" className="space-y-4 pt-3" data-testid="tab-content-payment-rules">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure payment, credit & reservation rules requirements for {draft.name || "Travel Agency"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Control which settlement terms, credit arrangements, and default reservation policies are mandatory when creating a travel agency profile.
                    </p>
                  </div>
                </div>

                <div className="border rounded-xl overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Required for {draft.name || "Travel Agency"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TRAVEL_AGENCY_PAYMENT_RULES_FIELDS.map((def) => {
                        const isRequired = isFieldRequired(def);

                        return (
                          <TableRow key={def.code}>
                            <TableCell className="font-medium text-[#251605]">
                              <div>
                                <span className="text-xs font-semibold">{def.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[260px]">
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
                                  <span className="italic text-[11px] font-medium text-amber-900">
                                    System required
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <Switch
                                    id={`payment-rules-req-${def.code}`}
                                    checked={isRequired}
                                    disabled={!canEdit || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => handleToggleRequirement(def, checked)}
                                    data-testid={`payment-rules-switch-${def.code}`}
                                  />
                                  <Label
                                    htmlFor={`payment-rules-req-${def.code}`}
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </>
          ) : null}

          {/* TABS FOR COMPANY: BILLING & CREDIT, CONTRACTS & AGREEMENTS */}
          {isCompany ? (
            <>
              {/* TAB: BILLING & CREDIT */}
              <TabsContent value="billing" className="space-y-4 pt-3" data-testid="tab-content-billing">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure billing & credit requirements for {draft.name || "Company"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Control which billing rules, payment timing schedules, and credit parameters are mandatory when creating a company profile.
                    </p>
                  </div>
                </div>

                <div className="border rounded-xl overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Required for {draft.name || "Company"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COMPANY_BILLING_FIELDS.map((def) => {
                        const isRequired = isFieldRequired(def);

                        return (
                          <TableRow key={def.code}>
                            <TableCell className="font-medium text-[#251605]">
                              <div>
                                <span className="text-xs font-semibold">{def.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[260px]">
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
                                  <span className="italic text-[11px] font-medium text-amber-900">
                                    System required
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <Switch
                                    id={`billing-req-${def.code}`}
                                    checked={isRequired}
                                    disabled={!canEdit || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => handleToggleRequirement(def, checked)}
                                    data-testid={`billing-switch-${def.code}`}
                                  />
                                  <Label
                                    htmlFor={`billing-req-${def.code}`}
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* TAB: CONTRACTS & AGREEMENTS */}
              <TabsContent value="contracts" className="space-y-4 pt-3" data-testid="tab-content-contracts">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <p className="text-xs font-medium text-[#251605]">
                      Configure contracts & agreements requirements for {draft.name || "Company"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Control which corporate agreement terms, validity dates, and policy options are mandatory when creating a company profile. Document upload requirements are governed by Company & Business Document Types.
                    </p>
                  </div>
                </div>

                <div className="border rounded-xl overflow-hidden bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Required for {draft.name || "Company"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COMPANY_CONTRACT_FIELDS.map((def) => {
                        const isRequired = isFieldRequired(def);

                        return (
                          <TableRow key={def.code}>
                            <TableCell className="font-medium text-[#251605]">
                              <div>
                                <span className="text-xs font-semibold">{def.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[260px]">
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
                                  <span className="italic text-[11px] font-medium text-amber-900">
                                    System required
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <Switch
                                    id={`contract-req-${def.code}`}
                                    checked={isRequired}
                                    disabled={!canEdit || fieldFlagsMutation.isPending}
                                    onCheckedChange={(checked) => handleToggleRequirement(def, checked)}
                                    data-testid={`contract-switch-${def.code}`}
                                  />
                                  <Label
                                    htmlFor={`contract-req-${def.code}`}
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
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </>
          ) : null}

          {/* TABS FOR INDIVIDUAL: IDENTITY DOCUMENTS, PREFERENCES */}
          {!isCompany && !isTravelAgency ? (
            <>
              {/* TAB: DOCUMENTS (Non-Company, Non-Travel Agency) */}
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

              {/* TAB: PREFERENCES (Non-Company) */}
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
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </>
          ) : null}

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
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#D9D2C4] bg-white px-5 py-3">
            <Button
              type="button"
              variant="outline"
              className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
              onClick={closeEditor}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
              disabled={!canSave}
              onClick={() => {
                thenNextRef.current = false;
                saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

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
        fieldDefinitions={activeCreationFields}
        categories={activeCategories}
        title={
          isTravelAgency
            ? "Manage Travel Agency Fields"
            : isCompany
              ? "Manage Company Fields"
              : "Manage Guest Fields"
        }
        description={
          isTravelAgency
            ? "Select which creation fields appear in the configuration table for Travel Agency profiles."
            : isCompany
              ? "Select which creation fields appear in the configuration table for Company profiles."
              : "Select which creation fields appear in the configuration table for Individual Guests."
        }
        onToggleCode={(code, active) => {
          setSelectedAdditionalCodes((prev) => {
            const next = new Set(prev);
            if (active) next.add(code);
            else next.delete(code);
            return next;
          });
          const { matched } = getFieldMatch({ code });
          if (!active) {
            if (matched && draft.requiredFieldIds.includes(matched.id)) {
              mark(
                "requiredFieldIds",
                draft.requiredFieldIds.filter((id) => id !== matched.id),
              );
            }
          }
          if (matched && canEdit) {
            fieldFlagsMutation.mutate({
              id: matched.id,
              active,
              required: active ? undefined : false,
            });
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
            <AlertDialogCancel
              onClick={() => {
                setPendingSwitch(null);
                setPendingTab(null);
              }}
            >
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingSwitch;
                const tab = pendingTab;
                setPendingSwitch(null);
                setPendingTab(null);
                setDirty(false);
                const row = types.find((item) => item.id === target) ?? null;
                applyRecord(row);
                if (tab) {
                  setActiveTab(tab);
                  onTabChange?.(tab);
                }
                setEditorOpen(true);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this profile type. Closing will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setDirty(false);
                const current = types.find((item) => item.id === selectedId) ?? null;
                applyRecord(current);
                setEditorOpen(false);
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

