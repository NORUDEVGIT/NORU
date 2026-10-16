import type { DepositComputeQuote } from "@/packages/pms/lib/create-reservation-step4";

export type RoomPolicyValues = {
  cancellation: string;
  noShow: string;
  earlyDeparture: string;
  refundability: string;
  depositName: string;
  depositType: string;
  depositValue: string;
  depositRequired: string;
};

export type RoomingSummaryInput = {
  occupantName: string | null;
  roomTypeName: string;
  ratePlanName: string;
  adults: number;
  children: number;
  infants: number;
};

export type GroupRoomMoney = {
  subtotal: number | null;
  nightlyRates: number[];
};

function clean(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text || text === "—") return "";
  return text.replace(/\s+/g, " ");
}

function joinParts(parts: Array<string | null | undefined>): string {
  const rows = parts.map(clean).filter(Boolean);
  return rows.length > 0 ? rows.join(" · ") : "—";
}

function normalize(value: string): string {
  return clean(value).toLowerCase();
}

export function roomPolicyFromLabels(input: {
  cancellationName?: string | null;
  cancellationLabel?: string | null;
  noShowName?: string | null;
  noShowPenalty?: string | null;
  earlyDepartureName?: string | null;
  earlyDeparturePenalty?: string | null;
  refundabilityKind?: string | null;
  refundabilityLabel?: string | null;
  depositName?: string | null;
  depositType?: string | null;
  depositValue?: number | null;
  depositRequired?: boolean | null;
}): RoomPolicyValues {
  const refund =
    input.refundabilityKind === "non_refundable"
      ? "Non-refundable"
      : input.refundabilityKind === "refundable"
        ? "Refundable"
        : clean(input.refundabilityLabel);
  const depositValue =
    input.depositValue == null || !Number.isFinite(input.depositValue)
      ? "—"
      : String(input.depositValue);
  return {
    cancellation: joinParts([input.cancellationName, input.cancellationLabel]),
    noShow: joinParts([input.noShowName, input.noShowPenalty]),
    earlyDeparture: joinParts([input.earlyDepartureName, input.earlyDeparturePenalty]),
    refundability: refund || "—",
    depositName: clean(input.depositName) || "—",
    depositType: clean(input.depositType) || "—",
    depositValue,
    depositRequired: input.depositRequired == null ? "—" : input.depositRequired ? "yes" : "no",
  };
}

function stayKey(policy: RoomPolicyValues): string {
  return [policy.cancellation, policy.noShow, policy.earlyDeparture, policy.refundability]
    .map(normalize)
    .join("|");
}

function depositKey(policy: RoomPolicyValues): string {
  return [policy.depositName, policy.depositType, policy.depositValue, policy.depositRequired]
    .map(normalize)
    .join("|");
}

export function stayPoliciesAreShared(policies: Array<RoomPolicyValues | null>): boolean {
  if (policies.length <= 1) return true;
  if (policies.some((policy) => policy == null)) return false;
  const first = stayKey(policies[0] as RoomPolicyValues);
  return policies.every((policy) => stayKey(policy as RoomPolicyValues) === first);
}

export function depositRulesAreShared(policies: Array<RoomPolicyValues | null>): boolean {
  if (policies.length <= 1) return true;
  if (policies.some((policy) => policy == null)) return false;
  const first = depositKey(policies[0] as RoomPolicyValues);
  return policies.every((policy) => depositKey(policy as RoomPolicyValues) === first);
}

export function compactRoomOccupancy(adults: number, children: number, infants: number): string {
  const parts = [`${adults}A`];
  if (children > 0) parts.push(`${children}C`);
  if (infants > 0) parts.push(`${infants}I`);
  return parts.join(" · ");
}

export function groupRoomTotal(subtotals: Array<number | null>): {
  complete: boolean;
  total: number | null;
} {
  if (subtotals.length === 0 || subtotals.some((value) => value == null)) {
    return { complete: false, total: null };
  }
  return {
    complete: true,
    total: subtotals.reduce((sum, value) => sum + (value ?? 0), 0),
  };
}

export function sharedPolicyNote(roomCount: number): string {
  if (roomCount <= 1) return "Applies to this room.";
  return `Applies to all ${roomCount} rooms`;
}

export function roomingSummary(rooms: RoomingSummaryInput[]): {
  headline: string;
  lines: Array<{ title: string; detail: string }>;
} {
  const adults = rooms.reduce((sum, room) => sum + room.adults, 0);
  const children = rooms.reduce((sum, room) => sum + room.children, 0);
  const infants = rooms.reduce((sum, room) => sum + room.infants, 0);
  const parts = [
    `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`,
    `${adults} ${adults === 1 ? "adult" : "adults"}`,
    `${children} ${children === 1 ? "child" : "children"}`,
  ];
  if (infants > 0) parts.push(`${infants} ${infants === 1 ? "infant" : "infants"}`);
  return {
    headline: parts.join(" · "),
    lines: rooms.map((room, index) => ({
      title: `Room ${index + 1} · ${clean(room.occupantName) || "No guest"}`,
      detail: `${clean(room.roomTypeName) || "Not selected"} · ${clean(room.ratePlanName) || "Not selected"}`,
    })),
  };
}

export function packageBookingNote(input: {
  group: boolean;
  rooms: Array<{ roomTypeId: string; ratePlanId: string | null }>;
}): string | null {
  if (!input.group) return null;
  const first = input.rooms[0];
  const same = input.rooms.every(
    (room) =>
      room.roomTypeId === (first?.roomTypeId ?? "") &&
      (room.ratePlanId ?? "") === (first?.ratePlanId ?? ""),
  );
  if (same) return "Added once for this booking.";
  return "Added once for this booking. This list matches Room 1 and does not check the other rooms.";
}

export function bookingDepositQuote(
  rooms: GroupRoomMoney[],
  currency: string | null,
): DepositComputeQuote | null {
  if (rooms.length === 0 || rooms.some((room) => room.subtotal == null)) return null;
  const nights = Math.max(0, ...rooms.map((room) => room.nightlyRates.length));
  return {
    subtotal: rooms.reduce((sum, room) => sum + (room.subtotal ?? 0), 0),
    nightly: Array.from({ length: nights }, (_, index) => ({
      rate: rooms.reduce((sum, room) => sum + (room.nightlyRates[index] ?? 0), 0),
    })),
    currency,
  };
}

export function groupDepositPresentation(input: {
  policies: Array<RoomPolicyValues | null>;
  rooms: GroupRoomMoney[];
  currency: string | null;
}): { quote: DepositComputeQuote | null; note: string; amountKnown: boolean } {
  const complete =
    input.rooms.length > 0 &&
    input.rooms.every((room) => room.subtotal != null && room.nightlyRates.length > 0);
  if (!complete) {
    return {
      quote: null,
      note: "The booking deposit uses the combined room total. Quote every room before this amount can be shown.",
      amountKnown: false,
    };
  }
  return {
    quote: bookingDepositQuote(input.rooms, input.currency),
    note: depositRulesAreShared(input.policies)
      ? "Based on the combined room total."
      : "Rooms use different deposit rules. The stored deposit follows Room 1's rate plan on the combined room total.",
    amountKnown: true,
  };
}
