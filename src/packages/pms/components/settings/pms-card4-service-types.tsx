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
import {
  deletePmsCard4ServiceType,
  getPmsCard4ServiceTypes,
  savePmsCard4ServiceType,
  setPmsCard4ServiceTypeActive,
} from "@/packages/pms/lib/service-types-card4.functions";
import {
  emptyServiceTypeDraft,
  normalizeServiceTypeCode,
  selectableServiceCategories,
  validateServiceTypeDraft,
  type ServiceTypeDraft,
  type ServiceTypeRecord,
} from "@/packages/pms/lib/service-types-card4.server";
import { cn } from "@/shared/lib/utils";

function recordToDraft(row: ServiceTypeRecord): ServiceTypeDraft {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    active: row.active,
    displayOrder: row.displayOrder,
  };
}

export function PmsCard4ServiceTypes({
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
  const load = useServerFn(getPmsCard4ServiceTypes);
  const save = useServerFn(savePmsCard4ServiceType);
  const setActive = useServerFn(setPmsCard4ServiceTypeActive);
  const remove = useServerFn(deletePmsCard4ServiceType);
  const queryKey = ["pms-card4-service-types", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const categories = query.data?.categories ?? [];
  const types = query.data?.types ?? [];
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ServiceTypeDraft>(emptyServiceTypeDraft());
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceTypeRecord | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const thenNextRef = useRef(false);
  const handledSaveToken = useRef(0);

  const errors = validateServiceTypeDraft(draft, types, categories);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const categoryName = (id: string) => categories.find((row) => row.id === id)?.name ?? "—";
  const visible = types.filter((row) => {
    if (categoryFilter !== "all" && row.categoryId !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      row.code.toLowerCase().includes(q) ||
      categoryName(row.categoryId).toLowerCase().includes(q)
    );
  });
  const editorCategories = selectableServiceCategories(categories, draft.categoryId);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          categoryId: draft.categoryId,
          name: draft.name,
          code: normalizeServiceTypeCode(draft.code),
          description: draft.description,
          active: draft.active,
          displayOrder: draft.displayOrder,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["pms-card4-service-categories", restaurantId],
      });
      setEditorOpen(false);
      setDirty(false);
      toast.success("Service type saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save service type."),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.active ? "Service type enabled." : "Service type disabled.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
      toast.success("Service type deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editorValid = !editorOpen || errors.length === 0;
  const busy = saveMutation.isPending || toggleMutation.isPending;
  const canSave = canEdit && !busy && editorValid && Boolean(query.data);
  useEffect(() => {
    onSavingChange(busy, canSave);
  }, [busy, canSave, onSavingChange]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    thenNextRef.current = saveRequest.thenNext;
    if (!canEdit || !query.data) {
      toast.error("Unable to save service types.");
      return;
    }
    if (editorOpen && errors.length > 0) {
      toast.error(errors[0]?.message ?? "Fix the service type before saving.");
      return;
    }
    if (editorOpen && dirty) {
      saveMutation.mutate(undefined, {
        onSuccess: () => onSaved(thenNextRef.current),
      });
      return;
    }
    toast.success("Service types saved successfully.");
    onSaved(thenNextRef.current);
  }, [saveRequest, canEdit, query.data, editorOpen, errors, dirty, onSaved, saveMutation]);

  function defaultCategoryId() {
    return categories.find((row) => row.active)?.id ?? "";
  }

  function openCreate() {
    const categoryId = defaultCategoryId();
    setDraft(
      emptyServiceTypeDraft(
        categoryId,
        types.filter((row) => row.categoryId === categoryId).length + 1,
      ),
    );
    setDirty(true);
    setEditorOpen(true);
  }

  function openEdit(row: ServiceTypeRecord) {
    setDraft(recordToDraft(row));
    setDirty(false);
    setEditorOpen(true);
  }

  function mark<K extends keyof ServiceTypeDraft>(key: K, value: ServiceTypeDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
    <div className="space-y-5" data-testid="card4-service-types">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Service Types</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define individual guest services under each service category.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            disabled={categories.filter((row) => row.active).length === 0}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Service Type
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
            <p className="text-sm text-destructive">Unable to load service types.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : types.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">No service types configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a service type under a service category.
            </p>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={openCreate}
                disabled={categories.filter((row) => row.active).length === 0}
              >
                <Plus className="mr-1 size-4" /> Add Service Type
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 border-b border-[#CCCCCC] p-3">
              <Input
                className="min-w-[12rem] flex-1"
                value={search}
                placeholder="Search name or code"
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>{categoryName(row.categoryId)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.description ?? "—"}
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
                          aria-label={`${row.active ? "Disable" : "Enable"} ${row.name}`}
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
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(row)}>Edit</DropdownMenuItem>
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
                  ))}
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
            <SheetTitle>{draft.id ? "Edit Service Type" : "Add Service Type"}</SheetTitle>
            <SheetDescription>
              Service types belong to a category. Pricing and SLA rules are configured later.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-3 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || errors.length > 0) {
                toast.error(errors[0]?.message ?? "Fix the service type before saving.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="st-category">Category *</Label>
              <Select
                value={draft.categoryId || undefined}
                disabled={!canEdit}
                onValueChange={(value) => mark("categoryId", value)}
              >
                <SelectTrigger id="st-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {editorCategories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                      {row.active ? "" : " (Inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("categoryId") ? (
                <p className="text-xs text-destructive">{errorFor("categoryId")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="st-name">Service Type Name *</Label>
              <Input
                id="st-name"
                value={draft.name}
                disabled={!canEdit}
                onChange={(event) => mark("name", event.target.value)}
              />
              {errorFor("name") ? (
                <p className="text-xs text-destructive">{errorFor("name")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="st-code">Code *</Label>
              <Input
                id="st-code"
                value={draft.code}
                disabled={!canEdit}
                onChange={(event) => mark("code", normalizeServiceTypeCode(event.target.value))}
              />
              {errorFor("code") ? (
                <p className="text-xs text-destructive">{errorFor("code")}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="st-description">Description</Label>
              <Textarea
                id="st-description"
                value={draft.description}
                disabled={!canEdit}
                maxLength={400}
                onChange={(event) => mark("description", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="st-order">Display Order</Label>
              <Input
                id="st-order"
                type="number"
                min={1}
                value={draft.displayOrder}
                disabled={!canEdit}
                onChange={(event) => mark("displayOrder", Number(event.target.value) || 1)}
              />
              {errorFor("displayOrder") ? (
                <p className="text-xs text-destructive">{errorFor("displayOrder")}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="st-active">Active</Label>
              <Switch
                id="st-active"
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
            <AlertDialogTitle>Delete Service Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the service type from Guest Service configuration.
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
              Discard them to close this service type form?
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

export function Card4ServiceTypesGuide({ count }: { count: number }) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Quick Setup Guide</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li className="text-[#436436]">Configure Service Categories</li>
        <li className={count > 0 ? "text-[#436436]" : undefined}>Add Service Types</li>
        <li>Review and Save</li>
      </ol>
      <p className="mt-3 text-sm text-[#251605]">{count} configured</p>
    </section>
  );
}
