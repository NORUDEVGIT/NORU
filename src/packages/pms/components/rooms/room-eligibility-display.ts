import { eligibilityCodeLabel, preferenceReasonLabel } from "./room-inventory-utils";

export interface EligibilityStaffLine {
  tone: "pass" | "warn" | "fail";
  text: string;
}

type EligibilityNote = Record<string, string | number | boolean | null>;

export interface EligibilityStaffInput {
  source: "canonical" | "legacy";
  eligible: boolean;
  blockers: EligibilityNote[];
  warnings: EligibilityNote[];
  preferenceReasons: string[];
  arrival: string;
  departure: string;
  guests: number;
  maxOccupancy: number | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  operationalStatus: string | null;
  bedPreference: string | null;
  roomBeds: string | null;
  buildingPreference: string | null;
  roomBuilding: string | null;
  floorPreference: string | null;
  roomFloor: string | null;
  accessibleRequired: boolean;
  connectingRequired: boolean;
  forCheckIn: boolean;
  /** True when the inspected room's type is the type sent with the request. */
  roomTypeAligned: boolean;
}

const HANDLED_CODES = new Set([
  "ROOM_NOT_FOUND",
  "ROOM_INACTIVE",
  "ROOM_ALREADY_BOOKED",
  "ROOM_TYPE_NOT_FOUND",
  "ROOM_TYPE_MISMATCH",
  "OCCUPANCY_EXCEEDED",
  "ROOM_OPERATIONALLY_UNAVAILABLE",
  "ROOM_BLOCKED",
  "WARNING_BLOCK",
  "HOUSEKEEPING_NOT_READY",
  "MAINTENANCE_NOT_CLEAR",
  "ACCESSIBILITY_MISMATCH",
  "CONNECTING_ROOM_REQUIRED",
  "BED_TYPE_MISMATCH",
  "BUILDING_PREFERENCE_MISS",
  "FLOOR_PREFERENCE_MISS",
  "GUEST_PREFERENCE_MISS",
  "ROOM_NOT_SELLABLE",
]);

function codes(notes: EligibilityNote[]): Set<string> {
  const found = new Set<string>();
  for (const note of notes) {
    if (typeof note.code === "string" && note.code.trim()) found.add(note.code);
  }
  return found;
}

