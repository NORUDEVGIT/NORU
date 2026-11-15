import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getGuest } from "@/packages/pms/lib/guests.functions";
import {
  ACCESSIBLE_ROOM_HELP,
  ACCESSIBLE_ROOM_LABEL,
  CONNECTING_ROOM_HELP,
  CONNECTING_ROOM_LABEL,
  GUEST_ACCESSIBILITY_PROMPT,
  ROOM_REQUIREMENTS_TITLE,
  SOFT_REQUEST_NOTE,
  guestAccessibilityNote,
  type RoomRequirements,
} from "@/packages/pms/lib/reservation-room-requirements";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

type FieldsProps = {
  idPrefix: string;
  title?: string;
  value: RoomRequirements;
  onChange: (patch: Partial<RoomRequirements>) => void;
  disabled?: boolean;
  disabledNote?: string | null;
  assignedRoomWarning?: string | null;
  showSoftRequestNote?: boolean;
  className?: string;
  /** Set when the room is paired: the connecting requirement stays on and this note explains why. */
  connectingLockedNote?: string | null;
  /** The "Connects to" control, shown under the connecting requirement. */
  pairing?: ReactNode;
};

/**
 * Per room unit hard requirements. Two checkboxes, nothing inferred.
 * The guest accessibility prompt is context only and never ticks the box.
 */
export function RoomRequirementsFields({
  restaurantId,
  guestId = null,
  ...props
}: FieldsProps & {
  restaurantId: string;
  /** Guest whose saved accessibility text is offered as context. */
  guestId?: string | null;
}) {
  const fetchGuest = useServerFn(getGuest);
  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestId! } }),
    enabled: Boolean(restaurantId && guestId),
    retry: false,
  });
  return (
    <RoomRequirementsView
      {...props}
      guestAccessibilityText={guestQuery.data?.preferences.accessibilityRequirements ?? null}
    />
  );
}

/** Presentational part. Takes the guest's saved accessibility text as plain data. */
export function RoomRequirementsView({
  idPrefix,
  title = ROOM_REQUIREMENTS_TITLE,
  value,
  onChange,
  disabled = false,
  disabledNote = null,
  guestAccessibilityText = null,
  assignedRoomWarning = null,
  showSoftRequestNote = false,
  className,
  connectingLockedNote = null,
  pairing = null,
  initiallyOpen = false,
}: FieldsProps & {
  guestAccessibilityText?: string | null;
  /** Opens the saved guest text on first render. */
  initiallyOpen?: boolean;
}) {
  const accessibleId = `${idPrefix}-accessible-room-required`;
  const connectingId = `${idPrefix}-connecting-room-required`;
  return (
    <div
      className={cn("space-y-1.5 rounded-[6px] border border-[#E7E0D4] bg-white p-2.5", className)}
      data-testid={`${idPrefix}-room-requirements`}
    >
      <p className="text-xs font-semibold text-[#251605]">{title}</p>
      <RequirementRow
        id={accessibleId}
        label={ACCESSIBLE_ROOM_LABEL}
        help={ACCESSIBLE_ROOM_HELP}
        checked={value.accessibleRoomRequired}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ accessibleRoomRequired: checked })}
      />
      <GuestAccessibilityPrompt
        text={guestAccessibilityText}
        idPrefix={idPrefix}
        initiallyOpen={initiallyOpen}
      />
      <RequirementRow
        id={connectingId}
        label={CONNECTING_ROOM_LABEL}
        help={CONNECTING_ROOM_HELP}
        checked={value.connectingRoomRequired}
        disabled={disabled || connectingLockedNote !== null}
        onCheckedChange={(checked) => onChange({ connectingRoomRequired: checked })}
      />
      {connectingLockedNote && !disabled ? (
        <p className="ml-6 text-[11px] text-[#6B5E4E]" data-testid={`${idPrefix}-connecting-locked`}>
          {connectingLockedNote}
        </p>
      ) : null}
      {pairing ? <div className="ml-6">{pairing}</div> : null}
      {disabled && disabledNote ? (
        <p className="text-[11px] text-[#6B5E4E]" data-testid={`${idPrefix}-requirements-disabled`}>
          {disabledNote}
        </p>
      ) : null}
      {assignedRoomWarning ? (
        <p
          className="rounded-[6px] border border-[#E7D7B0] bg-[#FBF6EE] px-2 py-1 text-[11px] text-[#8A641A]"
          role="status"
          data-testid={`${idPrefix}-assigned-room-warning`}
        >
          {assignedRoomWarning}
        </p>
      ) : null}
      {showSoftRequestNote ? (
        <p className="text-[11px] text-[#6B5E4E]" data-testid={`${idPrefix}-soft-request-note`}>
          {SOFT_REQUEST_NOTE}
        </p>
      ) : null}
    </div>
  );
}

function RequirementRow({
  id,
  label,
  help,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        data-testid={id}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-xs font-medium text-[#251605]">{label}</span>
        <span className="block text-[11px] text-[#6B5E4E]">{help}</span>
      </label>
    </div>
  );
}

/** Quiet notice when the guest profile holds accessibility text. It never sets a requirement. */
function GuestAccessibilityPrompt({
  text,
  idPrefix,
  initiallyOpen,
}: {
  text: string | null;
  idPrefix: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const note = guestAccessibilityNote(text);
  if (!note) return null;
  return (
    <div
      className="ml-6 space-y-1 text-[11px] text-[#6B5E4E]"
      data-testid={`${idPrefix}-guest-accessibility-prompt`}
    >
      <p>
        {GUEST_ACCESSIBILITY_PROMPT}{" "}
        <button
          type="button"
          className="font-medium underline-offset-2 hover:underline"
          data-testid={`${idPrefix}-guest-accessibility-toggle`}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide" : "View"}
        </button>
      </p>
      {open ? (
        <p
          className="whitespace-pre-wrap rounded-[6px] bg-[#FAF8F4] px-2 py-1 text-[#251605]"
          data-testid={`${idPrefix}-guest-accessibility-text`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
