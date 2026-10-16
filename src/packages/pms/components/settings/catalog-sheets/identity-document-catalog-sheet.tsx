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
  deletePmsCard4IdentityDocumentType,
  getPmsCard4IdentityDocumentTypes,
  reorderPmsCard4IdentityDocumentTypes,
  savePmsCard4IdentityDocumentType,
  setPmsCard4IdentityGlobalSettings,
  setPmsCard4IdentityDocumentTypeActive,
} from "@/packages/pms/lib/identity-documents-card4.functions";
import {
  codeFromIdentityDocumentName,
  emptyIdentityDocumentTypeDraft,
  identityDocumentFlagsForActiveChange,
  normalizeIdentityDocumentCode,
  type IdentityDocumentTypeDraft,
  type IdentityDocumentTypeRecord,
  validateIdentityDocumentTypeDraft,
} from "@/packages/pms/lib/identity-documents-card4.server";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";

function recordToDraft(row: IdentityDocumentTypeRecord): IdentityDocumentTypeDraft {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    documentNumberActive: row.documentNumberActive,
    documentNumberRequired: row.documentNumberRequired,
    issuingCountryActive: row.issuingCountryActive,
    issuingCountryRequired: row.issuingCountryRequired,
    issueDateActive: row.issueDateActive,
    issueDateRequired: row.issueDateRequired,
    expiryDateActive: row.expiryDateActive,
    expiryDateRequired: row.expiryDateRequired,
    issuingAuthorityActive: row.issuingAuthorityActive,
    issuingAuthorityRequired: row.issuingAuthorityRequired,
    scanImageAllowed: row.scanImageAllowed,
    scanImageRequired: row.scanImageRequired,
    requiredAtCheckIn: row.requiredAtCheckIn,
    active: row.active,
    validForProfileTypeIds: [...row.validForProfileTypeIds],
    displayOrder: row.displayOrder,
  };
}

