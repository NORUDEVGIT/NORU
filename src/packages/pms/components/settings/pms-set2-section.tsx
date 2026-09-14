import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ReadinessChip } from "@/packages/pms/components/settings/pms-set1-section";
import {
  SET2_AMENITIES_WARNING,
  SET2_DEACTIVATE_WARN,
  SET2_DEFAULT_OUTLET_WARN,
  SET2_OUTLETS_UNAVAILABLE,
  SET2_RI_HREF,
  SET2_RI_ROOMS_HREF,
  SET2_RI_TYPES_HREF,
  SET2_STRUCTURE_UNAVAILABLE,
  structureDeleteMessage,
  type HotelBuilding,
  type HotelFloor,
  type HotelWing,
  type OutletType,
  type PmsOutlet,
  type Set2Amenity,
  type Set2Snapshot,
  type StructureKind,
  OUTLET_TYPE_LABELS,
  OUTLET_TYPES,
} from "@/packages/pms/lib/pms-set2-structure";
import {
  bulkAssignUnassignedRooms,
  deleteStructureNode,
  ensureSingleBuildingAssist,
  saveHotelBuilding,
  saveHotelFloor,
  saveHotelWing,
  savePmsOutlet,
  saveRoomAmenityCatalogue,
} from "@/packages/pms/lib/pms-set2-structure.functions";
import type { Set1Checklist } from "@/packages/pms/lib/pms-set1-foundation";

function refreshSet2(queryClient: ReturnType<typeof useQueryClient>, restaurantId: string) {
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-foundation", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["pms-set1-audit", restaurantId] });
}

