import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  ImageIcon,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  createRoomTypeImageUpload,
  deleteRoomTypeImage,
  listRoomTypeImages,
  registerRoomTypeImage,
  reorderRoomTypeImages,
  setRoomTypeImageCover,
  type RoomTypeImage,
} from "@/packages/pms/lib/rooms.functions";
import { useRoomTypeWizard } from "./room-type-wizard-context";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export function RoomTypeWizardStep4Photos() {
  const { restaurantId, canEdit, roomTypeId, typeForm, setStep } = useRoomTypeWizard();
  const disabled = !canEdit || !roomTypeId;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchImages = useServerFn(listRoomTypeImages);
  const startUpload = useServerFn(createRoomTypeImageUpload);
  const register = useServerFn(registerRoomTypeImage);
  const setCover = useServerFn(setRoomTypeImageCover);
  const reorder = useServerFn(reorderRoomTypeImages);
  const removeImage = useServerFn(deleteRoomTypeImage);

  const imagesQuery = useQuery({
    queryKey: ["room-type-images", restaurantId, roomTypeId],
    queryFn: () => fetchImages({ data: { restaurantId, roomTypeId: roomTypeId! } }),
    enabled: Boolean(roomTypeId),
  });

  const images: RoomTypeImage[] = imagesQuery.data ?? [];
  const coverImage = images.find((i) => i.isCover) ?? images[0];

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["room-type-images", restaurantId, roomTypeId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["pms-card2-room-types", restaurantId],
    });
  }

  const mutate = useMutation({
    mutationFn: async (run: () => Promise<{ ok: boolean; message?: string }>) => run(),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Could not update photo.");
        return;
      }
      refresh();
    },
    onError: () => toast.error("Photo operation failed."),
  });

  async function handleFiles(files: FileList | null) {
    if (disabled || !files || !roomTypeId) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        if (!(ACCEPTED as readonly string[]).includes(file.type)) {
          toast.error(`${file.name}: only JPG, PNG or WebP files are accepted.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: images must be 8 MB or smaller.`);
          continue;
        }
        const ticket = await startUpload({
          data: {
            restaurantId,
            roomTypeId,
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
          data: {
            restaurantId,
            roomTypeId,
            storagePath: ticket.path,
            altText: typeForm.name || "Room photo",
          },
        });
        if (saved.ok) {
          successCount++;
        } else {
          toast.error(saved.message);
        }
      }
      if (successCount > 0) {
        toast.success(`Uploaded ${successCount} photo${successCount === 1 ? "" : "s"}`);
        refresh();
      }
    } catch {
      toast.error("Upload encountered an unexpected error.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function move(index: number, direction: -1 | 1) {
    if (disabled || !roomTypeId) return;
    const next = [...images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    mutate.mutate(() =>
      reorder({
        data: { restaurantId, roomTypeId, imageIds: next.map((i) => i.id) },
      }),
    );
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-5 pb-20">
      {/* Top Header Card */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE6D8] pb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[#251605]">
              Photos & Gallery
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Upload and organize images for{" "}
              <span className="font-medium text-[#251605]">
                {typeForm.name || "Room Type"}
                {typeForm.code ? ` (${typeForm.code})` : ""}
              </span>
              . Images appear on reservation folios, booking confirmations, and public room
              listings.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-[#C89933] text-xs font-medium text-[#251605] hover:bg-[#C89933]/90"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload Photos"}
          </Button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {/* Cover Photo Primary Preview (when at least one photo exists) */}
        {coverImage && coverImage.url ? (
          <div className="mt-4 rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
                Primary Cover Photo
              </span>
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[10px] font-semibold text-[#251605] border border-[#C89933]/40">
                ★ Cover
              </span>
            </div>
            <div className="relative aspect-video max-h-56 w-full overflow-hidden rounded-lg bg-black/5 sm:aspect-[21/9]">
              <img
                src={coverImage.url}
                alt={coverImage.altText ?? typeForm.name}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ) : null}

        {/* Drag & Drop Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && fileRef.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? "border-[#C89933] bg-[#F7F4EE]"
              : "border-[#D9D2C4] bg-[#FBF9F5] hover:border-[#C89933]/70 hover:bg-[#F7F4EE]"
          }`}
        >
          <UploadCloud className="h-8 w-8 text-[#C89933] mb-2" />
          <p className="text-sm font-medium text-[#251605]">
            {uploading ? "Uploading photos…" : "Drag & drop photos here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepted formats: JPG, PNG, WebP · Up to 8 MB per image
          </p>
        </div>

        {/* Gallery Grid */}
        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Gallery ({images.length} {images.length === 1 ? "photo" : "photos"})
            </h4>
          </div>

          {imagesQuery.isLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Loading images…</p>
          ) : images.length === 0 ? (
            /* Deliberate Empty State */
            <div className="my-4 rounded-xl border border-[#EDE6D8] bg-[#FDFCFB] p-8 text-center">
              <ImageIcon className="mx-auto h-10 w-10 text-[#C89933]/60 mb-2" />
              <h4 className="text-sm font-semibold text-[#251605]">No room photos yet</h4>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Upload room images to use in reservations, room directory, and public presentation.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-[#D9D2C4] text-xs text-[#251605] hover:bg-[#F4EDE0]"
                disabled={disabled || uploading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Upload Photos
              </Button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {images.map((image, index) => {
                const isCover = Boolean(image.isCover);
                return (
                  <div
                    key={image.id}
                    className={`group relative overflow-hidden rounded-xl border bg-white shadow-2xs transition-all ${
                      isCover ? "border-[#C89933] ring-1 ring-[#C89933]" : "border-[#E6DFD3]"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      {image.url ? (
                        <img
                          src={image.url}
                          alt={image.altText ?? `Photo ${index + 1}`}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-102"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                      {isCover ? (
                        <span className="absolute left-2 top-2 rounded-full bg-[#C89933] px-2 py-0.5 text-[10px] font-semibold text-[#251605] shadow-xs">
                          ★ Cover
                        </span>
                      ) : null}
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between border-t border-[#EDE6D8] bg-[#FBF9F5] p-2 text-xs">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {/* Move Left */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:bg-[#F4EDE0] hover:text-[#251605]"
                          disabled={disabled || index === 0}
                          onClick={() => move(index, -1)}
                          aria-label={`Move photo ${index + 1} left`}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>

                        {/* Move Right */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:bg-[#F4EDE0] hover:text-[#251605]"
                          disabled={disabled || index === images.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label={`Move photo ${index + 1} right`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>

                        {/* Set as Cover */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 hover:bg-[#F4EDE0] ${
                            isCover
                              ? "text-[#C89933]"
                              : "text-muted-foreground hover:text-[#251605]"
                          }`}
                          disabled={disabled || isCover}
                          onClick={() =>
                            mutate.mutate(() =>
                              setCover({
                                data: {
                                  restaurantId,
                                  roomTypeId: roomTypeId!,
                                  imageId: image.id,
                                },
                              }),
                            )
                          }
                          aria-label={
                            isCover ? "Currently cover photo" : `Set photo ${index + 1} as cover`
                          }
                        >
                          <Star className={`h-3.5 w-3.5 ${isCover ? "fill-[#C89933]" : ""}`} />
                        </Button>

                        {/* Delete */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={disabled}
                          onClick={() =>
                            mutate.mutate(() =>
                              removeImage({
                                data: {
                                  restaurantId,
                                  roomTypeId: roomTypeId!,
                                  imageId: image.id,
                                },
                              }),
                            )
                          }
                          aria-label={`Delete photo ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D9D2C4] bg-white/95 px-6 py-3.5 backdrop-blur-xs shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
            onClick={() => setStep(3)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Amenities
          </Button>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium"
            onClick={() => setStep(5)}
          >
            Continue to Review
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
