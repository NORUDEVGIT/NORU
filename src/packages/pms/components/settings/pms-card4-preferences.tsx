import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
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
import { cn } from "@/shared/lib/utils";
import {
  deletePmsCard4PreferenceType,
  getPmsCard4Preferences,
  savePmsCard4PreferenceCategory,
  savePmsCard4PreferenceType,
  setPmsCard4PreferenceCategoryActive,
  setPmsCard4PreferenceTypeFlags,
} from "@/packages/pms/lib/preferences-card4.functions";
import {
  PREFERENCE_VALUE_TYPE_LABELS,
  PREFERENCE_VALUE_TYPES,
  codeFromPreferenceName,
  emptyPreferenceCategoryDraft,
  emptyPreferenceOption,
  emptyPreferenceTypeDraft,
  normalizePreferenceCode,
  preferenceFlagsForActiveChange,
  preferencesConfigured,
  validatePreferenceCategoryDraft,
  validatePreferenceTypeDraft,
  type PreferenceCategoryDraft,
  type PreferenceCategoryRecord,
  type PreferenceTypeDraft,
  type PreferenceTypeRecord,
  type PreferenceValueType,
} from "@/packages/pms/lib/preferences-card4.server";

function categoryToDraft(row: PreferenceCategoryRecord): PreferenceCategoryDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    active: row.active,
    displayOrder: row.displayOrder,
  };
}

function typeToDraft(row: PreferenceTypeRecord): PreferenceTypeDraft {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    code: row.code,
    valueType: row.valueType,
    options: row.options.map((option) => ({ ...option })),
    required: row.required,
    active: row.active,
    displayOrder: row.displayOrder,
  };
}

