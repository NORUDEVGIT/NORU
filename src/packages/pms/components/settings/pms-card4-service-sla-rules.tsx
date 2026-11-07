import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  deletePmsCard4ServiceSlaRule,
  getPmsCard4ServiceSlaRules,
  savePmsCard4ServiceSlaRule,
  setPmsCard4ServiceSlaRuleActive,
} from "@/packages/pms/lib/service-sla-rules-card4.functions";
import {
  emptyServiceSlaRuleDraft,
  formatDurationMinutes,
  selectableSlaServiceTypes,
  validateServiceSlaRuleDraft,
  type ServiceSlaRuleDraft,
  type ServiceSlaRuleRecord,
} from "@/packages/pms/lib/service-sla-rules-card4.server";
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
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Card3OverlapSheet } from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { Switch } from "@/shared/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
function recordToDraft(row: ServiceSlaRuleRecord): ServiceSlaRuleDraft {
  return {
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    responseMinutes: String(row.responseMinutes),
    resolutionMinutes: String(row.resolutionMinutes),
    active: row.active,
  };
}

export function PmsCard4ServiceSlaRules({
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
  const load = useServerFn(getPmsCard4ServiceSlaRules);
  const save = useServerFn(savePmsCard4ServiceSlaRule);
  const setActive = useServerFn(setPmsCard4ServiceSlaRuleActive);
  const remove = useServerFn(deletePmsCard4ServiceSlaRule);
  const queryKey = ["pms-card4-service-sla-rules", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const serviceTypes = query.data?.serviceTypes ?? [];
  const categories = query.data?.categories ?? [];
  const rules = query.data?.rules ?? [];
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceSlaRuleDraft>(emptyServiceSlaRuleDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceSlaRuleRecord | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const handledSaveToken = useRef(saveRequest?.token ?? 0);
  const thenNextRef = useRef(false);

  const errors = validateServiceSlaRuleDraft(draft, rules, serviceTypes);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const serviceTypeFor = (id: string) => serviceTypes.find((row) => row.id === id);
  const categoryName = (categoryId: string) =>
    categories.find((row) => row.id === categoryId)?.name ?? "—";
  const visible = rules.filter((row) => {
    const serviceType = serviceTypeFor(row.serviceTypeId);
    const q = search.trim().toLowerCase();
    return (
      !q ||
      serviceType?.name.toLowerCase().includes(q) ||
      serviceType?.code.toLowerCase().includes(q) ||
      categoryName(serviceType?.categoryId ?? "")
        .toLowerCase()
        .includes(q)
    );
  });
  const editorServiceTypes = selectableSlaServiceTypes(serviceTypes, draft.serviceTypeId).filter(
    (row) =>
      row.id === draft.serviceTypeId ||
      !rules.some((rule) => rule.serviceTypeId === row.id && rule.id !== draft.id),
  );
  const availableType = serviceTypes.find(
    (row) => row.active && !rules.some((rule) => rule.serviceTypeId === row.id),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          serviceTypeId: draft.serviceTypeId,
          responseMinutes: draft.responseMinutes,
          resolutionMinutes: draft.resolutionMinutes,
          active: draft.id
            ? (rules.find((row) => row.id === draft.id)?.active ?? draft.active)
            : draft.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setEditorOpen(false);
      setDirty(false);
      toast.success("SLA rule saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save SLA rule."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "SLA rule enabled." : "SLA rule disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      toast.success("SLA rule deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = saveMutation.isPending || toggleMutation.isPending || deleteMutation.isPending;
  const canSave = canEdit && !busy && (!editorOpen || errors.length === 0) && Boolean(query.data);
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !query.data) {
      toast.error("Unable to save SLA rules.");
      return;
    }
    if (editorOpen && errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the SLA rule before saving.");
      return;
    }
    if (editorOpen && dirty) {
      saveMutation.mutate(undefined, { onSuccess: () => onSaved(thenNextRef.current) });
      return;
    }
    toast.success("SLA rules saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, query.data, editorOpen, errors, dirty, onSaved, saveMutation]);

  function openCreate() {
    setDraft(emptyServiceSlaRuleDraft(availableType?.id ?? ""));
    setDirty(true);
    setEditorOpen(true);
  }

  function openEdit(row: ServiceSlaRuleRecord) {
    setDraft(recordToDraft(row));
    setDirty(false);
    setEditorOpen(true);
  }

  function mark<K extends keyof ServiceSlaRuleDraft>(key: K, value: ServiceSlaRuleDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setPendingClose(true);
    else setEditorOpen(false);
  }

  return (
    <div className="space-y-3" data-testid="card4-service-sla-rules">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-[#251605]">SLA Rules</h2>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            disabled={!availableType}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add SLA Rule
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
            <p className="text-sm text-destructive">Unable to load SLA rules.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-medium text-[#251605]">No SLA rules configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add response/resolution targets to a service type.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-[#CCCCCC] p-3">
              <Input
                value={search}
                placeholder="Search service type, code, or category"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Response Time</TableHead>
                    <TableHead>Resolution Time</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const serviceType = serviceTypeFor(row.serviceTypeId);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-[#251605]">
                          {serviceType?.name ?? "Unknown service type"}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {serviceType?.code}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">{categoryName(serviceType?.categoryId ?? "")}</TableCell>
                        <TableCell className="py-2">{formatDurationMinutes(row.responseMinutes)}</TableCell>
                        <TableCell className="py-2">{formatDurationMinutes(row.resolutionMinutes)}</TableCell>
                        <TableCell className="py-2">
                          <Switch
                            checked={row.active}
                            disabled={!canEdit || toggleMutation.isPending}
                            aria-label={`${row.active ? "Deactivate" : "Activate"} SLA for ${serviceType?.name ?? "service"}`}
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
                                aria-label={`Actions for ${serviceType?.name ?? "SLA rule"}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(row)}>
                                Edit
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Card3OverlapSheet
        open={editorOpen}
        title={draft.id ? "Edit SLA Rule" : "Add SLA Rule"}
        onClose={requestClose}
        onSubmit={() => {
          if (!canEdit || errors.length > 0) {
            toast.error(errors[0]?.message ?? "Fix the SLA rule before saving.");
            return;
          }
          saveMutation.mutate();
        }}
        submitLabel={draft.id ? "Save Changes" : "Add SLA Rule"}
        pending={saveMutation.isPending}
        canEdit={canEdit}
        maxWidth="max-w-[700px]"
        className="max-h-[80vh]"
        footerJustify="between"
      >
        <div className="space-y-1">
          <Label htmlFor="sla-service-type">Service Type *</Label>
          <Select
            value={draft.serviceTypeId || undefined}
            disabled={!canEdit}
            onValueChange={(value) => mark("serviceTypeId", value)}
          >
            <SelectTrigger id="sla-service-type">
              <SelectValue placeholder="Select a service type" />
            </SelectTrigger>
            <SelectContent>
              {editorServiceTypes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name} ({row.code}){row.active ? "" : " — Inactive"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorFor("serviceTypeId") ? (
            <p className="text-xs text-destructive">{errorFor("serviceTypeId")}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="sla-response">Response Time (minutes) *</Label>
          <Input
            id="sla-response"
            type="number"
            min={1}
            step={1}
            value={draft.responseMinutes}
            disabled={!canEdit}
            onChange={(event) => mark("responseMinutes", event.target.value)}
          />
          {errorFor("responseMinutes") ? (
            <p className="text-xs text-destructive">{errorFor("responseMinutes")}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="sla-resolution">Resolution Time (minutes) *</Label>
          <Input
            id="sla-resolution"
            type="number"
            min={1}
            step={1}
            value={draft.resolutionMinutes}
            disabled={!canEdit}
            onChange={(event) => mark("resolutionMinutes", event.target.value)}
          />
          {errorFor("resolutionMinutes") ? (
            <p className="text-xs text-destructive">{errorFor("resolutionMinutes")}</p>
          ) : null}
        </div>
        {!draft.id ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="sla-active">Active</Label>
            <Switch
              id="sla-active"
              checked={draft.active}
              disabled={!canEdit}
              onCheckedChange={(active) => mark("active", active)}
            />
          </div>
        ) : null}
      </Card3OverlapSheet>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SLA Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the configuration only. Historical service records are never deleted.
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
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>Discard them to close this SLA form?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setEditorOpen(false);
                setDirty(false);
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