function staffStatus(value: string | null | undefined): string {
  if (!value) return "";
  if (value === "out_of_order") return "Out of Order";
  if (value === "out_of_service") return "Out of Service";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function staffBed(value: string | null | undefined): string {
  if (!value) return "";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function stayNightCount(arrival: string, departure: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival) || !/^\d{4}-\d{2}-\d{2}$/.test(departure)) return null;
  if (departure <= arrival) return null;
  const start = Date.parse(`${arrival}T00:00:00Z`);
  const end = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function compactStayRange(arrival: string, departure: string): string {
  const start = new Date(`${arrival.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${departure.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return "these dates";
  const day = (date: Date) => String(date.getUTCDate());
  const month = (date: Date) =>
    date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    return `${day(start)}–${day(end)} ${month(start)}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
  }
  return `${day(start)} ${month(start)} ${start.getUTCFullYear()} – ${day(end)} ${month(end)} ${end.getUTCFullYear()}`;
}

function guestNoun(guests: number): string {
  return `${guests} ${guests === 1 ? "guest" : "guests"}`;
}

export function eligibilityStaffLines(input: EligibilityStaffInput): EligibilityStaffLine[] {
  const range = compactStayRange(input.arrival, input.departure);
  if (input.source !== "canonical") {
    return [
      input.eligible
        ? { tone: "pass", text: `Available for ${range}` }
        : { tone: "fail", text: "This room is not available for these dates." },
    ];
  }

  const blockers = codes(input.blockers);
  const warnings = codes(input.warnings);
  const reasons = new Set(input.preferenceReasons);
  const lines: EligibilityStaffLine[] = [];
  const found = !blockers.has("ROOM_NOT_FOUND");

  if (blockers.has("ROOM_NOT_FOUND"))
    lines.push({ tone: "fail", text: "This room could not be found." });
  if (blockers.has("ROOM_INACTIVE")) lines.push({ tone: "fail", text: "This room is inactive." });

  if (blockers.has("ROOM_ALREADY_BOOKED")) {
    lines.push({ tone: "fail", text: "Already assigned to another reservation for these dates." });
  } else if (found) {
    lines.push({ tone: "pass", text: `Available for ${range}` });
  }

  if (blockers.has("ROOM_TYPE_NOT_FOUND")) {
    lines.push({ tone: "fail", text: "Room type could not be found." });
  } else if (blockers.has("ROOM_TYPE_MISMATCH")) {
    lines.push({ tone: "fail", text: "Room type does not match this stay." });
  } else if (found && input.roomTypeAligned) {
    lines.push({ tone: "pass", text: "Room type matches this stay." });
  }

  if (blockers.has("OCCUPANCY_EXCEEDED")) {
    lines.push({ tone: "fail", text: `Capacity does not support ${guestNoun(input.guests)}.` });
  } else if (found) {
    lines.push({
      tone: "pass",
      text:
        input.maxOccupancy != null && input.guests <= input.maxOccupancy
          ? `Capacity supports ${guestNoun(input.guests)}`
          : `Occupancy accepted for ${guestNoun(input.guests)}`,
    });
  }

  if (blockers.has("ROOM_OPERATIONALLY_UNAVAILABLE")) {
    const note = input.blockers.find((item) => item.code === "ROOM_OPERATIONALLY_UNAVAILABLE");
    const status = staffStatus(
      typeof note?.status === "string" ? note.status : input.operationalStatus,
    );
    lines.push({
      tone: "fail",
      text: status ? `Room is ${status}` : "Room is not available to assign.",
    });
  } else if (
    found &&
    input.operationalStatus !== "out_of_order" &&
    input.operationalStatus !== "out_of_service"
  ) {
    lines.push({ tone: "pass", text: "No Out of Order / Out of Service restriction" });
  }

  if (blockers.has("ROOM_BLOCKED")) {
    lines.push({ tone: "fail", text: "A room block conflicts with these dates." });
  } else if (found) {
    lines.push({ tone: "pass", text: "No room block conflict" });
  }

  if (warnings.has("WARNING_BLOCK")) {
    lines.push({ tone: "warn", text: "An operational warning applies for these dates." });
  }

  if (blockers.has("HOUSEKEEPING_NOT_READY")) {
    const label = staffStatus(input.housekeepingStatus);
    lines.push({
      tone: "fail",
      text: label ? `Housekeeping status is ${label}` : "Housekeeping is not ready.",
    });
  } else if (found && input.forCheckIn) {
    const ready = input.housekeepingStatus === "clean" || input.housekeepingStatus === "inspected";
    lines.push({
      tone: "pass",
      text: ready
        ? `Housekeeping status is ${staffStatus(input.housekeepingStatus)}`
        : "Ready for check-in",
    });
  } else if (
    found &&
    (input.housekeepingStatus === "clean" || input.housekeepingStatus === "inspected")
  ) {
    lines.push({
      tone: "pass",
      text: `Housekeeping status is ${staffStatus(input.housekeepingStatus)}`,
    });
  }

  if (blockers.has("MAINTENANCE_NOT_CLEAR")) {
    const label = staffStatus(input.maintenanceStatus);
    lines.push({
      tone: "fail",
      text:
        label && input.maintenanceStatus && input.maintenanceStatus !== "normal"
          ? `Maintenance status is ${label}`
          : "A maintenance restriction prevents assignment.",
    });
  } else if (found && (!input.maintenanceStatus || input.maintenanceStatus === "normal")) {
    lines.push({ tone: "pass", text: "No maintenance restriction" });
  }

  if (blockers.has("ACCESSIBILITY_MISMATCH")) {
    lines.push({ tone: "fail", text: "Accessible room required; this room is not accessible." });
  } else if (found && input.accessibleRequired) {
    lines.push({ tone: "pass", text: "Room meets the accessibility requirement." });
  }

  if (blockers.has("CONNECTING_ROOM_REQUIRED")) {
    lines.push({ tone: "fail", text: "Connecting room required; this room is not connecting." });
  } else if (found && input.connectingRequired) {
    lines.push({ tone: "pass", text: "Connecting room is available." });
  }

  if (blockers.has("BED_TYPE_MISMATCH")) {
    const prefers = staffBed(input.bedPreference);
    const has = input.roomBeds?.trim();
    lines.push({
      tone: "fail",
      text:
        prefers && has
          ? `Guest prefers ${prefers} bed; this room has ${has}`
          : "Bed preference does not match this room.",
    });
  } else if (found && input.bedPreference) {
    lines.push({ tone: "pass", text: "Bed preference matches this room." });
  }

  if (warnings.has("BUILDING_PREFERENCE_MISS")) {
    lines.push({
      tone: "warn",
      text: input.buildingPreference
        ? `Building preference is ${input.buildingPreference}; this room is in ${input.roomBuilding || "another building"}.`
        : "Building preference does not match.",
    });
  } else if (reasons.has("building_match")) {
    lines.push({ tone: "pass", text: `${preferenceReasonLabel("building_match")}.` });
  }

  if (warnings.has("FLOOR_PREFERENCE_MISS")) {
    lines.push({
      tone: "warn",
      text: input.floorPreference
        ? `Floor preference is ${input.floorPreference}; this room is on ${input.roomFloor || "another floor"}.`
        : "Floor preference does not match.",
    });
  } else if (reasons.has("floor_match")) {
    lines.push({ tone: "pass", text: `${preferenceReasonLabel("floor_match")}.` });
  }

  if (warnings.has("GUEST_PREFERENCE_MISS")) {
    lines.push({ tone: "warn", text: "Guest preferences do not match." });
  } else if (reasons.has("guest_preference_match")) {
    lines.push({ tone: "pass", text: `${preferenceReasonLabel("guest_preference_match")}.` });
  }

  if (blockers.has("ROOM_NOT_SELLABLE")) {
    lines.push({ tone: "fail", text: "This room is not sellable." });
  }

  for (const note of input.blockers) {
    const code = typeof note.code === "string" ? note.code : "";
    if (!code || HANDLED_CODES.has(code)) continue;
    lines.push({ tone: "fail", text: eligibilityCodeLabel(code) });
  }
  for (const note of input.warnings) {
    const code = typeof note.code === "string" ? note.code : "";
    if (!code || HANDLED_CODES.has(code)) continue;
    lines.push({ tone: "warn", text: eligibilityCodeLabel(code) });
  }

  return lines;
}

export function staffEligibilityError(error: unknown): string {
  const text = (error instanceof Error ? error.message : "").replace(/\s+/g, " ").trim();
  if (/departure must be after arrival|INVALID_DATES/i.test(text)) {
    return "Departure must be after arrival.";
  }
  if (/ROOM_NOT_FOUND/i.test(text)) return "That room could not be found.";
  if (/ROOM_TYPE_NOT_FOUND/i.test(text)) return "This room's type could not be found.";
  if (/PROPERTY_NOT_FOUND/i.test(text)) return "This property could not be found.";
  if (/INSUFFICIENT_PRIVILEGE|forbidden|not authorized|permission/i.test(text)) {
    return "You do not have permission to check assignment eligibility.";
  }
  if (/adults|children/i.test(text) && /number|integer|\b99\b/i.test(text)) {
    return "Adults and children must be whole numbers from 0 to 99.";
  }
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text) ||
    text.includes("{") ||
    text.includes("pms_") ||
    text.includes("_id")
  ) {
    return "Eligibility could not be checked. Try again.";
  }
  if (text && text.length <= 140 && !text.includes("_")) return text;
  return "Eligibility could not be checked. Try again.";
}
