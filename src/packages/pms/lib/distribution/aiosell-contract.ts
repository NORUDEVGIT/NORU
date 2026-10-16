/**
 * AIOS-02 Aiosell contract shapes.
 * Field names follow the supplied Aiosell context file.
 * This module does not call Aiosell, store credentials, or write reservations.
 * creditCard is stripped at the boundary and is not part of any parsed type.
 */
import { z } from "zod";

const requiredCode = z.string().min(1);
const aiosellDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.union([z.string(), z.null()]).optional();
const nullableInt = z
  .number()
  .int()
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const nullableFlag = z
  .boolean()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const AIOSELL_PROVIDER = "aiosell" as const;

export const aiosellResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type AiosellResponse = z.infer<typeof aiosellResponseSchema>;

export const aiosellConnectedChannelSchema = z.object({
  operation: z.string().min(1).nullable(),
  partner_id: requiredCode,
  hotel_code: requiredCode,
  rate_multiplier: z.number().finite().nullable().optional(),
});

const aiosellAddressSchema = z.object({
  line: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country_code: z.string().optional(),
  location: z
    .object({
      long: z.string().optional(),
      latt: z.string().optional(),
    })
    .optional(),
});

const aiosellContactSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
});

export const aiosellRatePlanDetailsSchema = z.object({
  rateplan_id: requiredCode,
  rateplan_name: z.string(),
  description: z.string().optional(),
  occupancy: z.number().int().optional(),
  no_of_meals: z.number().int().optional(),
  extra_adult: z.number().finite().optional(),
});

export const aiosellRoomDetailsSchema = z.object({
  room_id: requiredCode,
  room_name: z.string(),
  description: z.string().optional(),
  count: z.number().int().optional(),
  active: z.boolean().optional(),
  type: z.string().optional(),
  min_occ: z.number().int().optional(),
  max_occ: z.number().int().optional(),
  rateplans: z.array(aiosellRatePlanDetailsSchema),
});

export const aiosellPropertyDetailsSchema = z.object({
  hotel_id: requiredCode,
  hotel_name: z.string().optional(),
  property_category: z.string().optional(),
  tax_id: z.string().optional(),
  currency: requiredCode,
  timezone: requiredCode,
  address: aiosellAddressSchema.optional(),
  contact: aiosellContactSchema.optional(),
  rooms: z.array(aiosellRoomDetailsSchema),
  connected_channels: z.array(aiosellConnectedChannelSchema),
});

export type AiosellPropertyDetails = z.infer<typeof aiosellPropertyDetailsSchema>;

export const aiosellInventoryRoomSchema = z.object({
  roomCode: requiredCode,
  available: z.number().int().nonnegative(),
});

export const aiosellInventoryPushSchema = z.object({
  hotelCode: requiredCode,
  updates: z
    .array(
      z.object({
        startDate: aiosellDate,
        endDate: aiosellDate,
        rooms: z.array(aiosellInventoryRoomSchema).min(1),
      }),
    )
    .min(1),
});

export type AiosellInventoryPush = z.infer<typeof aiosellInventoryPushSchema>;

export const aiosellRateEntrySchema = z.object({
  roomCode: requiredCode,
  rateplanCode: requiredCode,
  rate: z.number().finite(),
});

export const aiosellRatePushSchema = z.object({
  hotelCode: requiredCode,
  updates: z
    .array(
      z.object({
        startDate: aiosellDate,
        endDate: aiosellDate,
        rates: z.array(aiosellRateEntrySchema).min(1),
      }),
    )
    .min(1),
});

export type AiosellRatePush = z.infer<typeof aiosellRatePushSchema>;

export const aiosellRestrictionsSchema = z.object({
  stopSell: nullableFlag,
  minimumStay: nullableInt,
  maximumStay: nullableInt,
  closeOnArrival: nullableFlag,
  closeOnDeparture: nullableFlag,
  minimumStayArrival: nullableInt,
  maximumStayArrival: nullableInt,
  exactStayArrival: nullableInt,
  minimumAdvanceReservation: nullableInt,
  maximumAdvanceReservation: nullableInt,
});

export type AiosellRestrictions = z.infer<typeof aiosellRestrictionsSchema>;

const channelList = z.array(requiredCode).min(1);

