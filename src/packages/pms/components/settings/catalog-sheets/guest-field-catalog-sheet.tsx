import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, MoreHorizontal, Plus } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
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
import {
  deletePmsCard4RequiredField,
  getPmsCard4RequiredFields,
  reorderPmsCard4RequiredFields,
  savePmsCard4RequiredField,
  setPmsCard4RequiredFieldFlags,
} from "@/packages/pms/lib/required-fields-card4.functions";
import {
  GUEST_FIELD_LOOKUP_LABELS,
  GUEST_FIELD_LOOKUP_SOURCES,
  GUEST_FIELD_TYPE_LABELS,
  GUEST_FIELD_TYPES,
  codeFromGuestFieldName,
  emptyFieldOption,
  emptyGuestFieldDraft,
  flagsForActiveChange,
  normalizeGuestFieldCode,
  type GuestFieldDraft,
  type GuestFieldLookupSource,
  type GuestFieldOption,
  type GuestFieldRecord,
  type GuestFieldType,
  validateGuestFieldDraft,
} from "@/packages/pms/lib/required-fields-card4.server";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";

function recordToDraft(row: GuestFieldRecord): GuestFieldDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    fieldType: row.fieldType,
    description: row.description ?? "",
    options: row.options.map((item) => ({ ...item })),
    required: row.required,
    checkIn: row.checkIn,
    reservation: row.reservation,
    active: row.active,
    lookupSource: row.lookupSource,
    documentTypeIds: [...row.documentTypeIds],
    minValue: row.minValue,
    maxValue: row.maxValue,
  };
}

