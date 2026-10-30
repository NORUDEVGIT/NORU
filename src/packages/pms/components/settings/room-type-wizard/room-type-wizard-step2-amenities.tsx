import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  getRoomAmenityOverrides,
  getRoomEffectiveAmenities,
  listAmenities,
  listAmenityCategories,
  listRoomTypeAmenities,
  saveRoomAmenityOverrides,
  saveRoomTypeAmenities,
  type Card2Amenity,
} from "@/packages/pms/lib/rooms-amenities.functions";
import {
  CANONICAL_AMENITY_CATEGORIES,
  type AmenityOverrideKind,
} from "@/packages/pms/lib/rooms-card2-amenities.server";
import { useRoomTypeWizard } from "./room-type-wizard";

export function RoomTypeWizardStep2Amenities() {
  const { restaurantId, canEdit, roomTypeId, typeForm, stagedRooms, setStep } = useRoomTypeWizard();
  const disabled = !canEdit || !roomTypeId;
  const queryClient = useQueryClient();

  const fetchAmenities = useServerFn(listAmenities);
  const fetchCategories = useServerFn(listAmenityCategories);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);
  const saveTypeAmenitiesFn = useServerFn(saveRoomTypeAmenities);
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const fetchEffective = useServerFn(getRoomEffectiveAmenities);
  const saveOverridesFn = useServerFn(saveRoomAmenityOverrides);

  const [selectedCategory, setSelectedCategory] = useState<string>(
    CANONICAL_AMENITY_CATEGORIES[0],
  );
  const [typeAmenityIds, setTypeAmenityIds] = useState<string[]>([]);
  const [customizeRoomId, setCustomizeRoomId] = useState<string | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const amenitiesQuery = useQuery({
    queryKey: ["pms-card2-amenities", restaurantId],
    queryFn: () => fetchAmenities({ data: { restaurantId } }),
  });
  const categoriesQuery = useQuery({
    queryKey: ["pms-card2-amenity-categories", restaurantId],
    queryFn: () => fetchCategories({ data: { restaurantId } }),
  });
  const typeAmenitiesQuery = useQuery({
    queryKey: ["pms-card2-type-amenities", restaurantId, roomTypeId],
    enabled: Boolean(roomTypeId),
    queryFn: () => fetchTypeAmenities({ data: { restaurantId, roomTypeId: roomTypeId! } }),
  });

  useEffect(() => {
    const data = typeAmenitiesQuery.data;
    if (data && data.ok) setTypeAmenityIds(data.amenityIds);
  }, [typeAmenitiesQuery.data]);

  const amenities = amenitiesQuery.data ?? [];
  const categories = useMemo(() => {
    const custom = (categoriesQuery.data?.custom ?? []).map((c) =>
      typeof c === "string" ? c : String(c.name ?? ""),
    );
    return [...CANONICAL_AMENITY_CATEGORIES, ...custom.filter(Boolean)];
  }, [categoriesQuery.data]);

  const inCategory = amenities.filter(
    (a) => a.active && (a.category || "Uncategorized") === selectedCategory,
  );

  const saveTypeMutation = useMutation({
    mutationFn: () =>
      saveTypeAmenitiesFn({
        data: {
          restaurantId,
          roomTypeId: roomTypeId!,
          amenityIds: typeAmenityIds,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Room type amenities saved");
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-type-amenities", restaurantId, roomTypeId],
      });
    },
  });

  const persistedRooms = stagedRooms.filter((r) => r.persisted && r.id);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-[#251605]">Amenities</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configuring:{" "}
              <span className="font-medium text-[#251605]">
                {typeForm.name || "Room type"}
                {typeForm.code ? ` · ${typeForm.code}` : ""}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Physical rooms:{" "}
              {persistedRooms.length > 0
                ? persistedRooms.map((r) => r.roomNumber).join(" · ")
                : "none yet"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setCatalogueOpen(true)}>
            Manage Amenities
          </Button>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium text-[#251605]">Room Type Amenities</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Inherited by all rooms of this type unless a physical room overrides them.
          </p>

          <div className="mt-3 grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                    selectedCategory === cat ? "bg-[#251605] text-white" : "hover:bg-[#F7F4EE]"
                  }`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-xl border border-[#E6DFD3] p-3">
              {inCategory.map((amenity) => {
                const checked = typeAmenityIds.includes(amenity.id);
                return (
                  <label key={amenity.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={checked}
                      onChange={() =>
                        setTypeAmenityIds((prev) =>
                          checked ? prev.filter((id) => id !== amenity.id) : [...prev, amenity.id],
                        )
                      }
                    />
                    {amenity.name}
                  </label>
                );
              })}
              {inCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No amenities in this category.</p>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <Button
              type="button"
              disabled={disabled || saveTypeMutation.isPending}
              onClick={() => saveTypeMutation.mutate()}
            >
              {saveTypeMutation.isPending ? "Saving…" : "Save room type amenities"}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h4 className="text-sm font-medium text-[#251605]">Physical Room Overrides</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Only rooms of this type. Guest-facing surfaces still read room type amenities today.
        </p>
        <ul className="mt-3 space-y-2">
          {persistedRooms.map((room) => (
            <RoomOverrideRow
              key={room.id}
              restaurantId={restaurantId}
              roomId={room.id!}
              roomNumber={room.roomNumber}
              disabled={disabled}
              onCustomize={() => setCustomizeRoomId(room.id!)}
            />
          ))}
          {persistedRooms.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              Create physical rooms in Step 1 to customize per-room amenities.
            </li>
          ) : null}
        </ul>
      </section>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(1)}>
          Back
        </Button>
        <Button type="button" onClick={() => setStep(3)}>
          Continue to Pricing Defaults
        </Button>
      </div>

      <Dialog open={catalogueOpen} onOpenChange={setCatalogueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Amenity catalogue</DialogTitle>
            <DialogDescription>
              Property-wide amenity management remains on the Card 2 Amenities step. This list is
              read-only here for context.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {amenities.map((a: Card2Amenity) => (
              <div key={a.id} className="flex justify-between border-b py-2 text-sm">
                <span>{a.name}</span>
                <span className="text-muted-foreground">{a.category}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {customizeRoomId ? (
        <RoomCustomizeDialog
          restaurantId={restaurantId}
          roomId={customizeRoomId}
          roomTypeName={typeForm.name}
          typeAmenityIds={typeAmenityIds}
          amenities={amenities}
          disabled={disabled}
          open={Boolean(customizeRoomId)}
          onOpenChange={(open) => {
            if (!open) setCustomizeRoomId(null);
          }}
          fetchOverrides={fetchOverrides}
          fetchEffective={fetchEffective}
          saveOverridesFn={saveOverridesFn}
        />
      ) : null}
    </div>
  );
}

function RoomOverrideRow({
  restaurantId,
  roomId,
  roomNumber,
  disabled,
  onCustomize,
}: {
  restaurantId: string;
  roomId: string;
  roomNumber: string;
  disabled: boolean;
  onCustomize: () => void;
}) {
  const fetchOverrides = useServerFn(getRoomAmenityOverrides);
  const overridesQuery = useQuery({
    queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
    queryFn: () => fetchOverrides({ data: { restaurantId, roomId } }),
  });
  const count =
    overridesQuery.data && overridesQuery.data.ok ? overridesQuery.data.overrides.length : 0;
  return (
    <li className="flex items-center justify-between rounded-lg border border-[#E6DFD3] px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-[#251605]">{roomNumber}</p>
        <p className="text-xs text-muted-foreground">
          {count === 0
            ? "Inherits Room Type defaults"
            : `${count} override${count === 1 ? "" : "s"}`}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onCustomize}>
        Customize
      </Button>
    </li>
  );
}

function RoomCustomizeDialog({
  restaurantId,
  roomId,
  roomTypeName,
  typeAmenityIds,
  amenities,
  disabled,
  open,
  onOpenChange,
  fetchOverrides,
  fetchEffective,
  saveOverridesFn,
}: {
  restaurantId: string;
  roomId: string;
  roomTypeName: string;
  typeAmenityIds: string[];
  amenities: Card2Amenity[];
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchOverrides: (args: {
    data: { restaurantId: string; roomId: string };
  }) => Promise<Awaited<ReturnType<typeof getRoomAmenityOverrides>>>;
  fetchEffective: (args: {
    data: { restaurantId: string; roomId: string };
  }) => Promise<Awaited<ReturnType<typeof getRoomEffectiveAmenities>>>;
  saveOverridesFn: (args: {
    data:
      | { restaurantId: string; roomId: string; reset: true }
      | {
          restaurantId: string;
          roomId: string;
          overrides: { amenityId: string; kind: AmenityOverrideKind }[];
        };
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const queryClient = useQueryClient();
  const overridesQuery = useQuery({
    queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
    queryFn: () => fetchOverrides({ data: { restaurantId, roomId } }),
    enabled: open,
  });
  const effectiveQuery = useQuery({
    queryKey: ["pms-card2-room-effective", restaurantId, roomId],
    queryFn: () => fetchEffective({ data: { restaurantId, roomId } }),
    enabled: open,
  });

  const [drafts, setDrafts] = useState<{ amenityId: string; kind: AmenityOverrideKind }[]>([]);
  useEffect(() => {
    const data = overridesQuery.data;
    if (data && data.ok) {
      setDrafts(data.overrides.map((row) => ({ amenityId: row.amenityId, kind: row.kind })));
    }
  }, [overridesQuery.data]);

  const byId = new Map(amenities.map((a) => [a.id, a]));
  const removed = new Set(drafts.filter((d) => d.kind === "remove").map((d) => d.amenityId));
  const added = drafts.filter((d) => d.kind === "add");

  const saveMutation = useMutation({
    mutationFn: (
      payload:
        | { reset: true }
        | { overrides: { amenityId: string; kind: AmenityOverrideKind }[] },
    ) =>
      "reset" in payload
        ? saveOverridesFn({ data: { restaurantId, roomId, reset: true } })
        : saveOverridesFn({ data: { restaurantId, roomId, overrides: payload.overrides } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message ?? "Could not save overrides.");
        return;
      }
      toast.success("Room amenities updated");
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-room-overrides", restaurantId, roomId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pms-card2-room-effective", restaurantId, roomId],
      });
      onOpenChange(false);
    },
  });

  const addable = amenities.filter(
    (a) => a.active && !typeAmenityIds.includes(a.id) && !added.some((d) => d.amenityId === a.id),
  );

  const effectiveCount =
    effectiveQuery.data && effectiveQuery.data.ok ? effectiveQuery.data.effective.length : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room amenities</DialogTitle>
          <DialogDescription>Based on {roomTypeName || "room type"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Inherited</p>
          {typeAmenityIds.map((id) => {
            const amenity = byId.get(id);
            if (!amenity) return null;
            const isRemoved = removed.has(id);
            return (
              <div key={id} className="flex items-center justify-between text-sm">
                <span className={isRemoved ? "text-muted-foreground line-through" : ""}>
                  {amenity.name} — {isRemoved ? "removed" : "inherited"}
                </span>
                {!isRemoved ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      setDrafts((prev) => [
                        ...prev.filter((d) => d.amenityId !== id),
                        { amenityId: id, kind: "remove" },
                      ])
                    }
                  >
                    Remove for this room
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setDrafts((prev) => prev.filter((d) => d.amenityId !== id))}
                  >
                    Restore
                  </Button>
                )}
              </div>
            );
          })}

          <p className="text-xs font-medium uppercase text-muted-foreground">Room-specific</p>
          {added.map((row) => (
            <div key={row.amenityId} className="flex items-center justify-between text-sm">
              <span>{byId.get(row.amenityId)?.name ?? row.amenityId} — added</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  setDrafts((prev) => prev.filter((d) => d.amenityId !== row.amenityId))
                }
              >
                Clear
              </Button>
            </div>
          ))}

          <select
            className="w-full rounded-md border px-2 py-2 text-sm"
            disabled={disabled || addable.length === 0}
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              setDrafts((prev) => [...prev, { amenityId: id, kind: "add" }]);
              e.target.value = "";
            }}
          >
            <option value="">Add amenity…</option>
            {addable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {effectiveCount != null ? (
            <p className="text-xs text-muted-foreground">Effective count: {effectiveCount}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ reset: true })}
          >
            Reset to Room Type Defaults
          </Button>
          <Button
            type="button"
            disabled={disabled || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ overrides: drafts })}
          >
            Save overrides
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
