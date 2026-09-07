import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BedDouble, Images, MoreHorizontal, Pencil, Plus, Power, Search } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  RoomTypeFormDialog,
  RoomTypeImagesDialog,
  type RoomTypeFormValues,
} from "@/components/rooms/room-type-dialogs";
import {
  listRoomAmenities,
  listRoomTypes,
  saveRoomType,
  setRoomTypeActive,
  type RoomType,
} from "@/lib/rooms.functions";
import { cn } from "@/shared/lib/utils";

export function RoomTypesTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchAmenities = useServerFn(listRoomAmenities);
  const save = useServerFn(saveRoomType);
  const toggleActive = useServerFn(setRoomTypeActive);

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoomType | null>(null);
  const [imagesFor, setImagesFor] = useState<RoomType | null>(null);

  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId, showInactive],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: showInactive } }),
  });
  const amenitiesQuery = useQuery({
    queryKey: ["room-amenities", restaurantId],
    queryFn: () => fetchAmenities({ data: { restaurantId } }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["room-types", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] });
  }

  const saveMutation = useMutation({
    mutationFn: (values: RoomTypeFormValues) =>
      save({
        data: {
          restaurantId,
          ...(values.id ? { id: values.id } : {}),
          code: values.code.trim(),
          name: values.name.trim(),
          description: values.description,
          maxOccupancy: values.maxOccupancy,
          adultCapacity: values.adultCapacity,
          childCapacity: values.childCapacity,
          bedType: values.bedType,
          bedCount: values.bedCount === "" ? null : Number(values.bedCount),
          roomSize: values.roomSize,
          roomView: values.roomView,
          sellable: values.sellable,
          active: values.active,
          amenityIds: values.amenityIds,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Room type saved");
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: () => toast.error("Could not save the room type."),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggleActive({ data: { restaurantId, ...input } }),
    onSuccess: () => refresh(),
    onError: () => toast.error("Could not update the room type."),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = typesQuery.data ?? [];
    if (!term) return list;
    return list.filter((t) => t.name.toLowerCase().includes(term) || t.code.toLowerCase().includes(term));
  }, [typesQuery.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search room types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant={showInactive ? "default" : "outline"} size="sm" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Showing inactive" : "Active only"}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" /> Add room type
        </Button>
      </div>

      {typesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading room types…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No room types yet. Add your first one to get started.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((type) => (
            <li key={type.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="h-36 w-full bg-muted">
                {type.coverUrl ? (
                  <img src={type.coverUrl} alt={type.name} className="h-36 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-36 items-center justify-center text-muted-foreground">
                    <BedDouble className="size-8" />
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg leading-tight">{type.name}</p>
                    <p className="text-xs text-muted-foreground">{type.code}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Room type actions">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(type);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setImagesFor(type)}>
                        <Images className="mr-2 size-4" /> Images
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => activeMutation.mutate({ id: type.id, active: !type.active })}
                      >
                        <Power className="mr-2 size-4" /> {type.active ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Chip>Sleeps {type.maxOccupancy}</Chip>
                  <Chip>
                    {type.adultCapacity} adult{type.adultCapacity === 1 ? "" : "s"}
                    {type.childCapacity > 0 ? ` · ${type.childCapacity} child` : ""}
                  </Chip>
                  {type.bedType ? (
                    <Chip>
                      {type.bedCount ? `${type.bedCount} × ` : ""}
                      {type.bedType}
                    </Chip>
                  ) : null}
                  <Chip className={type.sellable ? "bg-success/15 text-success" : undefined}>
                    {type.sellable ? "Sellable" : "Not sellable"}
                  </Chip>
                  <Chip className={type.active ? undefined : "bg-destructive/10 text-destructive"}>
                    {type.active ? "Active" : "Inactive"}
                  </Chip>
                  <Chip>
                    {type.roomCount} room{type.roomCount === 1 ? "" : "s"}
                  </Chip>
                </div>

                {type.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{type.description}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RoomTypeFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        roomType={editing}
        amenities={amenitiesQuery.data ?? []}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
      <RoomTypeImagesDialog
        open={!!imagesFor}
        onOpenChange={(open) => !open && setImagesFor(null)}
        restaurantId={restaurantId}
        roomType={imagesFor}
      />
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <span className={cn("rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}
