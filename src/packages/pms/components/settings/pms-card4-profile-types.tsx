import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
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
import { getPmsCard4RequiredFields } from "@/packages/pms/lib/required-fields-card4.functions";
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
import { cn } from "@/shared/lib/utils";

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

export function PmsCard4ProfileTypes({
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
  const load = useServerFn(getPmsCard4ProfileTypes);
  const loadFields = useServerFn(getPmsCard4RequiredFields);
  const save = useServerFn(savePmsCard4ProfileType);
  const setActive = useServerFn(setPmsCard4ProfileTypeActive);
  const remove = useServerFn(deletePmsCard4ProfileType);

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
  const catalogueFields = (fieldsQuery.data?.fields ?? []).filter((row) => row.active);

  const types = query.data?.types ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileTypeDraft>(emptyProfileTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProfileTypeRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  useEffect(() => {
    if (!query.data) return;
    if (selectedId && query.data.types.some((row) => row.id === selectedId)) return;
    const first = query.data.types[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? recordToDraft(first) : emptyProfileTypeDraft());
    setDirty(false);
  }, [query.data, selectedId]);

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
      if (result.type) applyRecord(result.type);
      toast.success("Profile type saved successfully.");
      onSaved(thenNextRef.current);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save profile type."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      if (draft.id === input.id) mark("active", input.active);
      toast.success(input.active ? "Profile type activated." : "Profile type deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      applyRecord(null);
      toast.success("Profile type deleted.");
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

  function startCreate() {
    if (dirty) {
      setPendingSwitch("__new__");
      return;
    }
    setSelectedId(null);
    setDraft(emptyProfileTypeDraft());
    setDirty(true);
  }

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
            Configure which guest profile types this property uses. This does not change live guest
            records.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={startCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Profile Type
          </Button>
        ) : null}
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
                <TableHead className="w-10" />
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((row) => (
                <TableRow
                  key={row.id}
                  className={row.id === selectedId ? "bg-[#C89933]/5" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={row.id === selectedId}
                      onCheckedChange={() => requestSelect(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell className="text-muted-foreground">{row.description ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        row.active
                          ? "border-[#436436]/40 bg-[#436436]/10 text-[#436436]"
                          : "border-[#CCCCCC] bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      disabled={!canEdit || toggleMutation.isPending}
                      aria-label={`${row.active ? "Deactivate" : "Activate"} ${row.name}`}
                      onCheckedChange={(active) => toggleMutation.mutate({ id: row.id, active })}
                    />
                  </TableCell>
                  <TableCell>
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
              value={draft.id ?? "new"}
              onValueChange={(value) => requestSelect(value === "new" ? null : value)}
            >
              <SelectTrigger className="w-[16rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!draft.id ? <SelectItem value="new">New profile type</SelectItem> : null}
                {types.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General Information</TabsTrigger>
            <TabsTrigger value="fields">Required Fields</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
          </TabsList>
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
                  disabled={!canEdit}
                  onChange={(event) => mark("code", normalizeProfileTypeCode(event.target.value))}
                />
                {errorFor("code") ? (
                  <p className="text-xs text-destructive">{errorFor("code")}</p>
                ) : null}
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
          <TabsContent value="fields" className="space-y-2 pt-3">
            {catalogueFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No required fields are configured yet. Add them on Required Fields.
              </p>
            ) : (
              catalogueFields.map((field) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`field-${field.id}`}
                    checked={draft.requiredFieldIds.includes(field.id)}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      mark(
                        "requiredFieldIds",
                        toggleId(draft.requiredFieldIds, field.id, checked === true),
                      )
                    }
                  />
                  <Label htmlFor={`field-${field.id}`} className="font-normal">
                    {field.name}
                  </Label>
                </div>
              ))
            )}
          </TabsContent>
          <TabsContent value="documents" className="space-y-2 pt-3">
            {(query.data?.documentTypes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No identity document types are configured yet. Add them on Identity Documents later.
              </p>
            ) : (
              (query.data?.documentTypes ?? []).map((doc) => (
                <div key={doc.id} className="flex items-center gap-2">
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
                  <Label htmlFor={`doc-${doc.id}`} className="font-normal">
                    {doc.name}
                  </Label>
                </div>
              ))
            )}
          </TabsContent>
          <TabsContent value="preferences" className="space-y-2 pt-3">
            {(query.data?.preferenceTypes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No preference types are configured yet. Add them on Preferences later.
              </p>
            ) : (
              (query.data?.preferenceTypes ?? []).map((pref) => (
                <div key={pref.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`pref-${pref.id}`}
                    checked={draft.preferenceTypeIds.includes(pref.id)}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      mark(
                        "preferenceTypeIds",
                        toggleId(draft.preferenceTypeIds, pref.id, checked === true),
                      )
                    }
                  />
                  <Label htmlFor={`pref-${pref.id}`} className="font-normal">
                    {pref.name}
                  </Label>
                </div>
              ))
            )}
          </TabsContent>
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
              options={GUEST_PROFILE_TYPES.map((row) => ({ id: row.id, label: row.title }))}
              onChange={(guestTypeId) => mark("defaults", { ...draft.defaults, guestTypeId })}
            />
          </TabsContent>
        </Tabs>
      </section>

      <p className="sr-only">
        Profile Types {configuredCount} of {Math.max(configuredCount, 6)} configured
      </p>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This profile type may be referenced by guest profile configuration. Guest operational
              records are not deleted.
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

      <AlertDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => !open && setPendingSwitch(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved profile type changes. Discard them to switch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSwitch === "__new__") {
                  setSelectedId(null);
                  setDraft(emptyProfileTypeDraft());
                  setDirty(true);
                } else {
                  const row = types.find((item) => item.id === pendingSwitch) ?? null;
                  applyRecord(row);
                }
                setPendingSwitch(null);
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

function DefaultSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { id: string; label: string }[];
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? "none"}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not set</SelectItem>
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
  const target = Math.max(count, 6);
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <p className="mt-2 text-sm text-[#251605]">
        Profile Types
        <span className="mt-1 block text-muted-foreground">
          {count} of {target} configured
        </span>
      </p>
    </section>
  );
}
