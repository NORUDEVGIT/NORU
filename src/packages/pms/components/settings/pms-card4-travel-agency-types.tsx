import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus, Search } from "lucide-react";
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
  deletePmsCard4TravelAgencyType,
  getPmsCard4TravelAgencyTypes,
  savePmsCard4TravelAgencyType,
  setPmsCard4TravelAgencyTypeActive,
} from "@/packages/pms/lib/travel-agency-types-card4.functions";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";
import {
  emptyTravelAgencyTypeDraft,
  normalizeTravelAgencyTypeCode,
  validateTravelAgencyTypeDraft,
  type TravelAgencyTypeDraft,
  type TravelAgencyTypeRecord,
} from "@/packages/pms/lib/travel-agency-types-card4.server";
import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";

function recordToDraft(row: TravelAgencyTypeRecord): TravelAgencyTypeDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export function PmsCard4TravelAgencyTypes({
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
  const load = useServerFn(getPmsCard4TravelAgencyTypes);
  const save = useServerFn(savePmsCard4TravelAgencyType);
  const setActive = useServerFn(setPmsCard4TravelAgencyTypeActive);
  const remove = useServerFn(deletePmsCard4TravelAgencyType);
  const queryKey = ["pms-card4-travel-agency-types", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const types = query.data?.types ?? [];
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<TravelAgencyTypeDraft>(emptyTravelAgencyTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TravelAgencyTypeRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);

  const visibleTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((row) => {
      return (
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [types, search]);

  function applyRecord(row: TravelAgencyTypeRecord | null) {
    setSelectedId(row?.id ?? null);
    setDraft(row ? recordToDraft(row) : emptyTravelAgencyTypeDraft());
    setDirty(false);
  }

  function mark<K extends keyof TravelAgencyTypeDraft>(key: K, value: TravelAgencyTypeDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const errors = validateTravelAgencyTypeDraft(draft, types);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeTravelAgencyTypeCode(draft.code),
          description: draft.description,
          active: draft.id
            ? (types.find((row) => row.id === draft.id)?.active ?? draft.active)
            : draft.active,
          sortOrder: draft.sortOrder,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-create-context", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setDirty(false);
      setSelectedId(result.id);
      setEditorOpen(false);
      toast.success(draft.id ? "Travel agency type saved." : "Travel agency type created.");
      const thenNext = thenNextRef.current;
      thenNextRef.current = false;
      onSaved(thenNext);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save travel agency type."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-create-context", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setDraft((prev) => (prev.id === input.id ? { ...prev, active: input.active } : prev));
      toast.success(input.active ? "Travel agency type activated." : "Travel agency type deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-create-context", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setPendingDelete(null);
      setSelectedId(null);
      setDraft(emptyTravelAgencyTypeDraft());
      setDirty(false);
      setEditorOpen(false);
      toast.success("Travel agency type deleted.");
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
      toast.error(errors[0]?.message ?? "Fix the travel agency type before saving.");
      return;
    }
    saveMutation.mutate();
  }, [saveRequest, canEdit, errors, saveMutation]);

  function startCreate() {
    if (dirty && editorOpen) {
      setPendingSwitch("__NEW__");
      return;
    }
    setSelectedId(null);
    setDraft({
      ...emptyTravelAgencyTypeDraft(),
      sortOrder: (types.length + 1) * 10,
    });
    setDirty(false);
    setEditorOpen(true);
  }

  function openEdit(row: TravelAgencyTypeRecord) {
    if (dirty && editorOpen && selectedId !== row.id) {
      setPendingSwitch(row.id);
      return;
    }
    applyRecord(row);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (dirty) {
      setPendingClose(true);
      return;
    }
    setEditorOpen(false);
  }

  function submitEditor() {
    if (errors.length > 0 || !canEdit || saveMutation.isPending) {
      toast.error(errors[0]?.message ?? "Fix the travel agency type before saving.");
      return;
    }
    thenNextRef.current = false;
    saveMutation.mutate();
  }

  return (
    <div className="space-y-3" data-testid="card4-travel-agency-types">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#251605]">Travel Agency Types</h2>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={startCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> New Agency Type
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#CCCCCC] bg-white">
        <div className="border-b border-[#CCCCCC] p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Search agency types..."
              className="h-8 bg-white pl-8 text-xs"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading travel agency types…</p>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load travel agency types.</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : types.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
            <p>No travel agency types configured yet.</p>
          </div>
        ) : visibleTypes.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No agency types match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Travel Agency Type</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTypes.map((row) => (
                  <TableRow key={row.id} className="hover:bg-[#FAF8F5]/80">
                    <TableCell className="py-2 font-medium text-[#251605]">{row.name}</TableCell>
                    <TableCell className="py-2 font-mono text-xs">{row.code}</TableCell>
                    <TableCell className="max-w-[16rem] truncate py-2 text-muted-foreground">
                      <span title={row.description || undefined}>{row.description || "—"}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <Switch
                        checked={row.active}
                        disabled={!canEdit || toggleMutation.isPending}
                        onCheckedChange={(active) => toggleMutation.mutate({ id: row.id, active })}
                        aria-label={`${row.active ? "Deactivate" : "Activate"} ${row.name}`}
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
                        <DropdownMenuContent align="end" className="w-56 border-[#DDD4C5]">
                          <DropdownMenuItem onSelect={() => openEdit(row)}>
                            Edit Travel Agency Type
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
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => setPendingDelete(row)}
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
        )}
      </div>

      <Card3OverlapSheet
        open={editorOpen}
        title={draft.id ? "Edit Travel Agency Type" : "New Agency Type"}
        onClose={closeEditor}
        onSubmit={submitEditor}
        submitLabel={draft.id ? "Save Changes" : "Add Agency Type"}
        pending={saveMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-[700px]"
        className="max-h-[80vh]"
        footerJustify="between"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tat-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tat-name"
              value={draft.name}
              disabled={!canEdit}
              maxLength={120}
              onChange={(event) => mark("name", event.target.value)}
            />
            {errorFor("name") ? (
              <p className="text-xs text-destructive">{errorFor("name")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tat-code">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tat-code"
              value={draft.code}
              disabled={!canEdit}
              maxLength={12}
              onChange={(event) => mark("code", normalizeTravelAgencyTypeCode(event.target.value))}
            />
            {errorFor("code") ? (
              <p className="text-xs text-destructive">{errorFor("code")}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tat-description">Description</Label>
          <Textarea
            id="tat-description"
            value={draft.description}
            disabled={!canEdit}
            maxLength={400}
            onChange={(event) => mark("description", event.target.value)}
          />
        </div>
        {!draft.id ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="tat-active">Active</Label>
            <Switch
              id="tat-active"
              checked={draft.active}
              disabled={!canEdit}
              onCheckedChange={(active) => mark("active", active)}
            />
          </div>
        ) : null}
        <details className="rounded-lg border border-[#E6E1D8] bg-[#FAF8F5] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[#251605]">
            Advanced Settings
          </summary>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="tat-sort">Sort Order</Label>
            <Input
              id="tat-sort"
              type="number"
              min={0}
              max={999}
              value={draft.sortOrder}
              disabled={!canEdit}
              onChange={(event) => mark("sortOrder", Number(event.target.value) || 0)}
            />
          </div>
        </details>
      </Card3OverlapSheet>

      <AlertDialog open={Boolean(pendingSwitch)} onOpenChange={(open) => !open && setPendingSwitch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this travel agency type. Switching will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                setDirty(false);
                if (target === "__NEW__") {
                  setSelectedId(null);
                  setDraft({
                    ...emptyTravelAgencyTypeDraft(),
                    sortOrder: (types.length + 1) * 10,
                  });
                } else {
                  const row = types.find((item) => item.id === target) ?? null;
                  applyRecord(row);
                }
                setEditorOpen(true);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved travel agency type changes. Closing will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setDirty(false);
                setEditorOpen(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete travel agency type?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.name} ({pendingDelete?.code})? Existing agency
              records will retain their historical classification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