export function IdentityDocumentEditorSheet({
  open,
  onOpenChange,
  restaurantId,
  canEdit,
  documentType,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  canEdit: boolean;
  documentType?: IdentityDocumentTypeRecord | null;
  onSaved?: (docId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getPmsCard4IdentityDocumentTypes);
  const save = useServerFn(savePmsCard4IdentityDocumentType);
  const queryKey = ["pms-card4-identity-documents", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const rows = query.data?.documentTypes ?? [];
  const profileTypes = query.data?.profileTypes ?? [];
  const [draft, setDraft] = useState<IdentityDocumentTypeDraft>(emptyIdentityDocumentTypeDraft());
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    const defaultProfileIds = profileTypes.length > 0 ? profileTypes.map((pt) => pt.id) : [];
    if (documentType) {
      const d = recordToDraft(documentType);
      if (d.validForProfileTypeIds.length === 0 && defaultProfileIds.length > 0) {
        d.validForProfileTypeIds = defaultProfileIds;
      }
      setDraft(d);
      setCodeTouched(true);
    } else {
      const nextOrder = rows.reduce((max, r) => Math.max(max, r.displayOrder), 0) + 1;
      setDraft({
        ...emptyIdentityDocumentTypeDraft(nextOrder),
        validForProfileTypeIds: defaultProfileIds,
      });
      setCodeTouched(false);
    }
  }, [documentType, open, profileTypes, rows]);

  const errors = validateIdentityDocumentTypeDraft(draft, rows, profileTypes);
  const errorFor = (f: string) => errors.find((r) => r.field === f)?.message ?? null;

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          code: normalizeIdentityDocumentCode(draft.code),
          description: draft.description,
          documentNumberActive: draft.documentNumberActive,
          documentNumberRequired: draft.documentNumberRequired,
          issuingCountryActive: draft.issuingCountryActive,
          issuingCountryRequired: draft.issuingCountryRequired,
          issueDateActive: draft.issueDateActive,
          issueDateRequired: draft.issueDateRequired,
          expiryDateActive: draft.expiryDateActive,
          expiryDateRequired: draft.expiryDateRequired,
          issuingAuthorityActive: draft.issuingAuthorityActive,
          issuingAuthorityRequired: draft.issuingAuthorityRequired,
          scanImageAllowed: draft.scanImageAllowed,
          scanImageRequired: draft.scanImageRequired,
          requiredAtCheckIn: draft.requiredAtCheckIn,
          active: draft.active,
          validForProfileTypeIds: draft.validForProfileTypeIds,
          displayOrder: draft.displayOrder,
        },
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["pms-card4-profile-types", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      toast.success("Document type saved successfully.");
      onOpenChange(false);
      onSaved?.(res.id);
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save document type."),
  });

  function mark<K extends keyof IdentityDocumentTypeDraft>(key: K, value: IdentityDocumentTypeDraft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !codeTouched) next.code = codeFromIdentityDocumentName(String(value));
      if (key === "active") {
        const flags = identityDocumentFlagsForActiveChange(Boolean(value), prev.requiredAtCheckIn);
        next.requiredAtCheckIn = flags.requiredAtCheckIn;
      }
      return next;
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{draft.id ? "Edit Document Type" : "Add Document Type"}</SheetTitle>
          <SheetDescription>
            {draft.id
              ? "Update identity document requirements and applicability."
              : "Define a new accepted identity document type."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="idt-name">Document Name *</Label>
            <Input
              id="idt-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(e) => mark("name", e.target.value)}
            />
            {errorFor("name") ? <p className="text-xs text-destructive">{errorFor("name")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idt-code">Document Code *</Label>
            <Input
              id="idt-code"
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
            <Label htmlFor="idt-desc">Description</Label>
            <Textarea
              id="idt-desc"
              value={draft.description}
              disabled={!canEdit}
              onChange={(e) => mark("description", e.target.value)}
            />
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <h4 className="text-xs font-semibold text-[#251605] uppercase tracking-wider">Field Controls</h4>
              <p className="text-[11px] text-muted-foreground">
                Configure which fields are visible and required for this document type.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-[#DDD4C5] p-2.5 bg-[#FAF8F5]">
              {(
                [
                  {
                    label: "Document Number",
                    activeKey: "documentNumberActive" as const,
                    reqKey: "documentNumberRequired" as const,
                  },
                  {
                    label: "Issuing Country",
                    activeKey: "issuingCountryActive" as const,
                    reqKey: "issuingCountryRequired" as const,
                  },
                  {
                    label: "Issue Date",
                    activeKey: "issueDateActive" as const,
                    reqKey: "issueDateRequired" as const,
                  },
                  {
                    label: "Expiry Date",
                    activeKey: "expiryDateActive" as const,
                    reqKey: "expiryDateRequired" as const,
                  },
                  {
                    label: "Issuing Authority",
                    activeKey: "issuingAuthorityActive" as const,
                    reqKey: "issuingAuthorityRequired" as const,
                  },
                  {
                    label: "Front/Back Scan Images",
                    activeKey: "scanImageAllowed" as const,
                    reqKey: "scanImageRequired" as const,
                  },
                ]
              ).map(({ label, activeKey, reqKey }) => {
                const isActive = draft[activeKey];
                const isReq = draft[reqKey];
                return (
                  <div
                    key={activeKey}
                    className="flex items-center justify-between gap-2 rounded-md border border-[#E8E4DC] bg-white px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium text-[#251605]">{label}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Switch
                          checked={isActive}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => {
                            setDraft((curr) => ({
                              ...curr,
                              [activeKey]: checked,
                              ...(checked ? {} : { [reqKey]: false }),
                            }));
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {activeKey === "scanImageAllowed" ? "Allowed" : "Visible"}
                        </span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Switch
                          checked={isReq}
                          disabled={!canEdit || !isActive}
                          onCheckedChange={(checked) => mark(reqKey, checked)}
                        />
                        <span className="text-[10px] text-muted-foreground">Required</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex items-center justify-between border rounded-lg p-2.5">
                <Label htmlFor="idt-checkin" className="text-xs">Required At Check-in</Label>
                <Switch
                  id="idt-checkin"
                  checked={draft.requiredAtCheckIn}
                  disabled={!canEdit || !draft.active}
                  onCheckedChange={(c) => mark("requiredAtCheckIn", c)}
                />
              </div>
              <div className="flex items-center justify-between border rounded-lg p-2.5">
                <Label htmlFor="idt-act" className="text-xs">Active</Label>
                <Switch
                  id="idt-act"
                  checked={draft.active}
                  disabled={!canEdit}
                  onCheckedChange={(c) => mark("active", c)}
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canEdit || saveMutation.isPending || errors.length > 0}
            className="w-full bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 mt-4"
          >
            {saveMutation.isPending ? "Saving…" : draft.id ? "Update Document Type" : "Create Document Type"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function IdentityDocumentCatalogSheet({
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
  const load = useServerFn(getPmsCard4IdentityDocumentTypes);
  const setActive = useServerFn(setPmsCard4IdentityDocumentTypeActive);
  const setGlobalSettings = useServerFn(setPmsCard4IdentityGlobalSettings);
  const reorder = useServerFn(reorderPmsCard4IdentityDocumentTypes);
  const remove = useServerFn(deletePmsCard4IdentityDocumentType);

  const queryKey = ["pms-card4-identity-documents", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const documentTypes = query.data?.documentTypes ?? [];
  const globalSettings = query.data?.identityGlobalSettings ?? {
    active: true,
    checkIn: true,
    reservation: false,
  };
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<IdentityDocumentTypeRecord | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<IdentityDocumentTypeRecord | null>(null);

  const settingsMutation = useMutation({
    mutationFn: (patch: { active?: boolean; checkIn?: boolean; reservation?: boolean }) =>
      setGlobalSettings({ data: { restaurantId, ...patch } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["pms-card4-required-fields", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      toast.success("Identity document settings updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update settings."),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["pms-card4-profile-types", restaurantId] });
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
      toast.success("Document order updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["pms-card4-profile-types", restaurantId] });
      await invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId);
      setPendingDelete(null);
      toast.success("Document type deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle>Manage Identity Document Catalog</SheetTitle>
              <SheetDescription>
                Full catalog management for accepted identity documents.
              </SheetDescription>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReorderIds(documentTypes.map((d) => d.id));
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
                    setSelectedType(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-3.5" /> Add Document Type
                </Button>
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div className="mt-4 rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#DDD4C5]/70">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#251605]">
                  Accept Identity Documents
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    globalSettings.active
                      ? "bg-[#436436] text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {globalSettings.active ? "Active" : "Disabled"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                When disabled, identity document collection is turned off and the identity step is hidden in guest creation.
              </p>
            </div>
            <Switch
              checked={globalSettings.active}
              disabled={!canEdit || settingsMutation.isPending}
              onCheckedChange={(active) => settingsMutation.mutate({ active })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
            <div className="flex items-center justify-between rounded-lg border border-[#E8E4DC] bg-white p-2.5">
              <div className="space-y-0.5 pr-2">
                <Label htmlFor="cat-id-checkin" className="text-xs font-medium text-[#251605]">
                  Required at Check-in
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Enforce a valid identity document before check-in.
                </p>
              </div>
              <Switch
                id="cat-id-checkin"
                checked={globalSettings.active && globalSettings.checkIn}
                disabled={!canEdit || !globalSettings.active || settingsMutation.isPending}
                onCheckedChange={(checkIn) => settingsMutation.mutate({ checkIn })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#E8E4DC] bg-white p-2.5">
              <div className="space-y-0.5 pr-2">
                <Label htmlFor="cat-id-reservation" className="text-xs font-medium text-[#251605]">
                  Required for Reservation
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Require an identity document during reservation.
                </p>
              </div>
              <Switch
                id="cat-id-reservation"
                checked={globalSettings.active && globalSettings.reservation}
                disabled={!canEdit || !globalSettings.active || settingsMutation.isPending}
                onCheckedChange={(reservation) => settingsMutation.mutate({ reservation })}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 border rounded-xl overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Check-in Req</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentTypes.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                  <TableCell>{row.code}</TableCell>
                  <TableCell>{row.requiredAtCheckIn ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      disabled={!canEdit || activeMutation.isPending}
                      onCheckedChange={(active) => activeMutation.mutate({ id: row.id, active })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-medium"
                        onClick={() => {
                          setSelectedType(row);
                          setEditorOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${row.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setSelectedType(row);
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <IdentityDocumentEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          restaurantId={restaurantId}
          canEdit={canEdit}
          documentType={selectedType}
        />

        <Sheet open={reorderOpen} onOpenChange={setReorderOpen}>
          <SheetContent className="overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Reorder Documents</SheetTitle>
              <SheetDescription>Move documents up or down.</SheetDescription>
            </SheetHeader>
            <ol className="mt-4 space-y-2">
              {reorderIds.map((id, index) => {
                const row = documentTypes.find((item) => item.id === id);
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
              <AlertDialogTitle>Delete Document Type?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the document type definition. If it is currently used by guest records or profile types, deletion will be rejected.
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
