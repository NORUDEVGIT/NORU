import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  createRoomTypeImageUpload,
  deleteRoomTypeImage,
  listRoomTypeImages,
  registerRoomTypeImage,
  reorderRoomTypeImages,
  setRoomTypeImageCover,
  type RoomAmenity,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import { cn } from "@/shared/lib/utils";

export interface RoomTypeFormValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  bedType: string;
  bedCount: string;
  roomSize: string;
  roomView: string;
  sellable: boolean;
  active: boolean;
  amenityIds: string[];
}

const EMPTY: RoomTypeFormValues = {
  code: "",
  name: "",
  description: "",
  maxOccupancy: 2,
  adultCapacity: 2,
  childCapacity: 0,
  bedType: "",
  bedCount: "",
  roomSize: "",
  roomView: "",
  sellable: true,
  active: true,
  amenityIds: [],
};

export function RoomTypeFormDialog({
  open,
  onOpenChange,
  roomType,
  amenities,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomType: RoomType | null;
  amenities: RoomAmenity[];
  saving: boolean;
  onSubmit: (values: RoomTypeFormValues) => void;
}) {
  const [values, setValues] = useState<RoomTypeFormValues>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setValues(
      roomType
        ? {
            id: roomType.id,
            code: roomType.code,
            name: roomType.name,
            description: roomType.description ?? "",
            maxOccupancy: roomType.maxOccupancy,
            adultCapacity: roomType.adultCapacity,
            childCapacity: roomType.childCapacity,
            bedType: roomType.bedType ?? "",
            bedCount: roomType.bedCount != null ? String(roomType.bedCount) : "",
            roomSize: roomType.roomSize ?? "",
            roomView: roomType.roomView ?? "",
            sellable: roomType.sellable,
            active: roomType.active,
            amenityIds: roomType.amenityIds,
          }
        : EMPTY,
    );
  }, [open, roomType]);

  function set<K extends keyof RoomTypeFormValues>(key: K, value: RoomTypeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const valid = values.code.trim().length >= 2 && values.name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{roomType ? "Edit room type" : "Add room type"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rt-code">Code</Label>
            <Input
              id="rt-code"
              value={values.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="DLX-K"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-name">Name</Label>
            <Input
              id="rt-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Deluxe King"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rt-desc">Description</Label>
            <Textarea
              id="rt-desc"
              rows={3}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-max">Max occupancy</Label>
            <Input
              id="rt-max"
              type="number"
              min={1}
              value={values.maxOccupancy}
              onChange={(e) => set("maxOccupancy", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-adults">Adult capacity</Label>
            <Input
              id="rt-adults"
              type="number"
              min={0}
              value={values.adultCapacity}
              onChange={(e) => set("adultCapacity", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-children">Child capacity</Label>
            <Input
              id="rt-children"
              type="number"
              min={0}
              value={values.childCapacity}
              onChange={(e) => set("childCapacity", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-bed">Bed type</Label>
            <Input id="rt-bed" value={values.bedType} onChange={(e) => set("bedType", e.target.value)} placeholder="King" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-bedcount">Bed count</Label>
            <Input
              id="rt-bedcount"
              type="number"
              min={0}
              value={values.bedCount}
              onChange={(e) => set("bedCount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-size">Room size</Label>
            <Input id="rt-size" value={values.roomSize} onChange={(e) => set("roomSize", e.target.value)} placeholder="32 m²" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rt-view">Room view</Label>
            <Input id="rt-view" value={values.roomView} onChange={(e) => set("roomView", e.target.value)} placeholder="City view" />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Amenities</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {amenities.map((a) => {
                const checked = values.amenityIds.includes(a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        set(
                          "amenityIds",
                          next ? [...values.amenityIds, a.id] : values.amenityIds.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            Sellable
            <Switch checked={values.sellable} onCheckedChange={(v) => set("sellable", v)} />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
            Active
            <Switch checked={values.active} onCheckedChange={(v) => set("active", v)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => onSubmit(values)}>
            {saving ? "Saving…" : "Save room type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 8 * 1024 * 1024;

export function RoomTypeImagesDialog({
  open,
  onOpenChange,
  restaurantId,
  roomType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  roomType: RoomType | null;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchImages = useServerFn(listRoomTypeImages);
  const startUpload = useServerFn(createRoomTypeImageUpload);
  const register = useServerFn(registerRoomTypeImage);
  const setCover = useServerFn(setRoomTypeImageCover);
  const reorder = useServerFn(reorderRoomTypeImages);
  const removeImage = useServerFn(deleteRoomTypeImage);

  const imagesQuery = useQuery({
    queryKey: ["room-type-images", restaurantId, roomType?.id],
    queryFn: () => fetchImages({ data: { restaurantId, roomTypeId: roomType!.id } }),
    enabled: open && !!roomType,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["room-type-images", restaurantId, roomType?.id] });
    void queryClient.invalidateQueries({ queryKey: ["room-types", restaurantId] });
  }

  const mutate = useMutation({
    mutationFn: async (run: () => Promise<{ ok: boolean; message?: string }>) => run(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "That didn't work.");
        return;
      }
      refresh();
    },
    onError: () => toast.error("That didn't work."),
  });

  async function onFiles(files: FileList | null) {
    if (!files || !roomType) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!(ACCEPTED as readonly string[]).includes(file.type)) {
          toast.error(`${file.name}: only JPG, PNG or WebP.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: images must be 8 MB or smaller.`);
          continue;
        }
        const ticket = await startUpload({
          data: {
            restaurantId,
            roomTypeId: roomType.id,
            contentType: file.type as (typeof ACCEPTED)[number],
            size: file.size,
          },
        });
        if (!ticket.ok) {
          toast.error(ticket.message);
          continue;
        }
        const { error } = await supabase.storage
          .from("property-images")
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (error) {
          toast.error(`${file.name}: upload failed.`);
          continue;
        }
        const saved = await register({
          data: { restaurantId, roomTypeId: roomType.id, storagePath: ticket.path, altText: roomType.name },
        });
        if (!saved.ok) toast.error(saved.message);
      }
      toast.success("Images updated");
      refresh();
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const images = imagesQuery.data ?? [];

  function move(index: number, direction: -1 | 1) {
    const next = [...images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    mutate.mutate(() =>
      reorder({ data: { restaurantId, roomTypeId: roomType!.id, imageIds: next.map((i) => i.id) } }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{roomType ? `${roomType.name} images` : "Images"}</DialogTitle>
        </DialogHeader>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-2 size-4" />
            {uploading ? "Uploading…" : "Upload images"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">JPG, PNG or WebP · up to 8 MB each</p>
        </div>

        {imagesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading images…</p>
        ) : images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {images.map((image, index) => (
              <li
                key={image.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card",
                  image.isCover ? "border-primary" : "border-border",
                )}
              >
                {image.url ? (
                  <img src={image.url} alt={image.altText ?? "Room type"} className="h-32 w-full object-cover" />
                ) : (
                  <div className="h-32 w-full bg-muted" />
                )}
                <div className="flex items-center justify-between gap-1 p-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {image.isCover ? "Cover" : `#${index + 1}`}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => move(index, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => move(index, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Set as cover"
                      onClick={() =>
                        mutate.mutate(() =>
                          setCover({ data: { restaurantId, roomTypeId: roomType!.id, imageId: image.id } }),
                        )
                      }
                    >
                      <Star className={cn("size-4", image.isCover && "fill-primary text-primary")} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete image"
                      onClick={() =>
                        mutate.mutate(() =>
                          removeImage({ data: { restaurantId, roomTypeId: roomType!.id, imageId: image.id } }),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
