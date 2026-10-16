import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
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
import { Textarea } from "@/shared/components/ui/textarea";
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
  savePmsCard4IdentityDocumentType,
  setPmsCard4IdentityGlobalSettings,
  setPmsCard4IdentityDocumentTypeActive,
} from "@/packages/pms/lib/identity-documents-card4.functions";
import {
  codeFromIdentityDocumentName,
  emptyIdentityDocumentTypeDraft,
  identityDocumentFlagsForActiveChange,
  identityDocumentTypesConfigured,
  normalizeIdentityDocumentCode,
  validateIdentityDocumentTypeDraft,
  type IdentityDocumentTypeDraft,
  type IdentityDocumentTypeRecord,
} from "@/packages/pms/lib/identity-documents-card4.server";
import { invalidateGuestWorkspaceConfigQueries } from "@/packages/pms/lib/guest-workspace-invalidation";

const PAGE_SIZE = 8;

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

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "default" : "secondary"} className={value ? "bg-[#436436]" : ""}>
      {value ? "Yes" : "No"}
    </Badge>
  );
}

export function PmsCard4IdentityDocuments({
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
  const load = useServerFn(getPmsCard4IdentityDocumentTypes);
  const save = useServerFn(savePmsCard4IdentityDocumentType);
  const setActive = useServerFn(setPmsCard4IdentityDocumentTypeActive);
  const setGlobalSettings = useServerFn(setPmsCard4IdentityGlobalSettings);
  const remove = useServerFn(deletePmsCard4IdentityDocumentType);
  const queryKey = ["pms-card4-identity-documents", restaurantId];
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { restaurantId } }),
    retry: false,
  });

  const rows = query.data?.documentTypes ?? [];
  const profileTypes = query.data?.profileTypes ?? [];
  const globalSettings = query.data?.identityGlobalSettings ?? {
    active: true,
    checkIn: true,
    reservation: false,
  };
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<IdentityDocumentTypeDraft>(emptyIdentityDocumentTypeDraft());
  const [codeTouched, setCodeTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IdentityDocumentTypeRecord | null>(null);
  const [page, setPage] = useState(1);
  const handledSaveToken = useRef(0);

  const errors = validateIdentityDocumentTypeDraft(draft, rows, profileTypes);
  const errorFor = (field: string) => errors.find((row) => row.field === field)?.message ?? null;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, rows.length);
  const visibleRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const invalidateCatalogues = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["pms-card4-profile-types", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["pms-card4-required-fields", restaurantId] }),
      invalidateGuestWorkspaceConfigQueries(queryClient, restaurantId),
    ]);
  };

  const settingsMutation = useMutation({
    mutationFn: (patch: { active?: boolean; checkIn?: boolean; reservation?: boolean }) =>
      setGlobalSettings({ data: { restaurantId, ...patch } }),
    onSuccess: async () => {
      await invalidateCatalogues();
      toast.success("Identity document settings updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to update settings."),
  });

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
    onSuccess: async () => {
      await invalidateCatalogues();
      setEditorOpen(false);
      setDirty(false);
      toast.success("Document type saved successfully.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save document type."),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setActive({ data: { restaurantId, ...input } }),
    onSuccess: invalidateCatalogues,
    onError: (error: Error) => toast.error(error.message || "Unable to update document type."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, id } }),
    onSuccess: async () => {
      await invalidateCatalogues();
      setPendingDelete(null);
      toast.success("Document type deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    saveMutation.isPending ||
    activeMutation.isPending ||
    deleteMutation.isPending ||
    settingsMutation.isPending;
  const configured = identityDocumentTypesConfigured(rows);
  useEffect(() => {
    onSavingChange(busy, canEdit && !busy && !query.isLoading && !query.isError && configured);
  }, [busy, canEdit, configured, onSavingChange, query.isError, query.isLoading]);

  useEffect(() => {
    if (!saveRequest || saveRequest.token === handledSaveToken.current) return;
    handledSaveToken.current = saveRequest.token;
    if (!canEdit || query.isError || !configured) {
      toast.error("Configure at least one active identity document type before continuing.");
      return;
    }
    toast.success("Identity document configuration saved successfully.");
    onSaved(saveRequest.thenNext);
  }, [canEdit, configured, onSaved, query.isError, saveRequest]);

  function openCreate() {
    const nextOrder = rows.reduce((maximum, row) => Math.max(maximum, row.displayOrder), 0) + 1;
    const defaultProfileIds = profileTypes.length > 0 ? profileTypes.map((row) => row.id) : [];
    setDraft({
      ...emptyIdentityDocumentTypeDraft(nextOrder),
      validForProfileTypeIds: defaultProfileIds,
    });
    setCodeTouched(false);
    setDirty(false);
    setEditorOpen(true);
  }

  function openEdit(row: IdentityDocumentTypeRecord) {
    const d = recordToDraft(row);
    if (d.validForProfileTypeIds.length === 0 && profileTypes.length > 0) {
      d.validForProfileTypeIds = profileTypes.map((pt) => pt.id);
    }
    setDraft(d);
    setCodeTouched(true);
    setDirty(false);
    setEditorOpen(true);
  }

  function mark<K extends keyof IdentityDocumentTypeDraft>(
    key: K,
    value: IdentityDocumentTypeDraft[K],
  ) {
    setDraft((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "name" && !codeTouched) {
        next.code = codeFromIdentityDocumentName(String(value));
      }
      if (key === "active") {
        const flags = identityDocumentFlagsForActiveChange(
          Boolean(value),
          previous.requiredAtCheckIn,
        );
        next.requiredAtCheckIn = flags.requiredAtCheckIn;
      }
      return next;
    });
    setDirty(true);
  }

  function requestClose() {
    if (dirty) setPendingClose(true);
    else setEditorOpen(false);
  }

  const lastUpdated = query.data?.lastUpdatedAt
    ? new Date(query.data.lastUpdatedAt).toLocaleString()
    : "Never";

  return (
    <div className="space-y-5" data-testid="card4-identity-documents">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#251605]">Identity Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the accepted identity document types and their requirements.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            onClick={openCreate}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            <Plus className="mr-1 size-4" /> Add Document Type
          </Button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#DDD4C5] bg-[#FAF8F5] p-4 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[#DDD4C5]/70">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#251605]">
                Accept Identity Documents
              </span>
              <Badge
                variant={globalSettings.active ? "default" : "secondary"}
                className={globalSettings.active ? "bg-[#436436]" : ""}
              >
                {globalSettings.active ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              When disabled, identity document collection is turned off and the identity step is hidden in guest creation.
            </p>
          </div>
          <Switch
            checked={globalSettings.active}
            disabled={!canEdit || settingsMutation.isPending}
            onCheckedChange={(active) => settingsMutation.mutate({ active })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex items-center justify-between rounded-xl border border-[#E8E4DC] bg-white p-3">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="id-checkin" className="text-xs font-medium text-[#251605]">
                Required at Check-in
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Enforce a valid identity document before completing guest check-in.
              </p>
            </div>
            <Switch
              id="id-checkin"
              checked={globalSettings.active && globalSettings.checkIn}
              disabled={!canEdit || !globalSettings.active || settingsMutation.isPending}
              onCheckedChange={(checkIn) => settingsMutation.mutate({ checkIn })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E8E4DC] bg-white p-3">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="id-reservation" className="text-xs font-medium text-[#251605]">
                Required for Reservation
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Require an identity document during reservation confirmation.
              </p>
            </div>
            <Switch
              id="id-reservation"
              checked={globalSettings.active && globalSettings.reservation}
              disabled={!canEdit || !globalSettings.active || settingsMutation.isPending}
              onCheckedChange={(reservation) => settingsMutation.mutate({ reservation })}
            />
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#CCCCCC] bg-white">
        <div className="border-b border-[#CCCCCC] px-4 py-3">
          <h3 className="font-medium text-[#251605]">Identity Document Types</h3>
        </div>
        {query.isLoading ? (
          <div className="space-y-3 p-6" aria-label="Loading identity document types">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-6">
            <p className="text-sm text-destructive">Unable to load identity document types.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => query.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-[#251605]">No identity document types configured.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a document type to define which identification documents your property accepts.
            </p>
            {canEdit ? (
              <Button
                type="button"
                className="mt-4 bg-[#C89933] text-[#251605]"
                onClick={openCreate}
              >
                <Plus className="mr-1 size-4" /> Add Document Type
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Doc Number</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Scan/Image</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-[#251605]">{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>
                        <Badge variant={row.documentNumberActive ? (row.documentNumberRequired ? "default" : "secondary") : "outline"} className={row.documentNumberActive && row.documentNumberRequired ? "bg-[#436436]" : ""}>
                          {!row.documentNumberActive ? "Hidden" : row.documentNumberRequired ? "Required" : "Optional"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.issuingCountryActive ? (row.issuingCountryRequired ? "default" : "secondary") : "outline"} className={row.issuingCountryActive && row.issuingCountryRequired ? "bg-[#436436]" : ""}>
                          {!row.issuingCountryActive ? "Hidden" : row.issuingCountryRequired ? "Required" : "Optional"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.issueDateActive ? (row.issueDateRequired ? "default" : "secondary") : "outline"} className={row.issueDateActive && row.issueDateRequired ? "bg-[#436436]" : ""}>
                          {!row.issueDateActive ? "Hidden" : row.issueDateRequired ? "Required" : "Optional"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.expiryDateActive ? (row.expiryDateRequired ? "default" : "secondary") : "outline"} className={row.expiryDateActive && row.expiryDateRequired ? "bg-[#436436]" : ""}>
                          {!row.expiryDateActive ? "Hidden" : row.expiryDateRequired ? "Required" : "Optional"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.scanImageAllowed ? (row.scanImageRequired ? "default" : "secondary") : "outline"} className={row.scanImageAllowed && row.scanImageRequired ? "bg-[#436436]" : ""}>
                          {!row.scanImageAllowed ? "Disabled" : row.scanImageRequired ? "Required" : "Allowed"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.active}
                          disabled={!canEdit || activeMutation.isPending}
                          onCheckedChange={(active) =>
                            activeMutation.mutate({ id: row.id, active })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-medium"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
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
                                    activeMutation.mutate({ id: row.id, active: !row.active })
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {start}–{end} of {rows.length} document types
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <Alert className="border-[#C89933]/40 bg-[#C89933]/5">
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          These settings control which document types and fields are available in the Guest Profile
          module. The actual document collection is handled during check-in and reservation
          processes.
        </AlertDescription>
      </Alert>

      <Sheet open={editorOpen} onOpenChange={(open) => !open && requestClose()}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{draft.id ? "Edit Document Type" : "Add Document Type"}</SheetTitle>
            <SheetDescription>
              Configure the document type. No guest identity data is stored here.
            </SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 space-y-4 px-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit || errors.length > 0) {
                toast.error(errors[0]?.message ?? "Fix the document type before saving.");
                return;
              }
              saveMutation.mutate();
            }}
          >
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-[#251605]">Basic Information</h3>
              <div className="space-y-1">
                <Label htmlFor="doc-name">Document Type Name *</Label>
                <Input
                  id="doc-name"
                  value={draft.name}
                  maxLength={80}
                  disabled={!canEdit}
                  onChange={(event) => mark("name", event.target.value)}
                />
                {errorFor("name") ? (
                  <p className="text-xs text-destructive">{errorFor("name")}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-code">Code *</Label>
                <Input
                  id="doc-code"
                  value={draft.code}
                  maxLength={20}
                  disabled={!canEdit}
                  onChange={(event) => {
                    setCodeTouched(true);
                    mark("code", normalizeIdentityDocumentCode(event.target.value));
                  }}
                />
                {errorFor("code") ? (
                  <p className="text-xs text-destructive">{errorFor("code")}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-description">Description</Label>
                <Textarea
                  id="doc-description"
                  value={draft.description}
                  maxLength={400}
                  disabled={!canEdit}
                  onChange={(event) => mark("description", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{draft.description.length}/400</p>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-[#251605]">Document Field Controls</h3>
                <p className="text-xs text-muted-foreground">
                  Control which fields are visible and which are mandatory when creating or editing guest identity documents.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-[#DDD4C5] p-3 bg-[#FAF8F5]">
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
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#E8E4DC] bg-white px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-[#251605]">{label}</span>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={isActive}
                            disabled={!canEdit}
                            onCheckedChange={(checked) => {
                              setDraft((curr) => ({
                                ...curr,
                                [activeKey]: checked,
                                ...(checked ? {} : { [reqKey]: false }),
                              }));
                              setDirty(true);
                            }}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {activeKey === "scanImageAllowed" ? "Allowed" : "Visible"}
                          </span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={isReq}
                            disabled={!canEdit || !isActive}
                            onCheckedChange={(checked) => mark(reqKey, checked)}
                          />
                          <span className="text-[11px] text-muted-foreground">Required</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium text-[#251605]">Operational Rules</h3>
              <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                <Label htmlFor="doc-requiredAtCheckIn">Required at Check-in</Label>
                <Switch
                  id="doc-requiredAtCheckIn"
                  checked={draft.requiredAtCheckIn}
                  disabled={!canEdit || !draft.active}
                  onCheckedChange={(checked) => mark("requiredAtCheckIn", checked)}
                />
              </div>
              {errorFor("requiredAtCheckIn") ? (
                <p className="text-xs text-destructive">{errorFor("requiredAtCheckIn")}</p>
              ) : null}
              <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                <Label htmlFor="doc-active">Document Type Active</Label>
                <Switch
                  id="doc-active"
                  checked={draft.active}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => mark("active", checked)}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-[#251605]">Additional Settings</h3>
              <div className="space-y-1">
                <Label htmlFor="doc-order">Display Order *</Label>
                <Input
                  id="doc-order"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.displayOrder}
                  disabled={!canEdit}
                  onChange={(event) => mark("displayOrder", Number(event.target.value))}
                />
                {errorFor("displayOrder") ? (
                  <p className="text-xs text-destructive">{errorFor("displayOrder")}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-[#C89933]/30 bg-[#C89933]/5 p-3">
              <p className="text-sm font-medium text-[#251605]">Preview</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.active
                  ? "This document type will be available in guest profile and check-in configuration."
                  : "This document type is inactive and will not be available as an active choice."}
              </p>
              {draft.requiredAtCheckIn ? (
                <p className="mt-1 text-xs text-[#251605]">Required during check-in.</p>
              ) : null}
              {draft.scanImageAllowed ? (
                <p className="mt-1 text-xs text-[#251605]">Document image/scan allowed.</p>
              ) : null}
            </section>

            {canEdit ? (
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="w-full bg-[#C89933] text-[#251605]"
              >
                {saveMutation.isPending ? "Saving…" : "Save Document Type"}
              </Button>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingClose} onOpenChange={(open) => !open && setPendingClose(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Changes to this document type have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingClose(false);
                setEditorOpen(false);
                setDirty(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document Type?</AlertDialogTitle>
            <AlertDialogDescription>
              Referenced document types cannot be deleted. Disable the type to preserve
              configuration and historical references.
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
    </div>
  );
}

export function Card4IdentityDocumentsGuide({ activeCount }: { activeCount: number }) {
  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-[#251605]">Identity Documents</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Configuration only; no guest document data is stored here.</li>
        <li>Inactive types keep their settings and references.</li>
        <li>Guest type assignments use Profile Type IDs.</li>
      </ul>
      <p className="mt-3 text-sm text-[#251605]">{activeCount} active document types</p>
    </section>
  );
}