export const aiosellInventoryRestrictionsPushSchema = z.object({
  hotelCode: requiredCode,
  toChannels: channelList,
  updates: z
    .array(
      z.object({
        startDate: aiosellDate,
        endDate: aiosellDate,
        rooms: z
          .array(
            z.object({
              roomCode: requiredCode,
              restrictions: aiosellRestrictionsSchema,
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const aiosellRateRestrictionsPushSchema = z.object({
  hotelCode: requiredCode,
  toChannels: channelList,
  updates: z
    .array(
      z.object({
        startDate: aiosellDate,
        endDate: aiosellDate,
        rates: z
          .array(
            z.object({
              roomCode: requiredCode,
              rateplanCode: requiredCode,
              restrictions: aiosellRestrictionsSchema,
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const aiosellFetchRequestSchema = z.object({
  type: z.enum(["inventory", "rates", "reservation"]),
  hotelCode: requiredCode,
  startDate: aiosellDate,
  endDate: aiosellDate,
});

export type AiosellFetchRequest = z.infer<typeof aiosellFetchRequestSchema>;

const guestAddressSchema = z.object({
  line1: optionalText,
  city: optionalText,
  state: optionalText,
  country: optionalText,
  zipCode: optionalText,
});

const guestSchema = z.object({
  firstName: optionalText,
  lastName: optionalText,
  email: optionalText,
  phone: optionalText,
  address: guestAddressSchema.nullish(),
});

const roomSchema = z.object({
  roomCode: requiredCode,
  rateplanCode: requiredCode,
  guestName: optionalText,
  occupancy: z.object({
    adults: z.number().int().nonnegative(),
    children: z.number().int().nonnegative(),
  }),
  prices: z.array(
    z.object({
      date: aiosellDate,
      sellRate: z.number().finite(),
    }),
  ),
});

const amountSchema = z.object({
  amountAfterTax: z.number().finite(),
  amountBeforeTax: z.number().finite(),
  tax: z.number().finite(),
  currency: requiredCode,
  commission: z
    .number()
    .finite()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  tcs: z
    .number()
    .finite()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  tds: z
    .number()
    .finite()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

const reservationStateSchema = z.object({
  hotelCode: requiredCode,
  channel: requiredCode,
  bookingId: requiredCode,
  cmBookingId: optionalText,
  bookedOn: z.string().min(1),
  checkin: aiosellDate,
  checkout: aiosellDate,
  segment: requiredCode,
  specialRequests: optionalText,
  pah: z.boolean(),
  amount: amountSchema,
  guest: guestSchema.nullish(),
  rooms: z.array(roomSchema).min(1),
});

export const aiosellBookSchema = reservationStateSchema.extend({
  action: z.literal("book"),
});

export const aiosellModifySchema = reservationStateSchema.extend({
  action: z.literal("modify"),
});

export const aiosellCancelSchema = z.object({
  action: z.literal("cancel"),
  hotelCode: requiredCode,
  channel: requiredCode,
  bookingId: requiredCode,
});

export type AiosellBookReservation = z.infer<typeof aiosellBookSchema>;
export type AiosellModifyReservation = z.infer<typeof aiosellModifySchema>;
export type AiosellCancelReservation = z.infer<typeof aiosellCancelSchema>;

const CARD_KEY = "creditCard";

export function withoutUnsupportedAiosellCard(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  if (!(CARD_KEY in input)) return input;
  const copy = { ...(input as Record<string, unknown>) };
  delete copy[CARD_KEY];
  return copy;
}

function parseContract<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(withoutUnsupportedAiosellCard(input));
}

export function parseAiosellBook(input: unknown): AiosellBookReservation {
  return parseContract(aiosellBookSchema, input);
}

export function parseAiosellModify(input: unknown): AiosellModifyReservation {
  return parseContract(aiosellModifySchema, input);
}

export function parseAiosellCancel(input: unknown): AiosellCancelReservation {
  return parseContract(aiosellCancelSchema, input);
}

export function parseAiosellResponse(input: unknown): AiosellResponse {
  return aiosellResponseSchema.parse(input);
}

export function parseAiosellPropertyDetails(input: unknown): AiosellPropertyDetails {
  return aiosellPropertyDetailsSchema.parse(input);
}

export function parseAiosellInventoryPush(input: unknown): AiosellInventoryPush {
  return aiosellInventoryPushSchema.parse(input);
}

export function parseAiosellRatePush(input: unknown): AiosellRatePush {
  return aiosellRatePushSchema.parse(input);
}

export function parseAiosellFetchRequest(input: unknown): AiosellFetchRequest {
  return aiosellFetchRequestSchema.parse(input);
}

export const AIOSELL_NO_SHOW_CHANNELS = ["booking.com", "gommt"] as const;

export const aiosellNoShowSchema = z.object({
  hotelCode: requiredCode,
  bookingId: requiredCode,
  channel: z.enum(AIOSELL_NO_SHOW_CHANNELS),
});

export type AiosellNoShowRequest = z.infer<typeof aiosellNoShowSchema>;

export type AiosellFetchedReservation =
  AiosellBookReservation | AiosellModifyReservation | AiosellCancelReservation;

export function parseAiosellReservationFetchList(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new Error("AIOSELL_RESERVATION_FETCH_INVALID");
  return input;
}

export function parseAiosellFetchedReservation(input: unknown): AiosellFetchedReservation {
  const stripped = withoutUnsupportedAiosellCard(input);
  const action =
    stripped && typeof stripped === "object" && "action" in stripped
      ? (stripped as { action?: unknown }).action
      : null;
  if (action === "book") return parseAiosellBook(stripped);
  if (action === "modify") return parseAiosellModify(stripped);
  if (action === "cancel") return parseAiosellCancel(stripped);
  throw new Error("AIOSELL_ACTION_UNKNOWN");
}

export function parseAiosellNoShow(input: unknown): AiosellNoShowRequest {
  return aiosellNoShowSchema.parse(input);
}
