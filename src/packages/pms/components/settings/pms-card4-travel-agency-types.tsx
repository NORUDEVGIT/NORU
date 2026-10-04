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
  deletePmsCard4TravelAgencyType,
  getPmsCard4TravelAgencyTypes,
  savePmsCard4TravelAgencyType,
  setPmsCard4TravelAgencyTypeActive,
} from "@/packages/pms/lib/travel-agency-types-card4.functions";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";
import {
  DEFAULT_TRAVEL_AGENCY_TYPES,
  emptyTravelAgencyTypeDraft,
  normalizeTravelAgencyTypeCode,
  validateTravelAgencyTypeDraft,
  type TravelAgencyTypeDraft,
  type TravelAgencyTypeRecord,
} from "@/packages/pms/lib/travel-agency-types-card4.server";
import { cn } from "@/shared/lib/utils";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TravelAgencyTypeDraft>(emptyTravelAgencyTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TravelAgencyTypeRecord | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  useEffect(() => {
    if (!query.data) return;
    if (selectedId && query.data.types.some((row) => row.id === selectedId)) return;
    const first = query.data.types[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? recordToDraft(first) : emptyTravelAgencyTypeDraft());
    setDirty(false);
  }, [query.data, selectedId]);

  function applyRecord(row: TravelAgencyTypeRecord | null) {
    setSelectedId(row?.id ?? null);
    setDraft(row ? recordToDraft(row) : emptyTravelAgencyTypeDraft());
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

  function startCreate() {
    if (dirty) {
      setPendingSwitch("__NEW__");
      return;
    }
    setSelectedId(null);
    setDraft({
      ...emptyTravelAgencyTypeDraft(),
      sortOrder: (types.length + 1) * 10,
    });
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
          active: draft.active,
          sortOrder: draft.sortOrder,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-create-context", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setDirty(false);
      setSelectedId(result.id);
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
      if (draft.id === input.id) mark("active", input.active);
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

  const configuredCount = types.length;
  const activeCount = types.filter((row) => row.active).length;
  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Default catalogue active";

  return (
    <div className="space-y-5" data-testid="card4-travel-agency-types">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#251605]">Travel Agency Types</h2>
          <p className="text-xs text-muted-foreground">
            Configure the travel agency categories staff can pick when creating a travel agency.
            Settings is the single source of truth for all operational agency profiles.
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={startCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D] text-xs h-8"
          >
            <Plus className="mr-1 size-3.5" /> New Agency Type
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#CCCCCC] bg-white overflow-hidden">
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading travel agency types…</p>
        ) : types.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
            <p>No travel agency types configured yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#CCCCCC]">
                <TableHead className="text-xs font-semibold text-[#251605]">Code</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Name</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605]">Description</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605] text-center w-20">Order</TableHead>
                <TableHead className="text-xs font-semibold text-[#251605] text-center w-24">Active</TableHead>
                <TableHead className="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((row) => {
                const isSelected = row.id === selectedId;
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => requestSelect(row.id)}
                    className={cn(
                      "cursor-pointer border-b border-[#CCCCCC]/60 transition-colors",
                      isSelected ? "bg-[#FAF8F5]" : "hover:bg-[#FAF8F5]/50",
                    )}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-[#251605]">
                      {row.code}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-[#251605]">{row.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[20rem] truncate">
                      {row.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-center text-muted-foreground">{row.sortOrder}</TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Switch
                        checked={row.active}
                        disabled={!canEdit || toggleMutation.isPending}
                        onCheckedChange={(active) => toggleMutation.mutate({ id: row.id, active })}
                        aria-label={`Toggle active for ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      {canEdit ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => requestSelect(row.id)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setPendingDelete(row)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-[#251605]">
            {draft.id ? "Edit Travel Agency Type" : "New Travel Agency Type"}
          </h3>
          <p className="text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tat-code">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tat-code"
              value={draft.code}
              disabled={!canEdit}
              maxLength={12}
              className="rounded-[6px] border-[#CCCCCC]"
              onChange={(event) => mark("code", normalizeTravelAgencyTypeCode(event.target.value))}
            />
            {errorFor("code") ? (
              <p className="text-xs text-destructive">{errorFor("code")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Unique short code (e.g. OTA, TMC, CORP).</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tat-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tat-name"
              value={draft.name}
              disabled={!canEdit}
              maxLength={120}
              className="rounded-[6px] border-[#CCCCCC]"
              onChange={(event) => mark("name", event.target.value)}
            />
            {errorFor("name") ? (
              <p className="text-xs text-destructive">{errorFor("name")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Display label in creation dropdown.</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tat-description">Description</Label>
          <Textarea
            id="tat-description"
            value={draft.description}
            disabled={!canEdit}
            maxLength={400}
            className="rounded-[6px] border-[#CCCCCC]"
            onChange={(event) => mark("description", event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{draft.description.length}/400 characters</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <Switch
              id="tat-active"
              checked={draft.active}
              disabled={!canEdit}
              onCheckedChange={(active) => mark("active", active)}
            />
            <Label htmlFor="tat-active" className="cursor-pointer text-xs">
              Active (available in agency creation dropdown)
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="tat-sort" className="text-xs text-muted-foreground">
              Sort order
            </Label>
            <Input
              id="tat-sort"
              type="number"
              min={0}
              max={999}
              value={draft.sortOrder}
              disabled={!canEdit}
              className="w-20 text-xs rounded-[6px] border-[#CCCCCC]"
              onChange={(event) => mark("sortOrder", Number(event.target.value) || 0)}
            />
          </div>
        </div>
      </section>

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
                  setDraft({ ...emptyTravelAgencyTypeDraft(), sortOrder: (types.length + 1) * 10 });
                } else {
                  const row = types.find((item) => item.id === target) ?? null;
                  applyRecord(row);
                }
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

export function Card4TravelAgencyTypesGuide({ count }: { count: number }) {
  const target = Math.max(count, DEFAULT_TRAVEL_AGENCY_TYPES.length);
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <p className="mt-2 text-sm text-[#251605]">
        Travel Agency Types
        <span className="mt-1 block text-muted-foreground">
          {count} of {target} configured
        </span>
      </p>
    </section>
  );
}

