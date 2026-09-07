import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Power, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { listRoomTypes, listRooms, saveRoom, setRoomActive, type HotelRoom, type RoomType } from "@/lib/rooms.functions";
import type { RoomStatus } from "@/lib/rooms.server";
import { cn } from "@/shared/lib/utils";

const STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Available",
  out_of_order: "Out of order",
  out_of_service: "Out of service",
};

const STATUS_STYLE: Record<RoomStatus, string> = {
  available: "bg-success/15 text-success",
  out_of_order: "bg-destructive/10 text-destructive",
  out_of_service: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

const ALL = "all";

export function RoomsTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const fetchRooms = useServerFn(listRooms);
  const fetchTypes = useServerFn(listRoomTypes);
  const save = useServerFn(saveRoom);
  const toggleActive = useServerFn(setRoomActive);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [floorFilter, setFloorFilter] = useState<string>(ALL);
  const [buildingFilter, setBuildingFilter] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HotelRoom | null>(null);

  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId, true],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: true } }),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms", restaurantId, showInactive, typeFilter, statusFilter],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          includeInactive: showInactive,
          ...(typeFilter !== ALL ? { roomTypeId: typeFilter } : {}),
          ...(statusFilter !== ALL ? { status: statusFilter as RoomStatus } : {}),
        },
      }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["room-types", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] });
  }

  const saveMutation = useMutation({
    mutationFn: (values: RoomFormValues) =>
      save({
        data: {
          restaurantId,
          ...(values.id ? { id: values.id } : {}),
          roomTypeId: values.roomTypeId,
          roomNumber: values.roomNumber.trim(),
          floor: values.floor,
          building: values.building,
          wing: values.wing,
          smoking: values.smoking,
          accessible: values.accessible,
          status: values.status,
          active: values.active,
          notes: values.notes,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room saved");
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: () => toast.error("Could not save the room."),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggleActive({ data: { restaurantId, ...input } }),
    onSuccess: () => refresh(),
    onError: () => toast.error("Could not update the room."),
  });

  const allRooms = roomsQuery.data ?? [];
  const floors = useMemo(
    () => Array.from(new Set(allRooms.map((r) => r.floor).filter((f): f is string => !!f))).sort(),
    [allRooms],
  );
  const buildings = useMemo(
    () => Array.from(new Set(allRooms.map((r) => r.building).filter((b): b is string => !!b))).sort(),
    [allRooms],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRooms.filter((r) => {
      if (term && !r.roomNumber.toLowerCase().includes(term)) return false;
      if (floorFilter !== ALL && r.floor !== floorFilter) return false;
      if (buildingFilter !== ALL && r.building !== buildingFilter) return false;
      return true;
    });
  }, [allRooms, search, floorFilter, buildingFilter]);

  const types = typesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search room number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect value={typeFilter} onChange={setTypeFilter} placeholder="All room types">
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses">
          {(Object.keys(STATUS_LABEL) as RoomStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={floorFilter} onChange={setFloorFilter} placeholder="All floors">
          {floors.map((f) => (
            <SelectItem key={f} value={f}>
              Floor {f}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={buildingFilter} onChange={setBuildingFilter} placeholder="All buildings">
          {buildings.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </FilterSelect>
        <Button variant={showInactive ? "default" : "outline"} size="sm" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Showing inactive" : "Active only"}
        </Button>
        <Button
          size="sm"
          disabled={types.length === 0}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" /> Add room
        </Button>
      </div>

      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a room type first — every room belongs to one.</p>
      ) : roomsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rooms…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms match these filters.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Type</th>
                <th className="hidden px-4 py-3 sm:table-cell">Floor</th>
                <th className="hidden px-4 py-3 md:table-cell">Building / Wing</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((room) => (
                <tr key={room.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{room.roomNumber}</td>
                  <td className="px-4 py-3">{room.roomTypeName}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">{room.floor ?? "—"}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {[room.building, room.wing].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_STYLE[room.status],
                      )}
                    >
                      {STATUS_LABEL[room.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{room.active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`Actions for room ${room.roomNumber}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(room);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => activeMutation.mutate({ id: room.id, active: !room.active })}
                        >
                          <Power className="mr-2 size-4" /> {room.active ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RoomFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        room={editing}
        types={types}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

interface RoomFormValues {
  id?: string;
  roomTypeId: string;
  roomNumber: string;
  floor: string;
  building: string;
  wing: string;
  smoking: boolean;
  accessible: boolean;
  status: RoomStatus;
  active: boolean;
  notes: string;
}

function RoomFormDialog({
  open,
  onOpenChange,
  room,
  types,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: HotelRoom | null;
  types: RoomType[];
  saving: boolean;
  onSubmit: (values: RoomFormValues) => void;
}) {
  const [values, setValues] = useState<RoomFormValues>({
    roomTypeId: "",
    roomNumber: "",
    floor: "",
    building: "",
    wing: "",
    smoking: false,
    accessible: false,
    status: "available",
    active: true,
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setValues(
      room
        ? {
            id: room.id,
            roomTypeId: room.roomTypeId,
            roomNumber: room.roomNumber,
            floor: room.floor ?? "",
            building: room.building ?? "",
            wing: room.wing ?? "",
            smoking: room.smoking,
            accessible: room.accessible,
            status: room.status,
            active: room.active,
            notes: room.notes ?? "",
          }
        : {
            roomTypeId: types[0]?.id ?? "",
            roomNumber: "",
            floor: "",
            building: "",
            wing: "",
            smoking: false,
            accessible: false,
            status: "available",
            active: true,
            notes: "",
          },
    );
  }, [open, room, types]);

  function set<K extends keyof RoomFormValues>(key: K, value: RoomFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const valid = values.roomNumber.trim().length > 0 && !!values.roomTypeId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{room ? "Edit room" : "Add room"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="room-number">Room number</Label>
            <Input id="room-number" value={values.roomNumber} onChange={(e) => set("roomNumber", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Room type</Label>
            <Select value={values.roomTypeId} onValueChange={(v) => set("roomTypeId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a room type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-floor">Floor</Label>
            <Input id="room-floor" value={values.floor} onChange={(e) => set("floor", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-building">Building</Label>
            <Input id="room-building" value={values.building} onChange={(e) => set("building", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-wing">Wing</Label>
            <Input id="room-wing" value={values.wing} onChange={(e) => set("wing", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={values.status} onValueChange={(v) => set("status", v as RoomStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as RoomStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="room-notes">Notes</Label>
            <Textarea id="room-notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            Smoking
            <Switch checked={values.smoking} onCheckedChange={(v) => set("smoking", v)} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            Accessible
            <Switch checked={values.accessible} onCheckedChange={(v) => set("accessible", v)} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm sm:col-span-2">
            Active
            <Switch checked={values.active} onCheckedChange={(v) => set("active", v)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => onSubmit(values)}>
            {saving ? "Saving…" : "Save room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
