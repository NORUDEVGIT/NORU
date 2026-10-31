import { createContext, useContext } from "react";
import type { StagedRoom, WizardStepId, WizardTypeForm } from "./room-type-wizard-types";

export type RoomTypeWizardContextValue = {
  restaurantId: string;
  canEdit: boolean;
  step: WizardStepId;
  setStep: (step: WizardStepId) => void;
  attemptedStep1Submit: boolean;
  setAttemptedStep1Submit: (val: boolean) => void;
  attemptedStep2Submit: boolean;
  setAttemptedStep2Submit: (val: boolean) => void;
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

export const RoomTypeWizardContext = createContext<RoomTypeWizardContextValue | null>(null);

export function useRoomTypeWizard(): RoomTypeWizardContextValue {
  const ctx = useContext(RoomTypeWizardContext);
  if (!ctx) {
    throw new Error("useRoomTypeWizard must be used inside RoomTypeWizard");
  }
  return ctx;
}
