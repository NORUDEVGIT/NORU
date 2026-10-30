import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { listRoomTypeImages } from "@/packages/pms/lib/rooms.functions";
import { listRoomTypeAmenities } from "@/packages/pms/lib/rooms-amenities.functions";
import { useRoomTypeWizard } from "./room-type-wizard";

export function RoomTypeWizardStep5Review() {
  const {
    restaurantId,
    roomTypeId,
    typeForm,
    stagedRooms,
    setStep,
    onCompleted,
  } = useRoomTypeWizard();

  const fetchImages = useServerFn(listRoomTypeImages);
  const fetchTypeAmenities = useServerFn(listRoomTypeAmenities);

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

  const images = imagesQuery.data ?? [];
  const cover = images.find((i) => i.isCover) ?? images[0];
  const amenityCount =
    amenitiesQuery.data && amenitiesQuery.data.ok ? amenitiesQuery.data.amenityIds.length : 0;

  const buildingBreakdown = stagedRooms.reduce<Record<string, number>>((acc, room) => {
    const key = room.buildingName || "Unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const advancedNotes: string[] = [];
  if (typeForm.displayName.trim() && typeForm.displayName.trim() !== typeForm.name.trim()) {
    advancedNotes.push(`Display name: ${typeForm.displayName}`);
  }
  if (typeForm.class.trim()) advancedNotes.push(`Class: ${typeForm.class}`);
  if (typeForm.smokingPolicy !== "non_smoking") {
    advancedNotes.push(`Smoking: ${typeForm.smokingPolicy}`);
  }
  if (typeForm.accessibleEligible) advancedNotes.push("Accessible eligible");
  if (typeForm.defaultBuildingId) advancedNotes.push("Default building set");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm space-y-5">
        <div>
          <h3 className="font-display text-lg text-[#251605]">Review & Complete</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm what is already saved. Completing returns to the Room Types list — this step
            does not run a second competing save.
          </p>
        </div>

        <ReviewBlock title="Room Type">
          <p>
            {typeForm.name} · {typeForm.code}
          </p>
          <p className="text-muted-foreground">{typeForm.category || "No category"}</p>
        </ReviewBlock>

        <ReviewBlock title="Capacity">
          <p>
            Max {typeForm.maxOccupancy} · Adults {typeForm.adultCapacity} · Children{" "}
            {typeForm.childCapacity} · Infants {typeForm.infantCapacity}
          </p>
        </ReviewBlock>

        <ReviewBlock title="Beds">
          {typeForm.beds.filter((b) => b.bedType.trim()).length === 0 ? (
            <p className="text-muted-foreground">No beds configured</p>
          ) : (
            typeForm.beds
              .filter((b) => b.bedType.trim())
              .map((b, i) => (
                <p key={i}>
                  {b.numberOfBeds} × {b.bedType}
                  {b.bedSize ? ` (${b.bedSize})` : ""}
                </p>
              ))
          )}
        </ReviewBlock>

        <ReviewBlock title="Room Options">
          <p>
            Active: {typeForm.active ? "Yes" : "No"} · Sellable: {typeForm.sellable ? "Yes" : "No"} ·
            Extra guest: {typeForm.extraGuestAllowed ? "Yes" : "No"} · Extra bed:{" "}
            {typeForm.extraBedAllowed ? "Yes" : "No"} · Connecting eligible:{" "}
            {typeForm.connectingEligible ? "Yes" : "No"}
          </p>
        </ReviewBlock>

        <ReviewBlock title="Physical Rooms">
          <p>{stagedRooms.length} room(s)</p>
          {Object.entries(buildingBreakdown).map(([building, count]) => (
            <p key={building} className="text-muted-foreground">
              {building}: {count}
            </p>
          ))}
        </ReviewBlock>

        <ReviewBlock title="Amenities">
          <p>{amenityCount} assigned on the room type</p>
        </ReviewBlock>

        <ReviewBlock title="Pricing Defaults">
          <p>
            Base: {typeForm.baseNightlyRate || "—"} · Included: {typeForm.standardOccupancy} · Extra
            adult: {typeForm.extraAdultRateDefault || "—"} · Extra child:{" "}
            {typeForm.extraChildRateDefault || "—"}
          </p>
        </ReviewBlock>

        <ReviewBlock title="Photos">
          <p>
            {images.length} image(s)
            {cover ? ` · Cover set` : ""}
          </p>
          {cover?.url ? (
            <img src={cover.url} alt="" className="mt-2 h-20 w-28 rounded-md object-cover" />
          ) : null}
        </ReviewBlock>

        {advancedNotes.length > 0 ? (
          <ReviewBlock title="Advanced Settings">
            {advancedNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </ReviewBlock>
        ) : null}
      </section>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(4)}>
          Back
        </Button>
        <Button type="button" onClick={onCompleted}>
          Complete setup
        </Button>
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="mt-1 text-sm text-[#251605]">{children}</div>
    </div>
  );
}
