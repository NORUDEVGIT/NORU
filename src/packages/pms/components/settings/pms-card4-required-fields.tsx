import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, MoreHorizontal, Plus } from "lucide-react";
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
  validateGuestFieldDraft,
  type GuestFieldDraft,
  type GuestFieldRecord,
  type GuestFieldType,
} from "@/packages/pms/lib/required-fields-card4.server";

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

export function PmsCard4RequiredFields({
  restaurantId,
  canEdit,
  onSavingChange,
  saveRequest,
  onSaved,
  onGoIdentityDocuments,
}: {
  restaurantId: string;
  canEdit: boolean;
  onSavingChange: (saving: boolean, canSave: boolean) => void;
  saveRequest: { token: number; thenNext: boolean } | null;
  onSaved: (thenNext: boolean) => void;
  onGoIdentityDocuments: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4RequiredFields);
  const save = useServerFn(savePmsCard4RequiredField);
  const setFlags = useServerFn(setPmsCard4RequiredFieldFlags);
  const reorder = useServerFn(reorderPmsCard4RequiredFields);
  const remove = useServerFn(deletePmsCard4RequiredField);
  const queryKey = ["pms-card4-required-fields", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const fields = query.data?.fields ?? [];
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<GuestFieldDraft>(emptyGuestFieldDraft());
  const [codeTouched, setCodeTouched] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<GuestFieldRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  const errors = validateGuestFieldDraft(draft, fields);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setEditorOpen(false);
      setDirty(false);
      toast.success("Required fields saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save required field configuration."),
  });

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
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorder({ data: { restaurantId, ids } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setReorderOpen(false);
      toast.success("Required fields saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save field order."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      toast.success("Field deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editorValid = !editorOpen || errors.length === 0;
  const busy = saveMutation.isPending || flagsMutation.isPending || reorderMutation.isPending;
  useEffect(() => {
    onSavingChange(busy, canEdit && !busy && editorValid);
  }, [busy, canEdit, editorValid, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit) {
      toast.error("You cannot save required fields.");
      return;
    }
    toast.success("Required fields saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, onSaved]);

  function openCreate() {
    setDraft(emptyGuestFieldDraft());
    setCodeTouched(false);
    setEditorOpen(true);
  }

  function openEdit(row: GuestFieldRecord) {
    setDraft(recordToDraft(row));
    setCodeTouched(true);
    setEditorOpen(true);
  }

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
    setDirty(true);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-required-fields">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Required Fields</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select which fields will be mandatory in the guest profile. Configure separately for
            check-in and reservation.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReorderIds(fields.map((row) => row.id));
                setReorderOpen(true);
              }}
            >
              Reorder
            </Button>
            <Button
              type="button"
              onClick={openCreate}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              <Plus className="mr-1 size-4" /> Add Field
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading guest fields…</p>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load guest fields.</p>
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
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Reservation</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                  <TableCell>{GUEST_FIELD_TYPE_LABELS[row.fieldType]}</TableCell>
                  <TableCell>
                    <Switch
                      checked={row.required}
                      disabled={!canEdit || flagsMutation.isPending || !row.active}
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
                      checked={row.reservation}
                      disabled={!canEdit || flagsMutation.isPending}
                      onCheckedChange={(reservation) =>
                        flagsMutation.mutate({ id: row.id, reservation })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      disabled={!canEdit || flagsMutation.isPending}
                      onCheckedChange={(active) => flagsMutation.mutate({ id: row.id, active })}
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
                        <DropdownMenuItem onSelect={() => openEdit(row)}>Edit</DropdownMenuItem>
                        {canEdit ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              flagsMutation.mutate({ id: row.id, active: !row.active })
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
      </div>

      <Sheet open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{draft.id ? "Edit Field" : "Add Field"}</SheetTitle>
            <SheetDescription>
              Global field definition. Profile Types can associate this field by ID.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-3 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || errors.length > 0) {
                toast.error(errors[0]?.message ?? "Fix the field before saving.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="gf-name">Field Name *</Label>
              <Input
                id="gf-name"
                value={draft.name}
                disabled={!canEdit}
                onChange={(event) => mark("name", event.target.value)}
              />
              {errorFor("name") ? (
                <p className="text-xs text-destructive">{errorFor("name")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-code">Field Code *</Label>
              <Input
                id="gf-code"
                value={draft.code}
                disabled={!canEdit}
                onChange={(event) => {
                  setCodeTouched(true);
                  mark("code", normalizeGuestFieldCode(event.target.value));
                }}
              />
              {errorFor("code") ? (
                <p className="text-xs text-destructive">{errorFor("code")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Field Type *</Label>
              <Select
                value={draft.fieldType}
                disabled={!canEdit}
                onValueChange={(value) => mark("fieldType", value as GuestFieldType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {GUEST_FIELD_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gf-description">Description</Label>
              <Textarea
                id="gf-description"
                value={draft.description}
                disabled={!canEdit}
                maxLength={400}
                onChange={(event) => mark("description", event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{draft.description.length}/400</p>
            </div>
            {(
              [
                ["required", "Required"],
                ["checkIn", "Check-in"],
                ["reservation", "Reservation"],
                ["active", "Active"],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border px-3 py-2"
              >
                <Label htmlFor={`gf-${key}`}>{label}</Label>
                <Switch
                  id={`gf-${key}`}
                  checked={draft[key]}
                  disabled={!canEdit || (key === "required" && !draft.active)}
                  onCheckedChange={(value) => mark(key, value)}
                />
              </div>
            ))}
            {errorFor("required") ? (
              <p className="text-xs text-destructive">{errorFor("required")}</p>
            ) : null}

            {draft.fieldType === "select" || draft.fieldType === "multi_select" ? (
              <div className="space-y-2">
                <Label>Options / Values</Label>
                {draft.options.map((option, index) => (
                  <div key={option.id} className="flex gap-2">
                    <Input
                      value={option.label}
                      placeholder="Label"
                      disabled={!canEdit}
                      onChange={(event) => {
                        const next = [...draft.options];
                        next[index] = {
                          ...option,
                          label: event.target.value,
                          value: option.value || event.target.value,
                        };
                        mark("options", next);
                      }}
                    />
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          mark(
                            "options",
                            draft.options.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      mark("options", [...draft.options, emptyFieldOption(draft.options.length)])
                    }
                  >
                    + Add Option
                  </Button>
                ) : null}
                {errorFor("options") ? (
                  <p className="text-xs text-destructive">{errorFor("options")}</p>
                ) : null}
              </div>
            ) : null}

            {draft.fieldType === "document" ? (
              <div className="space-y-2">
                <Label>Document Type</Label>
                {(query.data?.documentTypes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No identity document types are configured yet. Add them on Identity Documents
                    later.
                  </p>
                ) : (
                  (query.data?.documentTypes ?? []).map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.documentTypeIds.includes(doc.id)}
                        disabled={!canEdit}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...draft.documentTypeIds, doc.id]
                            : draft.documentTypeIds.filter((id) => id !== doc.id);
                          mark("documentTypeIds", next);
                        }}
                      />
                      <span className="text-sm">{doc.name}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {draft.fieldType === "lookup" ? (
              <div className="space-y-1">
                <Label>Lookup Source</Label>
                <Select
                  value={draft.lookupSource ?? ""}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    mark("lookupSource", value as (typeof GUEST_FIELD_LOOKUP_SOURCES)[number])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a source" />
                  </SelectTrigger>
                  <SelectContent>
                    {GUEST_FIELD_LOOKUP_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {GUEST_FIELD_LOOKUP_LABELS[source]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errorFor("lookupSource") ? (
                  <p className="text-xs text-destructive">{errorFor("lookupSource")}</p>
                ) : null}
              </div>
            ) : null}

            {draft.fieldType === "number" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Minimum Value</Label>
                  <Input
                    type="number"
                    value={draft.minValue ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      mark(
                        "minValue",
                        event.target.value === "" ? null : Number(event.target.value),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Maximum Value</Label>
                  <Input
                    type="number"
                    value={draft.maxValue ?? ""}
                    disabled={!canEdit}
                    onChange={(event) =>
                      mark(
                        "maxValue",
                        event.target.value === "" ? null : Number(event.target.value),
                      )
                    }
                  />
                </div>
                {errorFor("minValue") ? (
                  <p className="col-span-2 text-xs text-destructive">{errorFor("minValue")}</p>
                ) : null}
              </div>
            ) : null}

            {canEdit ? (
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="w-full bg-[#C89933] text-[#251605]"
              >
                {saveMutation.isPending ? "Saving…" : "Save Field"}
              </Button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={reorderOpen} onOpenChange={(open) => !open && setReorderOpen(false)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Reorder Fields</SheetTitle>
            <SheetDescription>
              Move fields up or down. The order is saved for later guest forms.
            </SheetDescription>
          </SheetHeader>
          <ol className="mt-4 space-y-2">
            {reorderIds.map((id, index) => {
              const row = fields.find((item) => item.id === id);
              if (!row) return null;
              return (
                <li
                  key={id}
                  className="flex items-center justify-between rounded-xl border px-3 py-2"
                >
                  <span className="text-sm text-[#251605]">
                    {index + 1}. {row.name}
                  </span>
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
              {reorderMutation.isPending ? "Saving…" : "Save order"}
            </Button>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Field?</AlertDialogTitle>
            <AlertDialogDescription>
              Guest operational records are not deleted. If a profile type uses this field, disable
              it instead.
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

      <AlertDialog open={pendingCancel} onOpenChange={(open) => !open && setPendingCancel(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved field editor or reorder list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingCancel(false);
                setEditorOpen(false);
                setReorderOpen(false);
                setDirty(false);
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

export function Card4RequiredFieldsGuide({
  count,
  onGoIdentityDocuments,
}: {
  count: number;
  onGoIdentityDocuments: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Required fields ensure complete guest information.</li>
        <li>Different requirements can be configured for check-in and reservation.</li>
        <li>Fields can be enabled/disabled.</li>
      </ul>
      <p className="mt-3 text-sm text-[#251605]">
        {count} of {Math.max(count, 9)} configured
      </p>
      <button
        type="button"
        className="mt-3 text-sm font-medium text-[#C89933]"
        onClick={onGoIdentityDocuments}
      >
        Go to Identity Documents →
      </button>
    </section>
  );
}
