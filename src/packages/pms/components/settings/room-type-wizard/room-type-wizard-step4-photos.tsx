import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { listRoomTypes, type RoomType } from "@/packages/pms/lib/rooms.functions";
import { RoomTypeImagesDialog } from "@/packages/pms/components/rooms/room-type-dialogs";
import { useState } from "react";
import { useRoomTypeWizard } from "./room-type-wizard";

export function RoomTypeWizardStep4Photos() {
  const { restaurantId, canEdit, roomTypeId, typeForm, setStep } = useRoomTypeWizard();
  const fetchTypes = useServerFn(listRoomTypes);
  const [open, setOpen] = useState(true);

  const typesQuery = useQuery({
    queryKey: ["pms-card2-room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId, includeInactive: true } }),
    enabled: Boolean(roomTypeId),
  });

  const roomType: RoomType | null =
    typesQuery.data?.find((row) => row.id === roomTypeId) ??
    (roomTypeId
      ? ({
          id: roomTypeId,
          code: typeForm.code,
          name: typeForm.name,
          shortName: typeForm.shortName || null,
          displayName: typeForm.displayName || null,
          description: typeForm.description || null,
          category: typeForm.category || null,
          class: typeForm.class || null,
          maxOccupancy: typeForm.maxOccupancy,
          standardOccupancy: typeForm.standardOccupancy,
          adultCapacity: typeForm.adultCapacity,
          childCapacity: typeForm.childCapacity,
          infantCapacity: typeForm.infantCapacity,
          extraGuestAllowed: typeForm.extraGuestAllowed,
          extraBedAllowed: typeForm.extraBedAllowed,
          connectingEligible: typeForm.connectingEligible,
          accessibleEligible: typeForm.accessibleEligible,
          smokingPolicy: typeForm.smokingPolicy,
          bedType: null,
          bedCount: null,
          roomSize: typeForm.roomSize || null,
          roomView: typeForm.roomView || null,
          sellable: typeForm.sellable,
          active: typeForm.active,
          defaultBuildingId: typeForm.defaultBuildingId || null,
          defaultWingId: typeForm.defaultWingId || null,
          preferredFloorId: typeForm.preferredFloorId || null,
          baseNightlyRate: null,
          extraAdultRateDefault: null,
          extraChildRateDefault: null,
          beds: [],
          amenityIds: [],
          roomCount: 0,
          coverUrl: null,
        } satisfies RoomType)
      : null);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#CCCCCC] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg text-[#251605]">Photos</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload, set cover, reorder, and delete images for{" "}
          <span className="font-medium text-[#251605]">
            {typeForm.name}
            {typeForm.code ? ` · ${typeForm.code}` : ""}
          </span>
          . Requires a persisted room type id.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            disabled={!roomTypeId}
            onClick={() => setOpen(true)}
          >
            Manage images
          </Button>
        </div>
      </section>

      <RoomTypeImagesDialog
        open={open && Boolean(roomType)}
        onOpenChange={setOpen}
        restaurantId={restaurantId}
        roomType={roomType}
        canEdit={canEdit}
      />

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(3)}>
          Back
        </Button>
        <Button type="button" onClick={() => setStep(5)}>
          Continue to Review
        </Button>
      </div>
    </div>
  );
}
