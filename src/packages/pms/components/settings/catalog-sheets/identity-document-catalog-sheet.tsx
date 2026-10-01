import { useEffect, useState } from "react";
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
    issuingCountryRequired: row.issuingCountryRequired,
    expiryDateRequired: row.expiryDateRequired,
    documentNumberRequired: row.documentNumberRequired,
    scanImageAllowed: row.scanImageAllowed,
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
    if (documentType) {
      setDraft(recordToDraft(documentType));
      setCodeTouched(true);
    } else {
      const nextOrder = rows.reduce((max, r) => Math.max(max, r.displayOrder), 0) + 1;
      setDraft({
        ...emptyIdentityDocumentTypeDraft(nextOrder),
        validForProfileTypeIds: profileTypes.filter((pt) => pt.active).map((pt) => pt.id),
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
          issuingCountryRequired: draft.issuingCountryRequired,
          expiryDateRequired: draft.expiryDateRequired,
          documentNumberRequired: draft.documentNumberRequired,
          scanImageAllowed: draft.scanImageAllowed,
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

  function toggleProfileType(id: string, enabled: boolean) {
    setDraft((prev) => ({
      ...prev,
      validForProfileTypeIds: enabled
        ? [...new Set([...prev.validForProfileTypeIds, id])]
        : prev.validForProfileTypeIds.filter((item) => item !== id),
    }));
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

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="idt-country" className="text-xs">Issuing Country Req</Label>
              <Switch
                id="idt-country"
                checked={draft.issuingCountryRequired}
                disabled={!canEdit}
                onCheckedChange={(c) => mark("issuingCountryRequired", c)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="idt-expiry" className="text-xs">Expiry Date Req</Label>
              <Switch
                id="idt-expiry"
                checked={draft.expiryDateRequired}
                disabled={!canEdit}
                onCheckedChange={(c) => mark("expiryDateRequired", c)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="idt-num" className="text-xs">Doc Number Req</Label>
              <Switch
                id="idt-num"
                checked={draft.documentNumberRequired}
                disabled={!canEdit}
                onCheckedChange={(c) => mark("documentNumberRequired", c)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-2.5">
              <Label htmlFor="idt-scan" className="text-xs">Scan/Image Allowed</Label>
              <Switch
                id="idt-scan"
                checked={draft.scanImageAllowed}
                disabled={!canEdit}
                onCheckedChange={(c) => mark("scanImageAllowed", c)}
              />
            </div>
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

          <div className="space-y-2 pt-2 border-t">
            <Label>Applicable Guest Profile Types</Label>
            <div className="grid grid-cols-2 gap-2">
              {profileTypes.map((pt) => (
                <div key={pt.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`pt-${pt.id}`}
                    checked={draft.validForProfileTypeIds.includes(pt.id)}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => toggleProfileType(pt.id, checked === true)}
                  />
                  <Label htmlFor={`pt-${pt.id}`} className="font-normal text-xs">
                    {pt.name}
                  </Label>
                </div>
              ))}
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
  const reorder = useServerFn(reorderPmsCard4IdentityDocumentTypes);
  const remove = useServerFn(deletePmsCard4IdentityDocumentType);

  const queryKey = ["pms-card4-identity-documents", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const documentTypes = query.data?.documentTypes ?? [];
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<IdentityDocumentTypeRecord | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<IdentityDocumentTypeRecord | null>(null);

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

        <div className="mt-4 border rounded-xl overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Check-in Req</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
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
