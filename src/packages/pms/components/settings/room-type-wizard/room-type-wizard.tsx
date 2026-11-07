import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
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
import {
  RoomTypeWizardContext,
  type RoomTypeWizardContextValue,
  type RoomTypeWizardFooterConfig,
} from "./room-type-wizard-context";

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
  initialStep = 1,
  onClose,
  onCompleted,
}: {
  restaurantId: string;
  canEdit: boolean;
  initialType?: RoomType | null;
  initialRoomsForType?: HotelRoom[];
  initialStep?: WizardStepId;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<WizardStepId>(initialStep);
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
  const [footer, setFooter] = useState<RoomTypeWizardFooterConfig | null>(null);

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
      setFooter,
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

  const isReview = step === 5;
  const title = initialType?.id ? "Edit Room Type" : "Create Room Type";

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        overlayClassName="bg-[#1F140A]/70"
        data-testid="pms-card2-room-type-wizard"
        className={cn(
          "z-50 flex max-h-[88vh] min-h-0 w-[min(900px,calc(100vw-48px))] max-w-none sm:max-w-none",
          "flex-col gap-0 overflow-hidden rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE] p-0 shadow-xl",
          "[&>button.absolute]:hidden",
        )}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <RoomTypeWizardContext.Provider value={value}>
          <header className="relative shrink-0 bg-[#1F140A] px-5 py-2.5 pr-12 text-[#F3E9D8]">
            <DialogTitle className="font-display text-sm font-semibold text-white">{title}</DialogTitle>
            <DialogDescription className="text-[11px] text-[#C4B6A0]">
              Step {step} of 5
            </DialogDescription>
            <button
              type="button"
              className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#C89933]" aria-hidden />
          </header>

          <nav
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#E6DFD3] bg-[#FBF9F5] px-3 py-1.5"
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
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[#C89933] text-[#251605] shadow-xs"
                      : done
                        ? "text-[#251605] hover:bg-[#F4EDE0]"
                        : "text-muted-foreground hover:text-[#251605] disabled:opacity-50"
                  }`}
                  onClick={() => {
                    if (canNavigate) handleStepClick(row.id);
                  }}
                  disabled={!canNavigate}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                      active
                        ? "bg-[#251605] text-white"
                        : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[#E6DFD3] text-[#5C4528]"
                    }`}
                  >
                    {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : row.id}
                  </span>
                  <span className="whitespace-nowrap">{row.title}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === 1 ? <RoomTypeWizardStep1 /> : null}
            {step === 2 ? <RoomTypeWizardStep2Pricing /> : null}
            {step === 3 ? <RoomTypeWizardStep3Amenities /> : null}
            {step === 4 ? <RoomTypeWizardStep4Photos /> : null}
            {step === 5 ? <RoomTypeWizardStep5Review /> : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#D9D2C4] bg-white px-5 py-3">
            {step === 1 ? (
              <Button
                type="button"
                variant="outline"
                className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
                onClick={onClose}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="border-[#D9D2C4] text-[#251605] hover:bg-[#F4EDE0]"
                onClick={() => setStep((step - 1) as WizardStepId)}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              type="button"
              disabled={!footer || footer.continueDisabled}
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 font-medium"
              onClick={() => footer?.onContinue()}
            >
              {isReview ? <CheckCircle2 className="mr-1.5 h-4 w-4" /> : null}
              {footer?.continueBusy ? "Saving…" : (footer?.continueLabel ?? "Continue")}
              {!isReview ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
            </Button>
          </footer>
        </RoomTypeWizardContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