export function GuestFieldEditorSheet({
  open,
  onOpenChange,
  restaurantId,
  canEdit,
  field,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  canEdit: boolean;
  field?: GuestFieldRecord | null;
  onSaved?: (fieldId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4RequiredFields);
  const save = useServerFn(savePmsCard4RequiredField);
  const queryKey = ["pms-card4-required-fields", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const fields = query.data?.fields ?? [];
  const [draft, setDraft] = useState<GuestFieldDraft>(emptyGuestFieldDraft());
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (field) {
      setDraft(recordToDraft(field));
      setCodeTouched(true);
    } else {
      setDraft(emptyGuestFieldDraft());
      setCodeTouched(false);
    }
  }, [field, open]);

  const isSystemField = draft.code === "FIRST_NAME" || field?.code === "FIRST_NAME";
  const errors = validateGuestFieldDraft(draft, fields);
  const errorFor = (f: string) => errors.find((row) => row.field === f)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeGuestFieldCode(draft.code),
          fieldType: draft.fieldType,
          description: draft.description,
          options: draft.options,
          required: draft.required,
          checkIn: draft.checkIn,
          reservation: draft.reservation,
          active: draft.active,
          lookupSource: draft.lookupSource,
          documentTypeIds: draft.documentTypeIds,
          minValue: draft.minValue,
          maxValue: draft.maxValue,
        },
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-profile-types", restaurantId],
      });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      toast.success("Guest field saved successfully.");
      onOpenChange(false);
      onSaved?.(res.field?.id ?? draft.id ?? undefined);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save guest field."),
  });

  function mark<K extends keyof GuestFieldDraft>(key: K, value: GuestFieldDraft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !codeTouched) next.code = codeFromGuestFieldName(String(value));
      if (key === "active") {
        const flags = flagsForActiveChange(Boolean(value), prev.required);
        next.required = flags.required;
      }
      return next;
    });
  }

  function updateOption(id: string, patch: Partial<GuestFieldOption>) {
    setDraft((prev) => ({
      ...prev,
      options: prev.options.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }

  function addOption() {
    setDraft((prev) => ({
      ...prev,
      options: [...prev.options, emptyFieldOption(prev.options.length)],
    }));
  }

  function removeOption(id: string) {
    setDraft((prev) => ({
      ...prev,
      options: prev.options
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, displayOrder: index })),
    }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{draft.id ? "Edit Field Definition" : "Add Field Definition"}</SheetTitle>
          <SheetDescription>
            {draft.id
              ? "Update guest field definition settings."
              : "Create a new field definition in the guest fields catalog."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isSystemField) return;
            saveMutation.mutate();
          }}
        >
          {isSystemField ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 font-medium">
              First Name is a core system-required field and cannot be customized.
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="gfd-name">Field Name *</Label>
            <Input
              id="gfd-name"
              value={draft.name}
              disabled={!canEdit || isSystemField}
              onChange={(e) => mark("name", e.target.value)}
            />
            {errorFor("name") ? <p className="text-xs text-destructive">{errorFor("name")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gfd-code">Code *</Label>
            <Input
              id="gfd-code"
              value={draft.code}
              disabled={!canEdit || Boolean(draft.id)}
              onChange={(e) => {
                setCodeTouched(true);
                mark("code", e.target.value);
              }}
            />
            {errorFor("code") ? <p className="text-xs text-destructive">{errorFor("code")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gfd-type">Field Type</Label>
            <Select
              value={draft.fieldType}
              disabled={!canEdit || Boolean(draft.id)}
              onValueChange={(val) => mark("fieldType", val as GuestFieldType)}
            >
              <SelectTrigger id="gfd-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUEST_FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {GUEST_FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gfd-desc">Description</Label>
            <Textarea
              id="gfd-desc"
              value={draft.description}
              disabled={!canEdit}
              onChange={(e) => mark("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="gfd-req" className="text-xs">Required</Label>
              <Switch
                id="gfd-req"
                checked={draft.required}
                disabled={!canEdit || !draft.active}
                onCheckedChange={(checked) => mark("required", checked)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="gfd-act" className="text-xs">Active</Label>
              <Switch
                id="gfd-act"
                checked={draft.active}
                disabled={!canEdit}
                onCheckedChange={(checked) => mark("active", checked)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="gfd-chk" className="text-xs">Required Check-in</Label>
              <Switch
                id="gfd-chk"
                checked={draft.checkIn}
                disabled={!canEdit}
                onCheckedChange={(checked) => mark("checkIn", checked)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="gfd-res" className="text-xs">Required Reservation</Label>
              <Switch
                id="gfd-res"
                checked={draft.reservation}
                disabled={!canEdit}
                onCheckedChange={(checked) => mark("reservation", checked)}
              />
            </div>
          </div>

          {(draft.fieldType === "select" || draft.fieldType === "multi_select") && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="size-3 mr-1" /> Add Option
                </Button>
              </div>
              {draft.options.map((opt) => (
                <div key={opt.id} className="flex gap-2">
                  <Input
                    placeholder="Label"
                    value={opt.label}
                    onChange={(e) => updateOption(opt.id, { label: e.target.value, value: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(opt.id)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}

          {draft.fieldType === "lookup" && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label>Lookup Source</Label>
              <Select
                value={draft.lookupSource ?? ""}
                onValueChange={(val) => mark("lookupSource", val as GuestFieldLookupSource)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_FIELD_LOOKUP_SOURCES.map((src) => (
                    <SelectItem key={src} value={src}>
                      {GUEST_FIELD_LOOKUP_LABELS[src]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canEdit || isSystemField || saveMutation.isPending || errors.length > 0}
            className="w-full bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 mt-4"
          >
            {saveMutation.isPending ? "Saving…" : draft.id ? "Update Field" : "Create Field"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function GuestFieldCatalogSheet({
  open,
  onOpenChange,
  restaurantId,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4RequiredFields);
  const setFlags = useServerFn(setPmsCard4RequiredFieldFlags);
  const reorder = useServerFn(reorderPmsCard4RequiredFields);
  const remove = useServerFn(deletePmsCard4RequiredField);

  const queryKey = ["pms-card4-required-fields", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const rawFields = query.data?.fields ?? [];
  const fields = rawFields.filter((row) => row.code !== "IDENTITY_DOCUMENT");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<GuestFieldRecord | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<GuestFieldRecord | null>(null);

  const flagsMutation = useMutation({
    mutationFn: (input: {
      id: string;
      required?: boolean;
      checkIn?: boolean;
      reservation?: boolean;
      active?: boolean;
    }) => setFlags({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-profile-types", restaurantId],
      });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorder({ data: { restaurantId, ids } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setReorderOpen(false);
      toast.success("Field order updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save field order."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-profile-types", restaurantId],
      });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setPendingDelete(null);
      toast.success("Field deleted from catalog.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Manage Guest Field Catalog</SheetTitle>
              <SheetDescription>
                Full catalog management for property guest profile fields.
              </SheetDescription>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReorderIds(fields.map((f) => f.id));
                    setReorderOpen(true);
                  }}
                >
                  Reorder
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#C89933] text-[#251605]"
                  onClick={() => {
                    setSelectedField(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-3.5" /> Add Field
                </Button>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div className="mt-4 border rounded-xl overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((row) => {
                const isSystemRequired = row.code === "FIRST_NAME";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-[#251605]">
                      <div className="flex items-center gap-2">
                        <span>{row.name}</span>
                        {isSystemRequired ? (
                          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            System Required
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{GUEST_FIELD_TYPE_LABELS[row.fieldType]}</TableCell>
                    <TableCell>
                      <Switch
                        checked={isSystemRequired ? true : row.required}
                        disabled={isSystemRequired || !canEdit || flagsMutation.isPending || !row.active}
                        title={isSystemRequired ? "First Name is system required" : undefined}
                        onCheckedChange={(required) => flagsMutation.mutate({ id: row.id, required })}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.checkIn}
                        disabled={!canEdit || flagsMutation.isPending}
                        onCheckedChange={(checkIn) => flagsMutation.mutate({ id: row.id, checkIn })}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={isSystemRequired ? true : row.active}
                        disabled={isSystemRequired || !canEdit || flagsMutation.isPending}
                        title={isSystemRequired ? "First Name cannot be deactivated" : undefined}
                        onCheckedChange={(active) => flagsMutation.mutate({ id: row.id, active })}
                      />
                    </TableCell>
                    <TableCell>
                      {isSystemRequired ? (
                        <span className="text-[11px] text-muted-foreground italic px-2">Locked</span>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setSelectedField(row);
                                setEditorOpen(true);
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            {canEdit ? (
                              <DropdownMenuItem onSelect={() => setPendingDelete(row)}>
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <GuestFieldEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          restaurantId={restaurantId}
          canEdit={canEdit}
          field={selectedField}
        />

        <Sheet open={reorderOpen} onOpenChange={setReorderOpen}>
          <SheetContent className="overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Reorder Fields</SheetTitle>
              <SheetDescription>Move fields up or down.</SheetDescription>
            </SheetHeader>
            <ol className="mt-4 space-y-2">
              {reorderIds.map((id, index) => {
                const row = fields.find((item) => item.id === id);
                if (!row) return null;
                return (
                  <li key={id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                    <span className="text-sm">{index + 1}. {row.name}</span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...reorderIds];
                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                          setReorderIds(next);
                        }}
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === reorderIds.length - 1}
                        onClick={() => {
                          const next = [...reorderIds];
                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                          setReorderIds(next);
                        }}
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ol>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 w-full bg-[#C89933] text-[#251605]"
                disabled={reorderMutation.isPending}
                onClick={() => reorderMutation.mutate(reorderIds)}
              >
                Save Order
              </Button>
            ) : null}
          </SheetContent>
        </Sheet>

        <AlertDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(op) => !op && setPendingDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Field Definition?</AlertDialogTitle>
              <AlertDialogDescription>
                Guest operational records are not deleted. If a profile type uses this field, disable it instead.
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
      </SheetContent>
    </Sheet>
  );
}
