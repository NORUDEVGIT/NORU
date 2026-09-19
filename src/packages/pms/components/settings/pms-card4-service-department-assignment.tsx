import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  deletePmsCard4ServiceDepartmentAssignment,
  getPmsCard4ServiceDepartmentAssignments,
  savePmsCard4ServiceDepartmentAssignment,
  setPmsCard4ServiceDepartmentAssignmentActive,
} from "@/packages/pms/lib/service-department-assignment-card4.functions";
import {
  emptyServiceDepartmentAssignmentDraft,
  selectableAssignmentDepartments,
  selectableAssignmentServiceTypes,
  validateServiceDepartmentAssignmentDraft,
  type ServiceDepartmentAssignmentDraft,
  type ServiceDepartmentAssignmentRecord,
} from "@/packages/pms/lib/service-department-assignment-card4.server";
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

function recordToDraft(row: ServiceDepartmentAssignmentRecord): ServiceDepartmentAssignmentDraft {
  return {
    id: row.id,
    serviceTypeId: row.serviceTypeId,
    departmentId: row.departmentId,
    active: row.active,
  };
}

export function PmsCard4ServiceDepartmentAssignment({
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
  const load = useServerFn(getPmsCard4ServiceDepartmentAssignments);
  const save = useServerFn(savePmsCard4ServiceDepartmentAssignment);
  const setActive = useServerFn(setPmsCard4ServiceDepartmentAssignmentActive);
  const remove = useServerFn(deletePmsCard4ServiceDepartmentAssignment);
  const queryKey = ["pms-card4-department-assignment", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const serviceTypes = query.data?.serviceTypes ?? [];
  const categories = query.data?.categories ?? [];
  const departments = query.data?.departments ?? [];
  const assignments = query.data?.assignments ?? [];
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceDepartmentAssignmentDraft>(
    emptyServiceDepartmentAssignmentDraft(),
  );
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceDepartmentAssignmentRecord | null>(
    null,
  );
  const [pendingClose, setPendingClose] = useState(false);
  const handledSaveToken = useRef(0);
  const thenNextRef = useRef(false);

  const errors = validateServiceDepartmentAssignmentDraft(
    draft,
    assignments,
    serviceTypes,
    departments,
  );
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const serviceTypeFor = (id: string) => serviceTypes.find((row) => row.id === id);
  const departmentFor = (id: string) => departments.find((row) => row.id === id);
  const categoryName = (categoryId: string) =>
    categories.find((row) => row.id === categoryId)?.name ?? "—";
  const visible = assignments.filter((row) => {
    const serviceType = serviceTypeFor(row.serviceTypeId);
    const department = departmentFor(row.departmentId);
    const q = search.trim().toLowerCase();
    return (
      !q ||
      serviceType?.name.toLowerCase().includes(q) ||
      serviceType?.code.toLowerCase().includes(q) ||
      department?.name.toLowerCase().includes(q) ||
      department?.code.toLowerCase().includes(q) ||
      categoryName(serviceType?.categoryId ?? "")
        .toLowerCase()
        .includes(q)
    );
  });
  const editorServiceTypes = selectableAssignmentServiceTypes(serviceTypes, draft.serviceTypeId);
  const editorDepartments = selectableAssignmentDepartments(departments, draft.departmentId);
  const activeServiceType = serviceTypes.find((row) => row.active);
  const activeDepartment = departments.find((row) => row.active);
  const canCreate = Boolean(activeServiceType && activeDepartment);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          serviceTypeId: draft.serviceTypeId,
          departmentId: draft.departmentId,
          active: draft.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-service-types", restaurantId],
      });
      setEditorOpen(false);
      setDirty(false);
      toast.success("Department assignment saved successfully.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to save department assignment."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Assignment enabled." : "Assignment disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      toast.success("Department assignment deleted.");
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
      toast.error("Unable to save department assignment.");
      return;
    }
    if (editorOpen && errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the assignment before saving.");
      return;
    }
    if (editorOpen && dirty) {
      saveMutation.mutate(undefined, {
        onSuccess: () => onSaved(thenNextRef.current),
      });
      return;
    }
    toast.success("Department assignment saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, query.data, editorOpen, errors, dirty, onSaved, saveMutation]);

  function openCreate() {
    setDraft(
      emptyServiceDepartmentAssignmentDraft(
        activeServiceType?.id ?? "",
        activeDepartment?.id ?? "",
      ),
    );
    setDirty(true);
    setEditorOpen(true);
  }

  function openEdit(row: ServiceDepartmentAssignmentRecord) {
    setDraft(recordToDraft(row));
    setDirty(false);
    setEditorOpen(true);
  }

  function mark<K extends keyof ServiceDepartmentAssignmentDraft>(
    key: K,
    value: ServiceDepartmentAssignmentDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function requestClose() {
    if (dirty) {
      setPendingClose(true);
      return;
    }
    setEditorOpen(false);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-department-assignment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Department Assignment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which existing department is responsible for each guest service type.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            disabled={!canCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Assignment
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
            <p className="text-sm text-destructive">Unable to load department assignments.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">No department assignments configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCreate
                ? "Assign an active service type to an existing department."
                : "Add an active service type and an active department before assigning."}
            </p>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={openCreate}
                disabled={!canCreate}
              >
                <Plus className="mr-1 size-4" /> Add Assignment
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="border-b border-[#CCCCCC] p-3">
              <Input
                value={search}
                placeholder="Search service type, department, or category"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const serviceType = serviceTypeFor(row.serviceTypeId);
                    const department = departmentFor(row.departmentId);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-[#251605]">
                          {serviceType?.name ?? "Unknown service type"}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {serviceType?.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          {department?.name ?? "Unknown department"}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {department?.code}
                          </span>
                        </TableCell>
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
                            aria-label={`${row.active ? "Disable" : "Enable"} assignment for ${serviceType?.name ?? "service"}`}
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
                                aria-label={`Actions for ${serviceType?.name ?? "assignment"}`}
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
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {draft.id ? "Edit Department Assignment" : "Add Department Assignment"}
            </SheetTitle>
            <SheetDescription>
              Assign an existing PMS department. SLA rules and availability stay separate.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-3 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || errors.length > 0) {
                toast.error(errors[0]?.message ?? "Fix the assignment before saving.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="da-service-type">Service Type *</Label>
              <Select
                value={draft.serviceTypeId || undefined}
                disabled={!canEdit}
                onValueChange={(value) => mark("serviceTypeId", value)}
              >
                <SelectTrigger id="da-service-type">
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
              <Label htmlFor="da-department">Department *</Label>
              <Select
                value={draft.departmentId || undefined}
                disabled={!canEdit}
                onValueChange={(value) => mark("departmentId", value)}
              >
                <SelectTrigger id="da-department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {editorDepartments.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name} ({row.code}){row.active ? "" : " — Inactive"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("departmentId") ? (
                <p className="text-xs text-destructive">{errorFor("departmentId")}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="da-active">Active</Label>
              <Switch
                id="da-active"
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
            <AlertDialogTitle>Delete Department Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the configuration only. Departments, service types, and historical
              guest-service records are never deleted.
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
              Discard them to close this assignment form?
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

export function Card4ServiceDepartmentAssignmentGuide({
  assignmentCount,
  activeDepartmentCount,
}: {
  assignmentCount: number;
  activeDepartmentCount: number;
}) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li className="text-[#436436]">Configure Service Categories</li>
        <li className="text-[#436436]">Add Service Types</li>
        <li className="text-[#436436]">Set Service Pricing</li>
        <li className={assignmentCount > 0 ? "text-[#436436]" : undefined}>Assign Departments</li>
      </ol>
      <p className="mt-3 text-sm text-[#251605]">
        {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"} · {activeDepartmentCount}{" "}
        active department{activeDepartmentCount === 1 ? "" : "s"}
      </p>
    </section>
  );
}
