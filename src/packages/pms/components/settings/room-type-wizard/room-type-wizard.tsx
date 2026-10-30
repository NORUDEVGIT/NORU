import { createContext, useContext, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import type { HotelRoom, RoomType } from "@/packages/pms/lib/rooms.functions";
import { RoomTypeWizardStep1 } from "./room-type-wizard-step1";
import { RoomTypeWizardStep2Amenities } from "./room-type-wizard-step2-amenities";
import { RoomTypeWizardStep3Pricing } from "./room-type-wizard-step3-pricing";
import { RoomTypeWizardStep4Photos } from "./room-type-wizard-step4-photos";
import { RoomTypeWizardStep5Review } from "./room-type-wizard-step5-review";
import {
  ROOM_TYPE_WIZARD_STEPS,
  emptyWizardType,
  wizardTypeFromRow,
  type StagedRoom,
  type WizardStepId,
  type WizardTypeForm,
} from "./room-type-wizard-types";

export type RoomTypeWizardContextValue = {
  restaurantId: string;
  canEdit: boolean;
  step: WizardStepId;
  setStep: (step: WizardStepId) => void;
  typeForm: WizardTypeForm;
  setTypeForm: React.Dispatch<React.SetStateAction<WizardTypeForm>>;
  codeManuallyEdited: boolean;
  setCodeManuallyEdited: (value: boolean) => void;
  roomTypeId: string | null;
  setRoomTypeId: (id: string | null) => void;
  stagedRooms: StagedRoom[];
  setStagedRooms: React.Dispatch<React.SetStateAction<StagedRoom[]>>;
  excludedBulkNumbers: string[];
  setExcludedBulkNumbers: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onCompleted: () => void;
};

const RoomTypeWizardContext = createContext<RoomTypeWizardContextValue | null>(null);

export function useRoomTypeWizard(): RoomTypeWizardContextValue {
  const ctx = useContext(RoomTypeWizardContext);
  if (!ctx) throw new Error("useRoomTypeWizard must be used inside RoomTypeWizard");
  return ctx;
}

function roomsToStaged(rooms: HotelRoom[]): StagedRoom[] {
  return rooms.map((room) => ({
    localKey: room.id,
    id: room.id,
    roomNumber: room.roomNumber,
    roomCode: room.roomCode ?? room.roomNumber,
    buildingId: room.buildingId ?? "",
    buildingName: room.building ?? "",
    wingId: room.wingId ?? "",
    wingName: room.wing ?? "",
    floorId: room.floorId ?? "",
    floorName: room.floor ?? "",
    notes: room.notes ?? "",
    sellable: room.sellable,
    active: room.active,
    smoking: room.smoking,
    accessible: room.accessible,
    roomFeatures: room.roomFeatures ?? [],
    persisted: true,
  }));
}

export function RoomTypeWizard({
  restaurantId,
  canEdit,
  initialType,
  initialRoomsForType = [],
  onClose,
  onCompleted,
}: {
  restaurantId: string;
  canEdit: boolean;
  initialType?: RoomType | null;
  initialRoomsForType?: HotelRoom[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<WizardStepId>(1);
  const [typeForm, setTypeForm] = useState<WizardTypeForm>(() =>
    initialType ? wizardTypeFromRow(initialType) : emptyWizardType(),
  );
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(initialType));
  const [roomTypeId, setRoomTypeId] = useState<string | null>(initialType?.id ?? null);
  const [stagedRooms, setStagedRooms] = useState<StagedRoom[]>(() =>
    roomsToStaged(initialRoomsForType),
  );
  const [excludedBulkNumbers, setExcludedBulkNumbers] = useState<string[]>([]);

  const value = useMemo<RoomTypeWizardContextValue>(
    () => ({
      restaurantId,
      canEdit,
      step,
      setStep,
      typeForm,
      setTypeForm,
      codeManuallyEdited,
      setCodeManuallyEdited,
      roomTypeId,
      setRoomTypeId,
      stagedRooms,
      setStagedRooms,
      excludedBulkNumbers,
      setExcludedBulkNumbers,
      onClose,
      onCompleted,
    }),
    [
      restaurantId,
      canEdit,
      step,
      typeForm,
      codeManuallyEdited,
      roomTypeId,
      stagedRooms,
      excludedBulkNumbers,
      onClose,
      onCompleted,
    ],
  );

  return (
    <RoomTypeWizardContext.Provider value={value}>
      <div className="space-y-4" data-testid="pms-card2-room-type-wizard">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D9D2C4] bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to list
            </Button>
            <div>
              <h2 className="font-display text-lg text-[#251605]">
                {roomTypeId ? "Edit room type setup" : "New room type setup"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {typeForm.name.trim()
                  ? `${typeForm.name.trim()}${typeForm.code ? ` · ${typeForm.code}` : ""}`
                  : "Guided setup keeps this room type in context."}
              </p>
            </div>
          </div>
        </div>

        <nav
          className="flex flex-wrap gap-2 rounded-xl border border-[#E6DFD3] bg-[#F7F4EE] p-3"
          aria-label="Room type wizard steps"
        >
          {ROOM_TYPE_WIZARD_STEPS.map((row) => {
            const active = step === row.id;
            const done = step > row.id;
            return (
              <button
                key={row.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  active
                    ? "bg-[#251605] text-white"
                    : done
                      ? "bg-white text-[#251605] border border-[#D9D2C4]"
                      : "text-muted-foreground"
                }`}
                onClick={() => {
                  if (row.id === 1 || roomTypeId) setStep(row.id);
                }}
                disabled={row.id > 1 && !roomTypeId}
              >
                {row.id}. {row.title}
              </button>
            );
          })}
        </nav>

        {step === 1 ? <RoomTypeWizardStep1 /> : null}
        {step === 2 ? <RoomTypeWizardStep2Amenities /> : null}
        {step === 3 ? <RoomTypeWizardStep3Pricing /> : null}
        {step === 4 ? <RoomTypeWizardStep4Photos /> : null}
        {step === 5 ? <RoomTypeWizardStep5Review /> : null}
      </div>
    </RoomTypeWizardContext.Provider>
  );
}
