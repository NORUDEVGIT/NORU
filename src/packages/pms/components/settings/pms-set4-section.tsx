import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";
import {
  HK_STATUS_LABELS,
  SET4_CATEGORIES_WARNING,
  SET4_CLEANING_WARNING,
  SET4_HK_HREF,
  SET4_HK_UNAVAILABLE,
  SET4_HK_UNSAVED,
  SET4_MAINT_HREF,
  SET4_MAINT_UNAVAILABLE,
  SET4_OOO_UNSAVED,
  SET4_PRIORITIES_WARNING,
  SET4_REASONS_WARNING,
  SET4_RI_HREF,
  SET4_RI_UNAVAILABLE,
  SET4_SLA_WARNING,
  SET4_STOCK_HELPER_HREF,
  SET4_TAGS_WARNING,
  type HkCleaningPosture,
  type HkStatusRules,
  type MaintenanceSla,
  type OooOosPosture,
  type PmsSet4CatalogueItem,
  type Set4Snapshot,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import {
  savePmsHkCleaningPosture,
  savePmsHkStatusRules,
  savePmsMaintenanceCategory,
  savePmsMaintenancePriority,
  savePmsMaintenanceSla,
  savePmsMaintenanceTypeTag,
  savePmsOooOosPosture,
  savePmsRestrictionReason,
} from "@/packages/pms/lib/pms-set4-hk-inventory.functions";

function refreshSet4(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set4-snapshot", restaurantId] });
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function CatalogueList({
  rows,
  canEdit,
  onEdit,
  onToggle,
}: {
  rows: PmsSet4CatalogueItem[];
  canEdit: boolean;
  onEdit: (row: PmsSet4CatalogueItem) => void;
  onToggle: (row: PmsSet4CatalogueItem) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
          <div>
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.code} · {row.active ? "Active" : "Inactive"}
            </p>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => onToggle(row)}>
                {row.active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CatalogueDialog({
  open,
  onOpenChange,
  title,
  row,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  row: PmsSet4CatalogueItem | null;
  saving: boolean;
  onSubmit: (values: { id?: string; code: string; name: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setActive(row?.active ?? true);
  }, [open, row]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`set4-cat-name-${title}`}>Name</Label>
            <Input id={`set4-cat-name-${title}`} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`set4-cat-code-${title}`}>Code</Label>
            <Input id={`set4-cat-code-${title}`} value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !code.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(row?.id ? { id: row.id } : {}), name, code, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Set4HousekeepingSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set4Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveStatuses = useServerFn(savePmsHkStatusRules);
  const saveCleaning = useServerFn(savePmsHkCleaningPosture);
  const [statusDraft, setStatusDraft] = useState<HkStatusRules>(snapshot.statusRules);
  const [cleaningDraft, setCleaningDraft] = useState<HkCleaningPosture>(snapshot.cleaningPosture);

  useEffect(() => {
    setStatusDraft(snapshot.statusRules);
  }, [snapshot.statusRules]);
  useEffect(() => {
    setCleaningDraft(snapshot.cleaningPosture);
  }, [snapshot.cleaningPosture]);

  const statusMutation = useMutation({
    mutationFn: () => saveStatuses({ data: { restaurantId, statuses: statusDraft.statuses } }),
    onSuccess: () => {
      toast.success("Housekeeping statuses saved.");
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cleaningMutation = useMutation({
    mutationFn: () =>
      saveCleaning({
        data: {
          restaurantId,
          types: cleaningDraft.types,
          priorities: cleaningDraft.priorities,
          inspectionGate: cleaningDraft.inspectionGate,
          serviceTiming: cleaningDraft.serviceTiming,
        },
      }),
    onSuccess: () => {
      toast.success("Cleaning posture saved.");
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["housekeeping-rules"];

  return (
    <section id="housekeeping-rules" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set4-housekeeping">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Housekeeping rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Status labels and cleaning posture. Tasks stay on the Housekeeping workspace — this is not a second board.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.hkColumnsAvailable ? (
        <p className="text-sm text-muted-foreground">{SET4_HK_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!statusDraft.savedAt ? <p className="text-sm text-[#C89933]">{SET4_HK_UNSAVED}</p> : null}
          <div className="space-y-3">
            <h3 className="font-medium text-[#251605]">Statuses</h3>
            <p className="text-xs text-muted-foreground">Dirty, clean and inspected must stay active. Pick-up is optional.</p>
            {statusDraft.statuses.map((row) => (
              <div key={row.code} className="grid gap-3 rounded-xl border border-border px-3 py-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor={`set4-hk-${row.code}`}>{HK_STATUS_LABELS[row.code]}</Label>
                  <Input
                    id={`set4-hk-${row.code}`}
                    value={row.label}
                    disabled={!canEdit}
                    onChange={(event) =>
                      setStatusDraft((prev) => ({
                        ...prev,
                        statuses: prev.statuses.map((item) => (item.code === row.code ? { ...item, label: event.target.value } : item)),
                      }))
                    }
                  />
                </div>
                <ToggleRow
                  id={`set4-hk-active-${row.code}`}
                  label="Active"
                  checked={row.active}
                  disabled={!canEdit || row.code !== "pickup"}
                  onCheckedChange={(checked) =>
                    setStatusDraft((prev) => ({
                      ...prev,
                      statuses: prev.statuses.map((item) => (item.code === row.code ? { ...item, active: checked } : item)),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate()}
            >
              {statusMutation.isPending ? "Saving…" : "Save statuses"}
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-medium text-[#251605]">Cleaning types</h3>
            {!cleaningDraft.savedAt || cleaningDraft.types.filter((row) => row.active).length === 0 ? (
              <p className="text-sm text-[#C89933]">{SET4_CLEANING_WARNING}</p>
            ) : null}
            {cleaningDraft.types.map((row) => (
              <ToggleRow
                key={row.code}
                id={`set4-clean-${row.code}`}
                label={row.label}
                checked={row.active}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setCleaningDraft((prev) => ({
                    ...prev,
                    types: prev.types.map((item) => (item.code === row.code ? { ...item, active: checked } : item)),
                  }))
                }
              />
            ))}
            <h3 className="font-medium text-[#251605]">Cleaning priorities</h3>
            {cleaningDraft.priorities.map((row) => (
              <ToggleRow
                key={row.code}
                id={`set4-pri-${row.code}`}
                label={row.label}
                checked={row.active}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setCleaningDraft((prev) => ({
                    ...prev,
                    priorities: prev.priorities.map((item) => (item.code === row.code ? { ...item, active: checked } : item)),
                  }))
                }
              />
            ))}
            <ToggleRow
              id="set4-inspection-gate"
              label="Inspection gate — rooms stay not ready until inspected"
              checked={cleaningDraft.inspectionGate}
              disabled={!canEdit}
              onCheckedChange={(checked) => setCleaningDraft((prev) => ({ ...prev, inspectionGate: checked }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="set4-morning-from">Morning service from</Label>
                <Input
                  id="set4-morning-from"
                  type="time"
                  value={cleaningDraft.serviceTiming.morningFrom}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCleaningDraft((prev) => ({
                      ...prev,
                      serviceTiming: { ...prev.serviceTiming, morningFrom: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set4-morning-to">Morning service to</Label>
                <Input
                  id="set4-morning-to"
                  type="time"
                  value={cleaningDraft.serviceTiming.morningTo}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCleaningDraft((prev) => ({
                      ...prev,
                      serviceTiming: { ...prev.serviceTiming, morningTo: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set4-evening-from">Evening service from</Label>
                <Input
                  id="set4-evening-from"
                  type="time"
                  value={cleaningDraft.serviceTiming.eveningFrom}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCleaningDraft((prev) => ({
                      ...prev,
                      serviceTiming: { ...prev.serviceTiming, eveningFrom: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set4-evening-to">Evening service to</Label>
                <Input
                  id="set4-evening-to"
                  type="time"
                  value={cleaningDraft.serviceTiming.eveningTo}
                  disabled={!canEdit}
                  onChange={(event) =>
                    setCleaningDraft((prev) => ({
                      ...prev,
                      serviceTiming: { ...prev.serviceTiming, eveningTo: event.target.value },
                    }))
                  }
                />
              </div>
            </div>
            {canEdit ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={cleaningMutation.isPending}
                onClick={() => cleaningMutation.mutate()}
              >
                {cleaningMutation.isPending ? "Saving…" : "Save cleaning posture"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET4_HK_HREF} data-testid="set4-open-housekeeping">
          Open housekeeping
        </a>
      </Button>
    </section>
  );
}

export function Set4RoomInventorySection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set4Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveOoo = useServerFn(savePmsOooOosPosture);
  const saveReason = useServerFn(savePmsRestrictionReason);
  const [draft, setDraft] = useState<OooOosPosture>(snapshot.oooOosPosture);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<PmsSet4CatalogueItem | null>(null);

  useEffect(() => {
    setDraft(snapshot.oooOosPosture);
  }, [snapshot.oooOosPosture]);

  const oooMutation = useMutation({
    mutationFn: () =>
      saveOoo({
        data: {
          restaurantId,
          oooMeaning: draft.oooMeaning,
          oosMeaning: draft.oosMeaning,
          reasonRequired: draft.reasonRequired,
          expectedReturnRequired: draft.expectedReturnRequired,
        },
      }),
    onSuccess: () => {
      toast.success("OOO and OOS meaning saved.");
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reasonMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveReason({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Restriction reason saved.");
      setReasonOpen(false);
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["room-inventory-rules"];

  return (
    <section id="room-inventory-rules" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set4-room-inventory">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Room inventory rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Out of order versus out of service. Rooms stay on Room Inventory — this is not stock inventory.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.oooOosAvailable ? (
        <p className="text-sm text-muted-foreground">{SET4_RI_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!draft.savedAt ? <p className="text-sm text-[#C89933]">{SET4_OOO_UNSAVED}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="set4-ooo-meaning">Out of order</Label>
            <textarea
              id="set4-ooo-meaning"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.oooMeaning}
              disabled={!canEdit}
              onChange={(event) => setDraft((prev) => ({ ...prev, oooMeaning: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set4-oos-meaning">Out of service</Label>
            <textarea
              id="set4-oos-meaning"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.oosMeaning}
              disabled={!canEdit}
              onChange={(event) => setDraft((prev) => ({ ...prev, oosMeaning: event.target.value }))}
            />
          </div>
          <ToggleRow
            id="set4-reason-required"
            label="Reason required"
            checked={draft.reasonRequired}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, reasonRequired: checked }))}
          />
          <ToggleRow
            id="set4-return-required"
            label="Expected return required"
            checked={draft.expectedReturnRequired}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, expectedReturnRequired: checked }))}
          />
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={oooMutation.isPending}
              onClick={() => oooMutation.mutate()}
            >
              {oooMutation.isPending ? "Saving…" : "Save OOO and OOS meaning"}
            </Button>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90" asChild>
          <a href={SET4_RI_HREF} data-testid="set4-open-room-inventory">
            Open room inventory
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={SET4_STOCK_HELPER_HREF} data-testid="set4-open-stock-inventory">
            Open stock inventory
          </a>
        </Button>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">Restriction reasons</h3>
          {canEdit && snapshot.cataloguesAvailable ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingReason(null);
                setReasonOpen(true);
              }}
            >
              Add reason
            </Button>
          ) : null}
        </div>
        {!snapshot.cataloguesAvailable ? (
          <p className="text-sm text-muted-foreground">{SET4_RI_UNAVAILABLE}</p>
        ) : snapshot.restrictionReasons.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET4_REASONS_WARNING}</p>
        ) : (
          <CatalogueList
            rows={snapshot.restrictionReasons}
            canEdit={canEdit}
            onEdit={(row) => {
              setEditingReason(row);
              setReasonOpen(true);
            }}
            onToggle={(row) => reasonMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })}
          />
        )}
      </div>

      <CatalogueDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        title={editingReason ? "Edit restriction reason" : "Add restriction reason"}
        row={editingReason}
        saving={reasonMutation.isPending}
        onSubmit={(values) => reasonMutation.mutate(values)}
      />
    </section>
  );
}

export function Set4MaintenanceSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set4Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveSla = useServerFn(savePmsMaintenanceSla);
  const saveCategory = useServerFn(savePmsMaintenanceCategory);
  const savePriority = useServerFn(savePmsMaintenancePriority);
  const saveTag = useServerFn(savePmsMaintenanceTypeTag);
  const [sla, setSla] = useState<MaintenanceSla>(snapshot.maintenanceSla);
  const [catOpen, setCatOpen] = useState(false);
  const [priOpen, setPriOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PmsSet4CatalogueItem | null>(null);
  const [editingPri, setEditingPri] = useState<PmsSet4CatalogueItem | null>(null);
  const [editingTag, setEditingTag] = useState<PmsSet4CatalogueItem | null>(null);

  useEffect(() => {
    setSla(snapshot.maintenanceSla);
  }, [snapshot.maintenanceSla]);

  const slaMutation = useMutation({
    mutationFn: () =>
      saveSla({
        data: {
          restaurantId,
          acknowledgeHours: sla.acknowledgeHours,
          resolveHours: sla.resolveHours,
          guidance: sla.guidance,
        },
      }),
    onSuccess: () => {
      toast.success("Maintenance guidance saved.");
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const catMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveCategory({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Category saved.");
      setCatOpen(false);
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const priMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      savePriority({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Priority saved.");
      setPriOpen(false);
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const tagMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveTag({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Type tag saved.");
      setTagOpen(false);
      refreshSet4(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains["maintenance-rules"];

  return (
    <section id="maintenance-rules" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set4-maintenance">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Maintenance rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Categories, priorities, type tags and thin acknowledge or resolve guidance. Requests stay on Maintenance — this is not a work-order system.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.oooOosAvailable ? (
        <p className="text-sm text-muted-foreground">{SET4_MAINT_UNAVAILABLE}</p>
      ) : (
        <div className="space-y-4">
          {!sla.savedAt ? <p className="text-sm text-[#C89933]">{SET4_SLA_WARNING}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set4-ack-hours">Acknowledge within (hours)</Label>
              <Input
                id="set4-ack-hours"
                type="number"
                min={0}
                value={sla.acknowledgeHours ?? ""}
                disabled={!canEdit}
                onChange={(event) =>
                  setSla((prev) => ({
                    ...prev,
                    acknowledgeHours: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set4-resolve-hours">Resolve within (hours)</Label>
              <Input
                id="set4-resolve-hours"
                type="number"
                min={0}
                value={sla.resolveHours ?? ""}
                disabled={!canEdit}
                onChange={(event) =>
                  setSla((prev) => ({
                    ...prev,
                    resolveHours: event.target.value.trim() ? Number(event.target.value) : null,
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set4-sla-guidance">Guidance</Label>
            <textarea
              id="set4-sla-guidance"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sla.guidance}
              disabled={!canEdit}
              onChange={(event) => setSla((prev) => ({ ...prev, guidance: event.target.value }))}
            />
          </div>
          {canEdit ? (
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={slaMutation.isPending}
              onClick={() => slaMutation.mutate()}
            >
              {slaMutation.isPending ? "Saving…" : "Save guidance"}
            </Button>
          ) : null}
        </div>
      )}

      <Button variant="outline" asChild>
        <a href={SET4_MAINT_HREF} data-testid="set4-open-maintenance">
          Open maintenance
        </a>
      </Button>

      <CatalogueBlock
        title="Categories"
        helper="Typical codes are plumbing, electrical, furniture, equipment and other. Empty is a warning, not a block."
        warning={SET4_CATEGORIES_WARNING}
        unavailable={SET4_MAINT_UNAVAILABLE}
        available={snapshot.cataloguesAvailable}
        rows={snapshot.maintenanceCategories}
        canEdit={canEdit}
        addLabel="Add category"
        onAdd={() => {
          setEditingCat(null);
          setCatOpen(true);
        }}
        onEdit={(row) => {
          setEditingCat(row);
          setCatOpen(true);
        }}
        onToggle={(row) => catMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })}
      />
      <CatalogueBlock
        title="Priorities"
        helper="Typical codes are normal, high and urgent."
        warning={SET4_PRIORITIES_WARNING}
        unavailable={SET4_MAINT_UNAVAILABLE}
        available={snapshot.cataloguesAvailable}
        rows={snapshot.maintenancePriorities}
        canEdit={canEdit}
        addLabel="Add priority"
        onAdd={() => {
          setEditingPri(null);
          setPriOpen(true);
        }}
        onEdit={(row) => {
          setEditingPri(row);
          setPriOpen(true);
        }}
        onToggle={(row) => priMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })}
      />
      <CatalogueBlock
        title="Type tags"
        helper="Typical codes are preventive, corrective, emergency and inspection."
        warning={SET4_TAGS_WARNING}
        unavailable={SET4_MAINT_UNAVAILABLE}
        available={snapshot.cataloguesAvailable}
        rows={snapshot.maintenanceTypeTags}
        canEdit={canEdit}
        addLabel="Add type tag"
        onAdd={() => {
          setEditingTag(null);
          setTagOpen(true);
        }}
        onEdit={(row) => {
          setEditingTag(row);
          setTagOpen(true);
        }}
        onToggle={(row) => tagMutation.mutate({ id: row.id, code: row.code, name: row.name, active: !row.active })}
      />

      <CatalogueDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        title={editingCat ? "Edit category" : "Add category"}
        row={editingCat}
        saving={catMutation.isPending}
        onSubmit={(values) => catMutation.mutate(values)}
      />
      <CatalogueDialog
        open={priOpen}
        onOpenChange={setPriOpen}
        title={editingPri ? "Edit priority" : "Add priority"}
        row={editingPri}
        saving={priMutation.isPending}
        onSubmit={(values) => priMutation.mutate(values)}
      />
      <CatalogueDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        title={editingTag ? "Edit type tag" : "Add type tag"}
        row={editingTag}
        saving={tagMutation.isPending}
        onSubmit={(values) => tagMutation.mutate(values)}
      />
    </section>
  );
}

function CatalogueBlock({
  title,
  helper,
  warning,
  unavailable,
  available,
  rows,
  canEdit,
  addLabel,
  onAdd,
  onEdit,
  onToggle,
}: {
  title: string;
  helper: string;
  warning: string;
  unavailable: string;
  available: boolean;
  rows: PmsSet4CatalogueItem[];
  canEdit: boolean;
  addLabel: string;
  onAdd: () => void;
  onEdit: (row: PmsSet4CatalogueItem) => void;
  onToggle: (row: PmsSet4CatalogueItem) => void;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-[#251605]">{title}</h3>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        {canEdit && available ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            {addLabel}
          </Button>
        ) : null}
      </div>
      {!available ? (
        <p className="text-sm text-muted-foreground">{unavailable}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#C89933]">{warning}</p>
      ) : (
        <CatalogueList rows={rows} canEdit={canEdit} onEdit={onEdit} onToggle={onToggle} />
      )}
    </div>
  );
}