export function PmsCard4Preferences({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4Preferences);
  const saveCategory = useServerFn(savePmsCard4PreferenceCategory);
  const saveType = useServerFn(savePmsCard4PreferenceType);
  const setCategoryActive = useServerFn(setPmsCard4PreferenceCategoryActive);
  const setTypeFlags = useServerFn(setPmsCard4PreferenceTypeFlags);
  const removeType = useServerFn(deletePmsCard4PreferenceType);
  const queryKey = ["pms-card4-preferences", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const categories = query.data?.categories ?? [];
  const types = query.data?.types ?? [];
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const selectedCategory =
    categories.find((row) => row.id === selectedCategoryId) ?? categories[0] ?? null;
  const categoryTypes = types
    .filter((row) => row.categoryId === selectedCategory?.id)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<PreferenceCategoryDraft>(
    emptyPreferenceCategoryDraft(),
  );
  const [typeDraft, setTypeDraft] = useState<PreferenceTypeDraft>(emptyPreferenceTypeDraft(""));
  const [categoryCodeTouched, setCategoryCodeTouched] = useState(false);
  const [typeCodeTouched, setTypeCodeTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState<"category" | "type" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PreferenceTypeRecord | null>(null);
  const handledSaveToken = useRef(0);

  const categoryErrors = validatePreferenceCategoryDraft(categoryDraft, categories);
  const typeErrors = validatePreferenceTypeDraft(
    typeDraft,
    types,
    categories.map((row) => row.id),
  );
  const errorFor = (errors: typeof categoryErrors, field: string) =>
    errors.find((row) => row.field === field)?.message ?? null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["pms-card4-profile-types", restaurantId] }),
    ]);
  };

  const categoryMutation = useMutation({
    mutationFn: () =>
      saveCategory({
        data: {
          restaurantId,
          ...(categoryDraft.id ? { id: categoryDraft.id } : {}),
          name: categoryDraft.name,
          code: normalizePreferenceCode(categoryDraft.code),
          description: categoryDraft.description,
          active: categoryDraft.active,
          displayOrder: categoryDraft.displayOrder,
        },
      }),
    onSuccess: async (result) => {
      await invalidate();
      if (result.id) setSelectedCategoryId(result.id);
      setCategoryOpen(false);
      setDirty(false);
      toast.success("Preference saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save preference configuration."),
  });

  const typeMutation = useMutation({
    mutationFn: () =>
      saveType({
        data: {
          restaurantId,
          ...(typeDraft.id ? { id: typeDraft.id } : {}),
          categoryId: typeDraft.categoryId,
          name: typeDraft.name,
          code: normalizePreferenceCode(typeDraft.code),
          valueType: typeDraft.valueType,
          options: typeDraft.options,
          required: typeDraft.required,
          active: typeDraft.active,
          displayOrder: typeDraft.displayOrder,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setTypeOpen(false);
      setDirty(false);
      toast.success("Preference saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save preference configuration."),
  });

  const categoryActiveMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setCategoryActive({ data: { restaurantId, ...input } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const typeFlagsMutation = useMutation({
    mutationFn: (input: { id: string; required?: boolean; active?: boolean }) =>
      setTypeFlags({ data: { restaurantId, ...input } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeType({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
      toast.success("Preference type deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    categoryMutation.isPending ||
    typeMutation.isPending ||
    categoryActiveMutation.isPending ||
    typeFlagsMutation.isPending;
  const configured = preferencesConfigured(categories, types);
  const editorValid =
    (!categoryOpen || categoryErrors.length === 0) && (!typeOpen || typeErrors.length === 0);

  useEffect(() => {
    onSavingChange(busy, canEdit && !busy && editorValid && !query.isLoading && !query.isError);
  }, [busy, canEdit, editorValid, onSavingChange, query.isError, query.isLoading]);

  useEffect(() => {
    if (selectedCategoryId) return;
    const firstId = query.data?.categories[0]?.id;
    if (firstId) setSelectedCategoryId(firstId);
  }, [query.data, selectedCategoryId]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    if (!canEdit || query.isError || !configured) {
      toast.error("Configure at least one active preference type in each active category.");
      return;
    }
    toast.success("Preference configuration saved successfully.");
    onSaved(saveRequest.thenNext);
  }, [canEdit, configured, onSaved, query.isError, saveRequest]);

  function openCreateCategory() {
    setCategoryDraft(emptyPreferenceCategoryDraft(categories.length + 1));
    setCategoryCodeTouched(false);
    setDirty(false);
    setCategoryOpen(true);
  }

  function openEditCategory(row: PreferenceCategoryRecord) {
    setCategoryDraft(categoryToDraft(row));
    setCategoryCodeTouched(true);
    setDirty(false);
    setCategoryOpen(true);
  }

  function openCreateType() {
    if (!selectedCategory) return;
    setTypeDraft(emptyPreferenceTypeDraft(selectedCategory.id, categoryTypes.length + 1));
    setTypeCodeTouched(false);
    setDirty(false);
    setTypeOpen(true);
  }

  function openEditType(row: PreferenceTypeRecord) {
    setTypeDraft(typeToDraft(row));
    setTypeCodeTouched(true);
    setDirty(false);
    setTypeOpen(true);
  }

  function markCategory<K extends keyof PreferenceCategoryDraft>(
    key: K,
    value: PreferenceCategoryDraft[K],
  ) {
    setCategoryDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "name" && !categoryCodeTouched) {
        next.code = codeFromPreferenceName(String(value));
      }
      return next;
    });
    setDirty(true);
  }

  function markType<K extends keyof PreferenceTypeDraft>(key: K, value: PreferenceTypeDraft[K]) {
    setTypeDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "name" && !typeCodeTouched) next.code = codeFromPreferenceName(String(value));
      if (key === "active") {
        const flags = preferenceFlagsForActiveChange(Boolean(value), previous.required);
        next.required = flags.required;
      }
      return next;
    });
    setDirty(true);
  }

  function requestClose(kind: "category" | "type") {
    if (dirty) setPendingClose(kind);
    else if (kind === "category") setCategoryOpen(false);
    else setTypeOpen(false);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";
  const exampleBed = types.find((row) => row.code === "BED_TYPE");
  const exampleOptions = (exampleBed?.options ?? [])
    .filter((row) => row.active)
    .map((row) => row.label)
    .join(", ");

  return (
    <div className="space-y-5" data-testid="card4-preferences">
      <div>
        <h2 className="font-display text-2xl text-[#251605]">Guest Profile Rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the types of preferences you want to collect from your guests.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm text-destructive">Unable to load preference categories.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <section className="rounded-2xl border border-[#CCCCCC] bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-[#251605]">Preference Categories</h3>
              {canEdit ? (
                <Button type="button" size="sm" variant="outline" onClick={openCreateCategory}>
                  <Plus className="mr-1 size-3" /> Add
                </Button>
              ) : null}
            </div>
            {categories.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-sm text-[#251605]">No preference categories configured.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a category to start defining guest preferences.
                </p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-3 bg-[#C89933] text-[#251605]"
                    onClick={openCreateCategory}
                  >
                    + Add Preference Category
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-1">
                {categories.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(row.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm",
                        selectedCategory?.id === row.id
                          ? "bg-[#C89933]/15 text-[#251605]"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span>{row.name}</span>
                      {!row.active ? <span className="text-xs">Off</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && selectedCategory ? (
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEditCategory(selectedCategory)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    categoryActiveMutation.mutate({
                      id: selectedCategory.id,
                      active: !selectedCategory.active,
                    })
                  }
                >
                  {selectedCategory.active ? "Disable" : "Enable"}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h3 className="font-medium text-[#251605]">
                {selectedCategory?.name ?? "Preference types"}
              </h3>
              {canEdit && selectedCategory ? (
                <Button
                  type="button"
                  onClick={openCreateType}
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                >
                  <Plus className="mr-1 size-4" /> Add Preference Type
                </Button>
              ) : null}
            </div>
            {!selectedCategory ? (
              <p className="p-6 text-sm text-muted-foreground">Select a category.</p>
            ) : categoryTypes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-medium text-[#251605]">No preference types configured.</p>
                {canEdit ? (
                  <Button
                    type="button"
                    className="mt-4 bg-[#C89933] text-[#251605]"
                    onClick={openCreateType}
                  >
                    + Add Preference Type
                  </Button>
                ) : null}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Preference Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Values / Options</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryTypes.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm">
                        {row.options
                          .filter((option) => option.active)
                          .map((option) => option.label)
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.required}
                          disabled={!canEdit || !row.active || typeFlagsMutation.isPending}
                          onCheckedChange={(required) =>
                            typeFlagsMutation.mutate({ id: row.id, required })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.active}
                          disabled={!canEdit || typeFlagsMutation.isPending}
                          onCheckedChange={(active) =>
                            typeFlagsMutation.mutate({ id: row.id, active })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEditType(row)}>
                              Edit
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  typeFlagsMutation.mutate({ id: row.id, active: !row.active })
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4">
        <p className="text-sm font-medium text-[#251605]">Example</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A guest may have preferences such as{" "}
          {categories.map((row) => row.name).join(", ") ||
            "Room Preference, Communication, Service, Dietary"}
          {exampleOptions ? `. Bed Type options: ${exampleOptions}.` : "."}
        </p>
      </section>

      <Sheet open={categoryOpen} onOpenChange={(open) => !open && requestClose("category")}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {categoryDraft.id ? "Edit Preference Category" : "Add Preference Category"}
            </SheetTitle>
            <SheetDescription>Categories group preference types on this page.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-3 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || categoryErrors.length > 0) {
                toast.error(categoryErrors[0]?.message ?? "Fix the category before saving.");
                return;
              }
              categoryMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="pref-cat-name">Category Name *</Label>
              <Input
                id="pref-cat-name"
                value={categoryDraft.name}
                disabled={!canEdit}
                onChange={(event) => markCategory("name", event.target.value)}
              />
              {errorFor(categoryErrors, "name") ? (
                <p className="text-xs text-destructive">{errorFor(categoryErrors, "name")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pref-cat-code">Code *</Label>
              <Input
                id="pref-cat-code"
                value={categoryDraft.code}
                disabled={!canEdit}
                onChange={(event) => {
                  setCategoryCodeTouched(true);
                  markCategory("code", normalizePreferenceCode(event.target.value));
                }}
              />
              {errorFor(categoryErrors, "code") ? (
                <p className="text-xs text-destructive">{errorFor(categoryErrors, "code")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pref-cat-description">Description</Label>
              <Textarea
                id="pref-cat-description"
                value={categoryDraft.description}
                maxLength={400}
                disabled={!canEdit}
                onChange={(event) => markCategory("description", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {categoryDraft.description.length}/400
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <Label htmlFor="pref-cat-active">Active</Label>
              <Switch
                id="pref-cat-active"
                checked={categoryDraft.active}
                disabled={!canEdit}
                onCheckedChange={(active) => markCategory("active", active)}
              />
            </div>
            {canEdit ? (
              <Button
                type="submit"
                disabled={categoryMutation.isPending}
                className="w-full bg-[#C89933] text-[#251605]"
              >
                {categoryMutation.isPending ? "Saving…" : "Save Preference"}
              </Button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={typeOpen} onOpenChange={(open) => !open && requestClose("type")}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{typeDraft.id ? "Edit Preference Type" : "Add Preference Type"}</SheetTitle>
            <SheetDescription>
              {selectedCategory
                ? `This type belongs to ${selectedCategory.name}.`
                : "Preference type configuration."}
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-3 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || typeErrors.length > 0) {
                toast.error(typeErrors[0]?.message ?? "Fix the preference type before saving.");
                return;
              }
              typeMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="pref-type-name">Preference Type Name *</Label>
              <Input
                id="pref-type-name"
                value={typeDraft.name}
                disabled={!canEdit}
                onChange={(event) => markType("name", event.target.value)}
              />
              {errorFor(typeErrors, "name") ? (
                <p className="text-xs text-destructive">{errorFor(typeErrors, "name")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pref-type-code">Code *</Label>
              <Input
                id="pref-type-code"
                value={typeDraft.code}
                disabled={!canEdit}
                onChange={(event) => {
                  setTypeCodeTouched(true);
                  markType("code", normalizePreferenceCode(event.target.value));
                }}
              />
              {errorFor(typeErrors, "code") ? (
                <p className="text-xs text-destructive">{errorFor(typeErrors, "code")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Value Type *</Label>
              <Select
                value={typeDraft.valueType}
                disabled={!canEdit}
                onValueChange={(value) => markType("valueType", value as PreferenceValueType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREFERENCE_VALUE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PREFERENCE_VALUE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Options / Values *</Label>
              <div className="flex flex-wrap gap-2">
                {typeDraft.options.map((option, index) => (
                  <span
                    key={option.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                  >
                    <Input
                      className="h-6 w-24 border-0 p-0 text-xs shadow-none"
                      value={option.label}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const next = [...typeDraft.options];
                        next[index] = {
                          ...option,
                          label: event.target.value,
                          value: option.value || event.target.value,
                        };
                        markType("options", next);
                      }}
                    />
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label={`Remove ${option.label || "option"}`}
                        onClick={() =>
                          markType(
                            "options",
                            typeDraft.options.filter((_, i) => i !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    markType("options", [
                      ...typeDraft.options,
                      emptyPreferenceOption(typeDraft.options.length),
                    ])
                  }
                >
                  + Add Option
                </Button>
              ) : null}
              {errorFor(typeErrors, "options") ? (
                <p className="text-xs text-destructive">{errorFor(typeErrors, "options")}</p>
              ) : null}
            </div>
            {(
              [
                ["required", "Required"],
                ["active", "Active"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border px-3 py-2"
              >
                <Label htmlFor={`pref-type-${key}`}>{label}</Label>
                <Switch
                  id={`pref-type-${key}`}
                  checked={typeDraft[key]}
                  disabled={!canEdit || (key === "required" && !typeDraft.active)}
                  onCheckedChange={(value) => markType(key, value)}
                />
              </div>
            ))}
            {errorFor(typeErrors, "required") ? (
              <p className="text-xs text-destructive">{errorFor(typeErrors, "required")}</p>
            ) : null}
            {canEdit ? (
              <Button
                type="submit"
                disabled={typeMutation.isPending}
                className="w-full bg-[#C89933] text-[#251605]"
              >
                {typeMutation.isPending ? "Saving…" : "Save Preference"}
              </Button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingClose)}
        onOpenChange={(open) => !open && setPendingClose(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Changes to this preference have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingClose === "category") setCategoryOpen(false);
                if (pendingClose === "type") setTypeOpen(false);
                setPendingClose(null);
                setDirty(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preference Type?</AlertDialogTitle>
            <AlertDialogDescription>
              If a profile type uses this preference, disable it instead. Guest preference values
              are not deleted.
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
    </div>
  );
}

export function Card4PreferencesGuide({
  categoryCount,
  typeCount,
}: {
  categoryCount: number;
  typeCount: number;
}) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Enable categories</li>
        <li>Add/edit preference types</li>
        <li>Set required and active status</li>
      </ol>
      <p className="mt-3 text-sm text-[#251605]">
        {categoryCount} categories · {typeCount} preference types
      </p>
    </section>
  );
}