export function Set2StructureSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set2Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveBuilding = useServerFn(saveHotelBuilding);
  const saveFloor = useServerFn(saveHotelFloor);
  const saveWing = useServerFn(saveHotelWing);
  const ensureAssist = useServerFn(ensureSingleBuildingAssist);
  const bulkAssign = useServerFn(bulkAssignUnassignedRooms);
  const removeNode = useServerFn(deleteStructureNode);

  const [buildingOpen, setBuildingOpen] = useState(false);
  const [floorOpen, setFloorOpen] = useState(false);
  const [wingOpen, setWingOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<HotelBuilding | null>(null);
  const [editingFloor, setEditingFloor] = useState<HotelFloor | null>(null);
  const [editingWing, setEditingWing] = useState<HotelWing | null>(null);
  const [parentBuildingId, setParentBuildingId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: StructureKind; id: string; name: string; assigned: number } | null>(
    null,
  );
  const [reassignToId, setReassignToId] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBuildingId, setBulkBuildingId] = useState("");
  const [bulkFloorId, setBulkFloorId] = useState("");
  const [bulkWingId, setBulkWingId] = useState("");
  const [deactivateWarn, setDeactivateWarn] = useState<string | null>(null);

  const buildingMutation = useMutation({
    mutationFn: (input: { id?: string; code: string; name: string; active: boolean }) =>
      saveBuilding({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Building saved.");
      setBuildingOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const floorMutation = useMutation({
    mutationFn: (input: { id?: string; buildingId: string; code: string; name: string; active: boolean }) =>
      saveFloor({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Floor saved.");
      setFloorOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const wingMutation = useMutation({
    mutationFn: (input: {
      id?: string;
      name: string;
      active: boolean;
      parentBuildingId?: string | null;
      parentFloorId?: string | null;
    }) => saveWing({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Wing saved.");
      setWingOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const assistMutation = useMutation({
    mutationFn: (enabled: boolean) => ensureAssist({ data: { restaurantId, enabled } }),
    onSuccess: () => {
      toast.success("Single-building layout updated.");
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const bulkMutation = useMutation({
    mutationFn: () =>
      bulkAssign({
        data: {
          restaurantId,
          buildingId: bulkBuildingId,
          floorId: bulkFloorId || null,
          wingId: bulkWingId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Unassigned rooms updated.");
      setBulkOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      removeNode({
        data: {
          restaurantId,
          kind: deleteTarget!.kind,
          id: deleteTarget!.id,
          reassignToId: reassignToId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Structure item removed.");
      setDeleteTarget(null);
      setReassignToId("");
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const domain = checklist.domains.structure;
  const replacements = useMemo(() => {
    if (!deleteTarget) return [];
    if (deleteTarget.kind === "building") return snapshot.buildings.filter((row) => row.id !== deleteTarget.id);
    if (deleteTarget.kind === "floor") return snapshot.floors.filter((row) => row.id !== deleteTarget.id);
    return snapshot.wings.filter((row) => row.id !== deleteTarget.id);
  }, [deleteTarget, snapshot.buildings, snapshot.floors, snapshot.wings]);

  return (
    <section id="structure" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set2-structure">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Structure</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Buildings, floors and wings. Room inventory stays on the existing grid.
          </p>
        </div>
        <ReadinessChip readiness={domain.readiness} />
      </div>

      {!snapshot.structureColumnsAvailable ? (
        <p className="text-sm text-muted-foreground">{SET2_STRUCTURE_UNAVAILABLE}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
            <div>
              <Label htmlFor="set2-single-building">Single-building assist</Label>
              <p className="text-xs text-muted-foreground">Ensures Main building and Floor 1.</p>
            </div>
            <Switch
              id="set2-single-building"
              checked={snapshot.singleBuildingMode}
              disabled={!canEdit || assistMutation.isPending}
              onCheckedChange={(enabled) => assistMutation.mutate(enabled)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] bg-muted/30 p-3">
            <p className="text-sm text-[#251605]">
              {snapshot.unassignedActiveRoomCount} unassigned active room
              {snapshot.unassignedActiveRoomCount === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={SET2_RI_ROOMS_HREF}>Open room inventory</a>
              </Button>
              {canEdit ? (
                <Button
                  size="sm"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                  disabled={snapshot.unassignedActiveRoomCount === 0}
                  onClick={() => {
                    setBulkBuildingId(snapshot.buildings[0]?.id ?? "");
                    setBulkFloorId("");
                    setBulkWingId("");
                    setBulkOpen(true);
                  }}
                >
                  Bulk-assign
                </Button>
              ) : null}
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingBuilding(null);
                  setBuildingOpen(true);
                }}
              >
                Add building
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={snapshot.buildings.length === 0}
                onClick={() => {
                  setEditingFloor(null);
                  setParentBuildingId(snapshot.buildings[0]?.id ?? "");
                  setFloorOpen(true);
                }}
              >
                Add floor
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={snapshot.buildings.length === 0}
                onClick={() => {
                  setEditingWing(null);
                  setWingOpen(true);
                }}
              >
                Add wing
              </Button>
            </div>
          ) : null}

          <ul className="space-y-3">
            {snapshot.buildings.map((building) => {
              const floors = snapshot.floors.filter((row) => row.buildingId === building.id);
              const buildingWings = snapshot.wings.filter((row) => row.parentBuildingId === building.id);
              const assigned = snapshot.assignedByBuilding[building.id] ?? 0;
              return (
                <li key={building.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[#251605]">
                        {building.name} <span className="text-xs text-muted-foreground">({building.code})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {building.active ? "Active" : "Inactive"} · {assigned} assigned room{assigned === 1 ? "" : "s"}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingBuilding(building);
                            setBuildingOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (assigned > 0 && building.active) setDeactivateWarn(SET2_DEACTIVATE_WARN);
                            buildingMutation.mutate({
                              id: building.id,
                              code: building.code,
                              name: building.name,
                              active: !building.active,
                            });
                          }}
                        >
                          {building.active ? "Deactivate" : "Reactivate"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDeleteTarget({ kind: "building", id: building.id, name: building.name, assigned })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <ul className="mt-3 space-y-2 border-l border-[#CCCCCC] pl-3">
                    {floors.map((floor) => {
                      const floorWings = snapshot.wings.filter((row) => row.parentFloorId === floor.id);
                      const floorAssigned = snapshot.assignedByFloor[floor.id] ?? 0;
                      return (
                        <li key={floor.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm">
                              {floor.name} <span className="text-xs text-muted-foreground">({floor.code})</span>
                              {!floor.active ? " · Inactive" : ""} · {floorAssigned} room{floorAssigned === 1 ? "" : "s"}
                            </p>
                            {canEdit ? (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingFloor(floor);
                                    setParentBuildingId(floor.buildingId);
                                    setFloorOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setDeleteTarget({ kind: "floor", id: floor.id, name: floor.name, assigned: floorAssigned })
                                  }
                                >
                                  Delete
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {floorWings.map((wing) => (
                            <WingRow
                              key={wing.id}
                              wing={wing}
                              assigned={snapshot.assignedByWing[wing.id] ?? 0}
                              canEdit={canEdit}
                              onEdit={() => {
                                setEditingWing(wing);
                                setWingOpen(true);
                              }}
                              onDelete={() =>
                                setDeleteTarget({
                                  kind: "wing",
                                  id: wing.id,
                                  name: wing.name,
                                  assigned: snapshot.assignedByWing[wing.id] ?? 0,
                                })
                              }
                            />
                          ))}
                        </li>
                      );
                    })}
                    {buildingWings.map((wing) => (
                      <WingRow
                        key={wing.id}
                        wing={wing}
                        assigned={snapshot.assignedByWing[wing.id] ?? 0}
                        canEdit={canEdit}
                        onEdit={() => {
                          setEditingWing(wing);
                          setWingOpen(true);
                        }}
                        onDelete={() =>
                          setDeleteTarget({
                            kind: "wing",
                            id: wing.id,
                            name: wing.name,
                            assigned: snapshot.assignedByWing[wing.id] ?? 0,
                          })
                        }
                      />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <BuildingDialog
        open={buildingOpen}
        onOpenChange={setBuildingOpen}
        building={editingBuilding}
        saving={buildingMutation.isPending}
        onSubmit={(values) => buildingMutation.mutate(values)}
      />
      <FloorDialog
        open={floorOpen}
        onOpenChange={setFloorOpen}
        floor={editingFloor}
        buildings={snapshot.buildings}
        buildingId={parentBuildingId}
        onBuildingId={setParentBuildingId}
        saving={floorMutation.isPending}
        onSubmit={(values) => floorMutation.mutate(values)}
      />
      <WingDialog
        open={wingOpen}
        onOpenChange={setWingOpen}
        wing={editingWing}
        buildings={snapshot.buildings}
        floors={snapshot.floors}
        saving={wingMutation.isPending}
        onSubmit={(values) => wingMutation.mutate(values)}
      />

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent className="border-[#C89933]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#251605]">Bulk-assign unassigned rooms</AlertDialogTitle>
            <AlertDialogDescription>
              Applies to {snapshot.unassignedActiveRoomCount} active room
              {snapshot.unassignedActiveRoomCount === 1 ? "" : "s"} with no building master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Label>Building</Label>
            <Select value={bulkBuildingId} onValueChange={setBulkBuildingId}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Choose a building" />
              </SelectTrigger>
              <SelectContent>
                {snapshot.buildings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Floor (optional)</Label>
            <Select value={bulkFloorId || "none"} onValueChange={(value) => setBulkFloorId(value === "none" ? "" : value)}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {snapshot.floors
                  .filter((row) => !bulkBuildingId || row.buildingId === bulkBuildingId)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={!bulkBuildingId || bulkMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                bulkMutation.mutate();
              }}
            >
              Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setReassignToId("");
          }
        }}
      >
        <AlertDialogContent className="border-[#C89933]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#251605]">
              {deleteTarget ? `Delete ${deleteTarget.name}` : "Delete"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && structureDeleteMessage(deleteTarget.kind, deleteTarget.assigned)
                ? structureDeleteMessage(deleteTarget.kind, deleteTarget.assigned)
                : "This removes the master. Rooms keep their text labels until you assign another."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && deleteTarget.assigned > 0 ? (
            <div className="space-y-2">
              <Label>Reassign to</Label>
              <Select value={reassignToId} onValueChange={setReassignToId}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Choose a replacement" />
                </SelectTrigger>
                <SelectContent>
                  {replacements.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={Boolean(deleteTarget && deleteTarget.assigned > 0 && !reassignToId) || deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deactivateWarn ? (
        <p className="text-sm text-[#C89933]">{deactivateWarn}</p>
      ) : null}
    </section>
  );
}

function WingRow({
  wing,
  assigned,
  canEdit,
  onEdit,
  onDelete,
}: {
  wing: HotelWing;
  assigned: number;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p>
        Wing {wing.name}
        {!wing.active ? " · Inactive" : ""} · {assigned} room{assigned === 1 ? "" : "s"}
      </p>
      {canEdit ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BuildingDialog({
  open,
  onOpenChange,
  building,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: HotelBuilding | null;
  saving: boolean;
  onSubmit: (values: { id?: string; code: string; name: string; active: boolean }) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setCode(building?.code ?? "");
    setName(building?.name ?? "");
    setActive(building?.active ?? true);
  }, [open, building]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{building ? "Edit building" : "Add building"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="set2-building-code">Code</Label>
            <Input id="set2-building-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set2-building-name">Name</Label>
            <Input id="set2-building-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
            <Label htmlFor="set2-building-active">Active</Label>
            <Switch id="set2-building-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!code.trim() || !name.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(building?.id ? { id: building.id } : {}), code, name, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FloorDialog({
  open,
  onOpenChange,
  floor,
  buildings,
  buildingId,
  onBuildingId,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floor: HotelFloor | null;
  buildings: HotelBuilding[];
  buildingId: string;
  onBuildingId: (id: string) => void;
  saving: boolean;
  onSubmit: (values: { id?: string; buildingId: string; code: string; name: string; active: boolean }) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setCode(floor?.code ?? "");
    setName(floor?.name ?? "");
    setActive(floor?.active ?? true);
    onBuildingId(floor?.buildingId ?? buildingId);
  }, [open, floor, buildingId, onBuildingId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{floor ? "Edit floor" : "Add floor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Building</Label>
            <Select value={buildingId} onValueChange={onBuildingId}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Choose a building" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set2-floor-code">Code</Label>
            <Input id="set2-floor-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set2-floor-name">Name</Label>
            <Input id="set2-floor-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!buildingId || !code.trim() || !name.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(floor?.id ? { id: floor.id } : {}), buildingId, code, name, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WingDialog({
  open,
  onOpenChange,
  wing,
  buildings,
  floors,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wing: HotelWing | null;
  buildings: HotelBuilding[];
  floors: HotelFloor[];
  saving: boolean;
  onSubmit: (values: {
    id?: string;
    name: string;
    active: boolean;
    parentBuildingId?: string | null;
    parentFloorId?: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [parentKind, setParentKind] = useState<"building" | "floor">("building");
  const [parentId, setParentId] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(wing?.name ?? "");
    setActive(wing?.active ?? true);
    if (wing?.parentFloorId) {
      setParentKind("floor");
      setParentId(wing.parentFloorId);
    } else {
      setParentKind("building");
      setParentId(wing?.parentBuildingId ?? buildings[0]?.id ?? "");
    }
  }, [open, wing, buildings]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{wing ? "Edit wing" : "Add wing"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="set2-wing-name">Name</Label>
            <Input id="set2-wing-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["building", "floor"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setParentKind(kind);
                  setParentId(kind === "building" ? buildings[0]?.id ?? "" : floors[0]?.id ?? "");
                }}
                className={
                  parentKind === kind
                    ? "h-12 rounded-2xl border border-primary bg-primary text-sm font-semibold text-primary-foreground"
                    : "h-12 rounded-2xl border border-border bg-background text-sm font-semibold"
                }
              >
                {kind === "building" ? "Building parent" : "Floor parent"}
              </button>
            ))}
          </div>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Choose a parent" />
            </SelectTrigger>
            <SelectContent>
              {(parentKind === "building" ? buildings : floors).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !parentId || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() =>
              onSubmit({
                ...(wing?.id ? { id: wing.id } : {}),
                name,
                active,
                parentBuildingId: parentKind === "building" ? parentId : null,
                parentFloorId: parentKind === "floor" ? parentId : null,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Set2RoomsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set2Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saveAmenity = useServerFn(saveRoomAmenityCatalogue);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Set2Amenity | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { id?: string; name: string; code: string; category: string; active: boolean }) =>
      saveAmenity({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Amenity saved.");
      setOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section id="rooms" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set2-rooms">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Rooms &amp; amenities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Types and rooms stay in Room Inventory. The amenities catalogue is edited here; attach them to types in Room
            Inventory.
          </p>
        </div>
        <ReadinessChip readiness={checklist.domains.rooms.readiness} />
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <SummaryStat label="Room types" value={snapshot.roomTypeCount} />
        <SummaryStat label="Rooms" value={snapshot.roomCount} />
        <SummaryStat label="Unassigned active" value={snapshot.unassignedActiveRoomCount} />
      </dl>
      <Button className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90" asChild>
        <a href={SET2_RI_HREF} data-testid="set2-open-room-inventory">
          Open room inventory
        </a>
      </Button>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-[#251605]">Amenities catalogue</h3>
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add amenity
            </Button>
          ) : null}
        </div>
        {snapshot.amenities.length === 0 ? (
          <p className="text-sm text-[#C89933]">{SET2_AMENITIES_WARNING}</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.amenities.map((amenity) => (
              <li key={amenity.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{amenity.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[amenity.code, amenity.category, amenity.active ? "Active" : "Inactive"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(amenity);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        mutation.mutate({
                          id: amenity.id,
                          name: amenity.name,
                          code: amenity.code,
                          category: amenity.category,
                          active: !amenity.active,
                        })
                      }
                    >
                      {amenity.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <a href={SET2_RI_TYPES_HREF} className="inline-flex text-sm font-medium text-[#C89933]">
          Attach amenities to room types
        </a>
      </div>
      <AmenityDialog
        open={open}
        onOpenChange={setOpen}
        amenity={editing}
        saving={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-[#251605]">{value}</p>
    </div>
  );
}

function AmenityDialog({
  open,
  onOpenChange,
  amenity,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amenity: Set2Amenity | null;
  saving: boolean;
  onSubmit: (values: { id?: string; name: string; code: string; category: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(amenity?.name ?? "");
    setCode(amenity?.code ?? "");
    setCategory(amenity?.category ?? "");
    setActive(amenity?.active ?? true);
  }, [open, amenity]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{amenity ? "Edit amenity" : "Add amenity"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="set2-amenity-name">Name</Label>
            <Input id="set2-amenity-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set2-amenity-code">Code</Label>
              <Input id="set2-amenity-code" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set2-amenity-category">Category</Label>
              <Input id="set2-amenity-category" value={category} onChange={(event) => setCategory(event.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() => onSubmit({ ...(amenity?.id ? { id: amenity.id } : {}), name, code, category, active })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Set2OutletsSection({
  restaurantId,
  snapshot,
  checklist,
  canEdit,
}: {
  restaurantId: string;
  snapshot: Set2Snapshot;
  checklist: Set1Checklist;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(savePmsOutlet);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PmsOutlet | null>(null);
  const mutation = useMutation({
    mutationFn: (input: {
      id?: string;
      code: string;
      name: string;
      type: OutletType;
      active: boolean;
      departmentText: string;
      defaultPostingLabel: string;
      isDefaultRooms: boolean;
    }) => save({ data: { restaurantId, ...input } }),
    onSuccess: () => {
      toast.success("Outlet saved.");
      setOpen(false);
      refreshSet2(queryClient, restaurantId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section id="outlets" className="space-y-4 rounded-2xl border border-border bg-card p-5" data-testid="pms-set2-outlets">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Outlets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Masters only. Folio posting still uses the existing engine — this wave does not add outlet_id to
            folio_transactions.
          </p>
        </div>
        <ReadinessChip readiness={checklist.domains.outlets.readiness} />
      </div>
      {!snapshot.outletsColumnsAvailable ? (
        <p className="text-sm text-muted-foreground">{SET2_OUTLETS_UNAVAILABLE}</p>
      ) : (
        <>
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add outlet
            </Button>
          ) : null}
          {snapshot.outlets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add at least one active Rooms outlet to complete this card.</p>
          ) : (
            <ul className="space-y-2">
              {snapshot.outlets.map((outlet) => (
                <li key={outlet.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[#251605]">
                        {outlet.name} <span className="text-xs text-muted-foreground">({outlet.code})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {OUTLET_TYPE_LABELS[outlet.type]} · {outlet.active ? "Active" : "Inactive"}
                        {outlet.isDefaultRooms ? " · Default Rooms" : ""}
                      </p>
                      {outlet.isDefaultRooms ? <p className="mt-1 text-sm text-[#C89933]">{SET2_DEFAULT_OUTLET_WARN}</p> : null}
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(outlet);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            mutation.mutate({
                              id: outlet.id,
                              code: outlet.code,
                              name: outlet.name,
                              type: outlet.type,
                              active: !outlet.active,
                              departmentText: outlet.departmentText,
                              defaultPostingLabel: outlet.defaultPostingLabel,
                              isDefaultRooms: outlet.isDefaultRooms,
                            })
                          }
                        >
                          {outlet.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <OutletDialog
        open={open}
        onOpenChange={setOpen}
        outlet={editing}
        saving={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </section>
  );
}

function OutletDialog({
  open,
  onOpenChange,
  outlet,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outlet: PmsOutlet | null;
  saving: boolean;
  onSubmit: (values: {
    id?: string;
    code: string;
    name: string;
    type: OutletType;
    active: boolean;
    departmentText: string;
    defaultPostingLabel: string;
    isDefaultRooms: boolean;
  }) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<OutletType>("rooms");
  const [active, setActive] = useState(true);
  const [departmentText, setDepartmentText] = useState("");
  const [defaultPostingLabel, setDefaultPostingLabel] = useState("");
  const [isDefaultRooms, setIsDefaultRooms] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCode(outlet?.code ?? "");
    setName(outlet?.name ?? "");
    setType(outlet?.type ?? "rooms");
    setActive(outlet?.active ?? true);
    setDepartmentText(outlet?.departmentText ?? "");
    setDefaultPostingLabel(outlet?.defaultPostingLabel ?? "");
    setIsDefaultRooms(outlet?.isDefaultRooms ?? false);
  }, [open, outlet]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outlet ? "Edit outlet" : "Add outlet"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="set2-outlet-code">Code</Label>
              <Input id="set2-outlet-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set2-outlet-name">Name</Label>
              <Input id="set2-outlet-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as OutletType)}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTLET_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {OUTLET_TYPE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="set2-outlet-dept">Department</Label>
            <Input id="set2-outlet-dept" value={departmentText} onChange={(event) => setDepartmentText(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set2-outlet-label">Default posting label</Label>
            <Input
              id="set2-outlet-label"
              value={defaultPostingLabel}
              onChange={(event) => setDefaultPostingLabel(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
            <Label htmlFor="set2-outlet-default">Default Rooms outlet</Label>
            <Switch
              id="set2-outlet-default"
              checked={isDefaultRooms}
              disabled={type !== "rooms"}
              onCheckedChange={setIsDefaultRooms}
            />
          </div>
          {outlet?.isDefaultRooms ? <p className="text-sm text-[#C89933]">{SET2_DEFAULT_OUTLET_WARN}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!code.trim() || !name.trim() || saving}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
            onClick={() =>
              onSubmit({
                ...(outlet?.id ? { id: outlet.id } : {}),
                code,
                name,
                type,
                active,
                departmentText,
                defaultPostingLabel,
                isDefaultRooms: type === "rooms" && isDefaultRooms,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
