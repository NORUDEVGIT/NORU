import { useMemo, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import type { HotelRoom, RoomType } from "@/packages/pms/lib/rooms.functions";
import { RoomTypeWizardStep1 } from "./room-type-wizard-step1";
import { RoomTypeWizardStep2Pricing } from "./room-type-wizard-step3-pricing";
import { RoomTypeWizardStep3Amenities } from "./room-type-wizard-step2-amenities";
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
import { RoomTypeWizardContext } from "./room-type-wizard-context";

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
  const [attemptedStep1Submit, setAttemptedStep1Submit] = useState(false);
  const [attemptedStep2Submit, setAttemptedStep2Submit] = useState(false);
  const [typeForm, setTypeForm] = useState<WizardTypeForm>(() =>
    initialType ? wizardTypeFromRow(initialType) : emptyWizardType(),
  );
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(initialType));
  const [roomTypeId, setRoomTypeId] = useState<string | null>(initialType?.id ?? null);
  const [stagedRooms, setStagedRooms] = useState<StagedRoom[]>(() =>
    roomsToStaged(initialRoomsForType),
  );
  const [excludedBulkNumbers, setExcludedBulkNumbers] = useState<string[]>([]);

  const isStep1Valid =
    Boolean(typeForm.name.trim()) &&
    Boolean(typeForm.code.trim()) &&
    Boolean(typeForm.category.trim()) &&
    typeForm.maxOccupancy >= 1 &&
    typeForm.adultCapacity >= 1 &&
    typeForm.adultCapacity <= typeForm.maxOccupancy;

  const isStep2Valid =
    typeForm.standardOccupancy >= 1 &&
    typeForm.standardOccupancy <= typeForm.maxOccupancy &&
    (typeForm.baseNightlyRate.trim() === "" ||
      (!isNaN(Number(typeForm.baseNightlyRate)) && Number(typeForm.baseNightlyRate) >= 0)) &&
    (typeForm.extraAdultRateDefault.trim() === "" ||
      (!isNaN(Number(typeForm.extraAdultRateDefault)) &&
        Number(typeForm.extraAdultRateDefault) >= 0)) &&
    (typeForm.extraChildRateDefault.trim() === "" ||
      (!isNaN(Number(typeForm.extraChildRateDefault)) &&
        Number(typeForm.extraChildRateDefault) >= 0));

  function handleStepClick(targetStep: WizardStepId) {
    if (targetStep === step) return;
    if (targetStep > step) {
      if (step === 1 && !isStep1Valid) {
        setAttemptedStep1Submit(true);
        toast.error("Please fill all required fields before continuing.");
        return;
      }
      if (step === 2 && !isStep2Valid) {
        setAttemptedStep2Submit(true);
        toast.error("Please resolve pricing validation errors before continuing.");
        return;
      }
    }
    setStep(targetStep);
  }

  const value = useMemo<RoomTypeWizardContextValue>(
    () => ({
      restaurantId,
      canEdit,
      step,
      setStep,
      attemptedStep1Submit,
      setAttemptedStep1Submit,
      attemptedStep2Submit,
      setAttemptedStep2Submit,
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
      attemptedStep1Submit,
      attemptedStep2Submit,
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
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D9D2C4] bg-white px-4 py-3 shadow-xs">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-[#251605] hover:bg-[#F4EDE0]"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Room Types
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg text-[#251605]">
                  {roomTypeId ? "Edit Room Type" : "Create Room Type"}
                </h2>
                {typeForm.code ? (
                  <span className="inline-flex items-center gap-1 rounded border border-[#E6E1D8] bg-[#F4EDE0] px-2 py-0.5 font-mono text-xs font-medium text-[#251605]">
                    {typeForm.code}
                    {!codeManuallyEdited ? (
                      <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-[#8A7963]">
                        Auto
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {typeForm.name.trim()
                  ? `${typeForm.name.trim()} · Room Type Setup`
                  : "Guided Room Type Setup · Room specifications, pricing, amenities & photos"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#E6DFD3] bg-[#F7F4EE] px-3 py-1 text-xs font-medium text-[#5C4528]">
              Step {step} of 5
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:bg-[#F4EDE0] hover:text-[#251605]"
              onClick={onClose}
              aria-label="Close wizard"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <nav
          className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[#E6DFD3] bg-[#F7F4EE] p-2"
          aria-label="Room type wizard steps"
        >
          {ROOM_TYPE_WIZARD_STEPS.map((row) => {
            const active = step === row.id;
            const done = step > row.id;
            const canNavigate = row.id === 1 || Boolean(roomTypeId);
            return (
              <button
                key={row.id}
                type="button"
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#251605] text-white shadow-xs ring-1 ring-[#C89933]"
                    : done
                      ? "border border-[#D9D2C4] bg-white text-[#251605] hover:bg-[#F4EDE0]"
                      : "text-muted-foreground hover:text-[#251605] disabled:opacity-50"
                }`}
                onClick={() => {
                  if (canNavigate) handleStepClick(row.id);
                }}
                disabled={!canNavigate}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    active
                      ? "bg-[#C89933] text-[#251605]"
                      : done
                        ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "bg-[#E6DFD3] text-[#5C4528]"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : row.id}
                </span>
                <span>{row.title}</span>
              </button>
            );
          })}
        </nav>

        {step === 1 ? <RoomTypeWizardStep1 /> : null}
        {step === 2 ? <RoomTypeWizardStep2Pricing /> : null}
        {step === 3 ? <RoomTypeWizardStep3Amenities /> : null}
        {step === 4 ? <RoomTypeWizardStep4Photos /> : null}
        {step === 5 ? <RoomTypeWizardStep5Review /> : null}
      </div>
    </RoomTypeWizardContext.Provider>
  );
}
