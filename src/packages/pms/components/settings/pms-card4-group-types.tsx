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
  deletePmsCard4GroupType,
  getPmsCard4GroupTypes,
  savePmsCard4GroupType,
  setPmsCard4GroupTypeActive,
} from "@/packages/pms/lib/group-types-card4.functions";
import {
  DEFAULT_GROUP_TYPES,
  emptyGroupTypeDraft,
  normalizeGroupTypeCode,
  validateGroupTypeDraft,
  type GroupTypeDraft,
  type GroupTypeRecord,
} from "@/packages/pms/lib/group-types-card4.server";
import { cn } from "@/shared/lib/utils";

function recordToDraft(row: GroupTypeRecord): GroupTypeDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export function PmsCard4GroupTypes({
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
  const load = useServerFn(getPmsCard4GroupTypes);
  const save = useServerFn(savePmsCard4GroupType);
  const setActive = useServerFn(setPmsCard4GroupTypeActive);
  const remove = useServerFn(deletePmsCard4GroupType);
  const queryKey = ["pms-card4-group-types", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const types = query.data?.types ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupTypeDraft>(emptyGroupTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GroupTypeRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  useEffect(() => {
    if (!query.data) return;
    if (selectedId && query.data.types.some((row) => row.id === selectedId)) return;
    const first = query.data.types[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? recordToDraft(first) : emptyGroupTypeDraft());
    setDirty(false);
  }, [query.data, selectedId]);

  function applyRecord(row: GroupTypeRecord | null) {
    setSelectedId(row?.id ?? null);
    setDraft(row ? recordToDraft(row) : emptyGroupTypeDraft());
    setDirty(false);
  }

  function requestSelect(id: string | null) {
    if (dirty) {
      setPendingSwitch(id);
      return;
    }
    applyRecord(types.find((item) => item.id === id) ?? null);
  }

  function mark<K extends keyof GroupTypeDraft>(key: K, value: GroupTypeDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const errors = validateGroupTypeDraft(draft, types);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeGroupTypeCode(draft.code),
          description: draft.description,
          active: draft.active,
          sortOrder: draft.sortOrder,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["group-create-context", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["group-catalogues", restaurantId] });
      if (result.type) applyRecord(result.type);
      toast.success("Group type saved successfully.");
      onSaved(thenNextRef.current);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save group type."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["group-create-context", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["group-catalogues", restaurantId] });
      if (draft.id === input.id) mark("active", input.active);
      toast.success(input.active ? "Group type activated." : "Group type deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["group-create-context", restaurantId] });
      await queryClient.invalidateQueries({ queryKey: ["group-catalogues", restaurantId] });
      setPendingDelete(null);
      applyRecord(null);
      toast.success("Group type deleted.");
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
      toast.error(errors[0]?.message ?? "Fix the group type before saving.");
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
    setDraft(emptyGroupTypeDraft());
    setDirty(true);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-group-types">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Group Types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the group types staff can pick when registering a group. This does not change
            existing group records.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={startCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Group Type
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading group types…</p>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load group types.</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell className="text-muted-foreground">{row.description || "—"}</TableCell>
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

      <section className="space-y-4 rounded-2xl border border-[#CCCCCC] bg-white p-4">
        <div>
          <h3 className="text-sm font-medium text-[#251605]">
            {draft.id ? "Edit Group Type" : "New Group Type"}
          </h3>
          <p className="text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gt-name">Name *</Label>
            <Input
              id="gt-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) => mark("name", event.target.value)}
            />
            {errorFor("name") ? <p className="text-xs text-destructive">{errorFor("name")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gt-code">Code *</Label>
            <Input
              id="gt-code"
              value={draft.code}
              disabled={!canEdit}
              onChange={(event) => mark("code", normalizeGroupTypeCode(event.target.value))}
            />
            {errorFor("code") ? <p className="text-xs text-destructive">{errorFor("code")}</p> : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gt-description">Description</Label>
          <Textarea
            id="gt-description"
            value={draft.description}
            disabled={!canEdit}
            maxLength={400}
            onChange={(event) => mark("description", event.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gt-sort">Sort order</Label>
            <Input
              id="gt-sort"
              type="number"
              min={0}
              max={999}
              value={draft.sortOrder}
              disabled={!canEdit}
              onChange={(event) => mark("sortOrder", Number(event.target.value) || 0)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gt-active">Active</Label>
            <Switch
              id="gt-active"
              checked={draft.active}
              disabled={!canEdit}
              onCheckedChange={(active) => mark("active", active)}
            />
          </div>
        </div>
      </section>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group type?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing groups keep their current type. Staff will not be able to pick this type for
              new groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}>
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
              You have unsaved group type changes. Discard them to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingSwitch;
                setPendingSwitch(null);
                if (next === "__new__") {
                  setSelectedId(null);
                  setDraft(emptyGroupTypeDraft());
                  setDirty(true);
                  return;
                }
                applyRecord(types.find((item) => item.id === next) ?? null);
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

export function Card4GroupTypesGuide({ count }: { count: number }) {
  const target = Math.max(count, DEFAULT_GROUP_TYPES.length);
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <p className="mt-2 text-sm text-[#251605]">
        Group Types
        <span className="mt-1 block text-muted-foreground">
          {count} of {target} configured
        </span>
      </p>
    </section>
  );
}
