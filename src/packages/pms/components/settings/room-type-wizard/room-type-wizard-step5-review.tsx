import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Edit2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { listRoomTypeImages } from "@/packages/pms/lib/rooms.functions";
import { listAmenities, listRoomTypeAmenities } from "@/packages/pms/lib/rooms-amenities.functions";
import { useRoomTypeWizard } from "./room-type-wizard-context";

export function RoomTypeWizardStep5Review() {
  const {
    restaurantId,
    roomTypeId,
    typeForm,
    stagedRooms,
    excludedBulkNumbers,
    setStep,
    onCompleted,
  } = useRoomTypeWizard();

  const fetchImages = useServerFn(listRoomTypeImages);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);
  const fetchAllAmenities = useServerFn(listAmenities);

  const imagesQuery = useQuery({
    queryKey: ["room-type-images", restaurantId, roomTypeId],
    enabled: Boolean(roomTypeId),
    queryFn: () => fetchImages({ data: { restaurantId, roomTypeId: roomTypeId! } }),
  });

  const amenitiesQuery = useQuery({
    queryKey: ["pms-card2-type-amenities", restaurantId, roomTypeId],
    enabled: Boolean(roomTypeId),
    queryFn: () => fetchTypeAmenities({ data: { restaurantId, roomTypeId: roomTypeId! } }),
  });

  const allAmenitiesQuery = useQuery({
    queryKey: ["pms-card2-amenities", restaurantId],
    queryFn: () => fetchAllAmenities({ data: { restaurantId } }),
  });

  const images = imagesQuery.data ?? [];
  const cover = images.find((i) => i.isCover) ?? images[0];
  const allAmenities = allAmenitiesQuery.data ?? [];
  const amenityMap = new Map(allAmenities.map((a) => [a.id, a.name]));

  const assignedAmenityNames = (
    amenitiesQuery.data && amenitiesQuery.data.ok ? amenitiesQuery.data.amenityIds : []
  )
    .map((id) => amenityMap.get(id))
    .filter(Boolean) as string[];

  // Group physical rooms by Building and Floor
  const groupedRooms = stagedRooms.reduce<Record<string, typeof stagedRooms>>((acc, room) => {
    const loc = [
      room.buildingName || "Main Building",
      room.floorName ? `Floor ${room.floorName}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(room);
    return acc;
  }, {});

  const configuredBeds = typeForm.beds.filter((b) => b.bedType.trim());

  function handleComplete() {
    toast.success("Room type setup completed successfully!");
    onCompleted();
  }

  return (
    <div className="space-y-5 pb-20">
      <header className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <h3 className="font-display text-base font-semibold text-[#251605]">Review & Complete</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Confirm the room type setup configuration below before completing. You can return to any
          step using the Edit links.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* CARD 1: Room Type Identity */}
        <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Room Type
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
              onClick={() => setStep(1)}
              aria-label="Edit room type identity"
            >
              <Edit2 className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-semibold text-[#251605]">{typeForm.name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Code:</span>
              <span className="font-mono font-medium text-[#251605] bg-[#F4EDE0] px-1.5 py-0.2 rounded border border-[#E6E1D8]">
                {typeForm.code || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category:</span>
              <span className="font-medium text-[#251605]">{typeForm.category || "—"}</span>
            </div>
            {typeForm.class ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Class:</span>
                <span className="text-[#251605]">{typeForm.class}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="text-[#251605]">
                {typeForm.active ? "Active" : "Inactive"} ·{" "}
                {typeForm.sellable ? "Sellable" : "Not Sellable"}
              </span>
            </div>
          </div>
        </section>

        {/* CARD 2: Capacity */}
        <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Capacity
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
              onClick={() => setStep(1)}
              aria-label="Edit capacity"
            >
              <Edit2 className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-2 text-center">
              <span className="text-muted-foreground block text-[10px] uppercase">Maximum</span>
              <span className="text-sm font-semibold text-[#251605]">{typeForm.maxOccupancy}</span>
            </div>
            <div className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-2 text-center">
              <span className="text-muted-foreground block text-[10px] uppercase">Adults</span>
              <span className="text-sm font-semibold text-[#251605]">{typeForm.adultCapacity}</span>
            </div>
            <div className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-2 text-center">
              <span className="text-muted-foreground block text-[10px] uppercase">Children</span>
              <span className="text-sm font-semibold text-[#251605]">{typeForm.childCapacity}</span>
            </div>
            <div className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-2 text-center">
              <span className="text-muted-foreground block text-[10px] uppercase">Infants</span>
              <span className="text-sm font-semibold text-[#251605]">
                {typeForm.infantCapacity}
              </span>
            </div>
          </div>
        </section>

        {/* CARD 3: Beds */}
        <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Bed Configuration
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
              onClick={() => setStep(1)}
              aria-label="Edit bed configuration"
            >
              <Edit2 className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            {configuredBeds.length === 0 ? (
              <p className="text-muted-foreground">No beds configured</p>
            ) : (
              configuredBeds.map((bed, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="font-medium text-[#251605]">
                    {bed.numberOfBeds} × {bed.bedType}
                  </span>
                  <span className="text-muted-foreground">{bed.bedSize || "Standard"}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* CARD 4: Pricing Defaults */}
        <section className="rounded-xl border border-[#E6E1D8] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Pricing Defaults
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-[#8A7963] hover:text-[#251605]"
              onClick={() => setStep(2)}
              aria-label="Edit pricing defaults"
            >
              <Edit2 className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Nightly Price:</span>
              <span className="font-semibold text-[#251605]">
                {typeForm.baseNightlyRate ? `ETB ${typeForm.baseNightlyRate}` : "Not set"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Included Occupancy:</span>
              <span className="font-medium text-[#251605]">
                {typeForm.standardOccupancy} {typeForm.standardOccupancy === 1 ? "Guest" : "Guests"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extra Adult Default:</span>
              <span className="text-[#251605]">
                {typeForm.extraAdultRateDefault ? `ETB ${typeForm.extraAdultRateDefault}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extra Child Default:</span>
              <span className="text-[#251605]">
                {typeForm.extraChildRateDefault ? `ETB ${typeForm.extraChildRateDefault}` : "—"}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* CARD 5: Physical Rooms with Actual Room Numbers */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Physical Rooms ({stagedRooms.length})
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rooms created for this room type, organized by location.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#8A7963] hover:text-[#251605]"
            onClick={() => setStep(1)}
            aria-label="Edit physical rooms"
          >
            <Edit2 className="mr-1 h-3 w-3" />
            Edit
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          {Object.entries(groupedRooms).map(([location, rooms]) => (
            <div key={location} className="rounded-lg border border-[#EDE6D8] bg-[#FBF9F5] p-3">
              <span className="text-xs font-medium text-[#251605] block mb-2">{location}</span>
              <div className="flex flex-wrap gap-1.5">
                {rooms.map((room) => (
                  <span
                    key={room.localKey}
                    className="inline-flex items-center gap-1 rounded border border-[#D9D2C4] bg-white px-2 py-0.5 font-mono text-xs font-medium text-[#251605]"
                  >
                    {room.roomNumber}
                    <span className="text-[10px] text-muted-foreground font-sans">
                      {room.persisted ? "✓" : "Staged"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}

          {stagedRooms.length === 0 ? (
            <p className="text-xs text-muted-foreground">No physical rooms created yet.</p>
          ) : null}

          {excludedBulkNumbers.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              Excluded during setup: {excludedBulkNumbers.join(", ")}
            </p>
          )}
        </div>
      </section>

      {/* CARD 6: Amenities Summary */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Amenities ({assignedAmenityNames.length} Assigned)
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Room type standard amenities inherited by physical rooms.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#8A7963] hover:text-[#251605]"
            onClick={() => setStep(3)}
            aria-label="Edit amenities"
          >
            <Edit2 className="mr-1 h-3 w-3" />
            Edit
          </Button>
        </div>
        <div className="mt-3">
          {assignedAmenityNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {assignedAmenityNames.map((name, i) => (
                <span
                  key={i}
                  className="rounded-md border border-[#EDE6D8] bg-[#F7F4EE] px-2.5 py-1 text-xs text-[#251605]"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No room type amenities assigned.</p>
          )}
        </div>
      </section>

      {/* CARD 7: Photos Summary */}
      <section className="rounded-xl border border-[#E6E1D8] bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#EDE6D8] pb-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#251605]">
              Photos ({images.length} {images.length === 1 ? "Image" : "Images"})
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cover image and gallery thumbnails.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#8A7963] hover:text-[#251605]"
            onClick={() => setStep(4)}
            aria-label="Edit photos"
          >
            <Edit2 className="mr-1 h-3 w-3" />
            Edit
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {cover?.url ? (
            <div className="relative">
              <img
                src={cover.url}
                alt={cover.altText ?? "Cover"}
                className="h-20 w-32 rounded-lg border border-[#C89933] object-cover ring-1 ring-[#C89933]"
              />
              <span className="absolute bottom-1 left-1 rounded bg-[#C89933] px-1.5 py-0.2 text-[9px] font-semibold text-[#251605]">
                Cover
              </span>
            </div>
          ) : null}

          {images
            .filter((i) => i.id !== cover?.id)
            .slice(0, 5)
            .map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt=""
                className="h-16 w-24 rounded-lg border border-[#EDE6D8] object-cover"
              />
            ))}

          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">No photos uploaded yet.</p>
          ) : images.length > 6 ? (
            <span className="text-xs text-muted-foreground">+{images.length - 6} more</span>
          ) : null}
        </div>
      </section>

      {/* Sticky Bottom Actions Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D9D2C4] bg-white/95 px-6 py-3.5 backdrop-blur-xs shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
            onClick={() => setStep(4)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to Photos
          </Button>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium px-5"
            onClick={handleComplete}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Complete Room Type Setup
          </Button>
        </div>
      </footer>
    </div>
  );
}
