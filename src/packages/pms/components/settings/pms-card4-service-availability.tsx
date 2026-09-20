import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  deletePmsCard4ServiceAvailability,
  getPmsCard4ServiceAvailability,
  savePmsCard4ServiceAvailability,
  setPmsCard4ServiceAvailabilityActive,
} from "@/packages/pms/lib/service-availability-card4.functions";
import {
  SERVICE_AVAILABILITY_DAYS,
  emptyServiceAvailabilityDraft,
  formatAvailabilitySummary,
  selectableAvailabilityServiceTypes,
  validateServiceAvailabilityDraft,
  type ServiceAvailabilityDay,
  type ServiceAvailabilityDraft,
  type ServiceAvailabilityRecord,
  type ServiceAvailabilityWindow,
} from "@/packages/pms/lib/service-availability-card4.server";
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
import { PropertySetupRemoveButton } from "@/packages/pms/components/settings/setup-kit";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { cn } from "@/shared/lib/utils";

function recordToDraft(row: ServiceAvailabilityRecord): ServiceAvailabilityDraft {
  return {
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    weeklySchedule: structuredClone(row.weeklySchedule),
    active: row.active,
  };
}

export function PmsCard4ServiceAvailability({
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
  const load = useServerFn(getPmsCard4ServiceAvailability);
  const save = useServerFn(savePmsCard4ServiceAvailability);
  const setActive = useServerFn(setPmsCard4ServiceAvailabilityActive);
  const remove = useServerFn(deletePmsCard4ServiceAvailability);
  const queryKey = ["pms-card4-service-availability", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const serviceTypes = query.data?.serviceTypes ?? [];
  const categories = query.data?.categories ?? [];
  const availability = query.data?.availability ?? [];
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceAvailabilityDraft>(emptyServiceAvailabilityDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceAvailabilityRecord | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  const errors = validateServiceAvailabilityDraft(draft, availability, serviceTypes);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const serviceTypeFor = (id: string) => serviceTypes.find((row) => row.id === id);
  const categoryName = (categoryId: string) =>
    categories.find((row) => row.id === categoryId)?.name ?? "—";
  const visible = availability.filter((row) => {
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
  const editorServiceTypes = selectableAvailabilityServiceTypes(
    serviceTypes,
    draft.serviceTypeId,
  ).filter(
    (row) =>
      row.id === draft.serviceTypeId ||
      !availability.some(
        (configured) => configured.serviceTypeId === row.id && configured.id !== draft.id,
      ),
  );
  const availableType = serviceTypes.find(
    (row) => row.active && !availability.some((configured) => configured.serviceTypeId === row.id),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          serviceTypeId: draft.serviceTypeId,
          weeklySchedule: draft.weeklySchedule,
          active: draft.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setEditorOpen(false);
      setDirty(false);
      toast.success("Service availability saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save service availability."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        input.active ? "Service availability enabled." : "Service availability disabled.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      toast.success("Service availability deleted.");
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
      toast.error("Unable to save service availability.");
      return;
    }
    if (editorOpen && errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the schedule before saving.");
      return;
    }
    if (editorOpen && dirty) {
      saveMutation.mutate(undefined, {
        onSuccess: () => onSaved(thenNextRef.current),
      });
      return;
    }
    toast.success("Service availability saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, query.data, editorOpen, errors, dirty, onSaved, saveMutation]);

  function openCreate() {
    setDraft(emptyServiceAvailabilityDraft(availableType?.id ?? ""));
    setDirty(true);
    setEditorOpen(true);
  }

  function openEdit(row: ServiceAvailabilityRecord) {
    setDraft(recordToDraft(row));
    setDirty(false);
    setEditorOpen(true);
  }

  function mark<K extends keyof ServiceAvailabilityDraft>(
    key: K,
    value: ServiceAvailabilityDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function setDayWindows(day: ServiceAvailabilityDay, windows: ServiceAvailabilityWindow[]) {
    mark("weeklySchedule", { ...draft.weeklySchedule, [day]: windows });
  }

  function requestClose() {
    if (dirty) setPendingClose(true);
    else setEditorOpen(false);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-service-availability">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Service Availability</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define when each guest service can be offered.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Times use {query.data?.timezone ?? "the property timezone"} · Last updated {lastUpdated}
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            disabled={!availableType}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Availability
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        {query.isLoading ? (
          <div className="space-y-2 p-6">
            {["a", "b", "c"].map((row) => (
              <div key={row} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load service availability.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : availability.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">No availability configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a weekly schedule to an active service type.
            </p>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={openCreate}
                disabled={!availableType}
              >
                <Plus className="mr-1 size-4" /> Add Availability
              </Button>
            ) : null}
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
                    <TableHead>Weekly Availability</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12">Actions</TableHead>
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
                        <TableCell>{categoryName(serviceType?.categoryId ?? "")}</TableCell>
                        <TableCell>{formatAvailabilitySummary(row.weeklySchedule)}</TableCell>
                        <TableCell>{query.data?.timezone ?? "UTC"}</TableCell>
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
                            aria-label={`${row.active ? "Disable" : "Enable"} availability for ${serviceType?.name ?? "service"}`}
                            onCheckedChange={(active) =>
                              toggleMutation.mutate({ id: row.id, active })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${serviceType?.name ?? "availability"}`}
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
                                    toggleMutation.mutate({
                                      id: row.id,
                                      active: !row.active,
                                    })
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <Sheet
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
          else setEditorOpen(true);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {draft.id ? "Edit Service Availability" : "Add Service Availability"}
            </SheetTitle>
            <SheetDescription>
              Configure recurring weekly windows in the property timezone.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-4 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || errors.length > 0) {
                toast.error(errors[0]?.message ?? "Fix the schedule before saving.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="availability-service-type">Service Type *</Label>
              <Select
                value={draft.serviceTypeId || undefined}
                disabled={!canEdit}
                onValueChange={(value) => mark("serviceTypeId", value)}
              >
                <SelectTrigger id="availability-service-type">
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

            <div className="space-y-3">
              <div>
                <Label>Weekly Schedule *</Label>
                <p className="text-xs text-muted-foreground">
                  Add one or more non-overlapping windows for each available day.
                </p>
              </div>
              {SERVICE_AVAILABILITY_DAYS.map((day) => {
                const windows = draft.weeklySchedule[day.id];
                const enabled = windows.length > 0;
                return (
                  <div key={day.id} className="space-y-2 rounded-lg border border-[#CCCCCC] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={`availability-${day.id}`}>{day.label}</Label>
                      <Switch
                        id={`availability-${day.id}`}
                        checked={enabled}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          setDayWindows(day.id, checked ? [{ start: "08:00", end: "17:00" }] : [])
                        }
                      />
                    </div>
                    {windows.map((window, index) => (
                      <div
                        key={`${day.id}-${index}`}
                        className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`${day.id}-${index}-start`}>
                            Start
                          </Label>
                          <Input
                            id={`${day.id}-${index}-start`}
                            type="time"
                            value={window.start}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setDayWindows(
                                day.id,
                                windows.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, start: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`${day.id}-${index}-end`}>
                            End
                          </Label>
                          <Input
                            id={`${day.id}-${index}-end`}
                            type="time"
                            value={window.end}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setDayWindows(
                                day.id,
                                windows.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, end: event.target.value } : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <PropertySetupRemoveButton
                          disabled={!canEdit}
                          label={`Remove ${day.label} window ${index + 1}`}
                          onClick={() =>
                            setDayWindows(
                              day.id,
                              windows.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        />
                      </div>
                    ))}
                    {enabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() =>
                          setDayWindows(day.id, [...windows, { start: "08:00", end: "17:00" }])
                        }
                      >
                        <Plus className="mr-1 size-3.5" /> Add Window
                      </Button>
                    ) : null}
                    {errorFor(day.id) ? (
                      <p className="text-xs text-destructive">{errorFor(day.id)}</p>
                    ) : null}
                  </div>
                );
              })}
              {errorFor("weeklySchedule") ? (
                <p className="text-xs text-destructive">{errorFor("weeklySchedule")}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="availability-active">Active</Label>
              <Switch
                id="availability-active"
                checked={draft.active}
                disabled={!canEdit}
                onCheckedChange={(active) => mark("active", active)}
              />
            </div>
            <Button
              type="submit"
              disabled={!canEdit || saveMutation.isPending || errors.length > 0}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Availability?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes only the recurring configuration. Historical service records are never
              deleted.
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
            <AlertDialogDescription>
              Discard them to close this availability form?
            </AlertDialogDescription>
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

export function Card4ServiceAvailabilityGuide({
  configuredCount,
  activeServiceTypeCount,
}: {
  configuredCount: number;
  activeServiceTypeCount: number;
}) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li className="text-[#436436]">Configure Service Categories</li>
        <li className="text-[#436436]">Add Service Types</li>
        <li className="text-[#436436]">Set Service Pricing</li>
        <li className="text-[#436436]">Assign Departments</li>
        <li className="text-[#436436]">Set SLA Rules</li>
        <li className={configuredCount > 0 ? "text-[#436436]" : undefined}>
          Set Service Availability
        </li>
      </ol>
      <p className="mt-3 text-sm text-[#251605]">
        {configuredCount} of {activeServiceTypeCount} active services have availability
      </p>
    </section>
  );
}
