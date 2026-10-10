import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCashieringAccess } from "./cashiering.server";
import {
  departuresRequiringSettlement,
  propertyDayBounds,
  splitStampedCash,
  summarizeBusinessDateActivity,
  type BusinessActivityRow,
} from "./cashiering-control";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Property business-date activity for Cashier Control.
 * `viewDate` is a read filter only. This function never updates restaurants.business_date.
 * Company and group cash posted through post_financial_account_transaction is not
 * stamped with hotel_cashier_shift_id and is not drawer cash.
 */
export const getCashieringBusinessDateActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; viewDate?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        viewDate: dateSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadCashierProperty(supabaseAdmin, data.restaurantId);
    const viewedBusinessDate = data.viewDate ?? property.businessDate;
    const bounds = propertyDayBounds(viewedBusinessDate, property.timezone);

    const { data: txns, error } = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, folio_id, financial_account_id, transaction_type, category, description, amount, posted_at, created_at, payment_method, original_transaction_id, reference_type, reference_id, transfer_id, posted_by_membership_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .gte("posted_at", bounds.startIso)
      .lt("posted_at", bounds.endIso);
    if (error) throw new Error(error.message);

    const raw = (txns ?? []) as ActivityTxn[];
    const [owners, actors] = await Promise.all([
      ownerLabels(supabaseAdmin, data.restaurantId, raw),
      actorNames(
        supabaseAdmin,
        data.restaurantId,
        raw.map((row) => row.posted_by_membership_id),
      ),
    ]);
    const rows: BusinessActivityRow[] = raw.map((row) => ({
      id: row.id,
      type: row.transaction_type,
      category: row.category,
      description: row.description,
      amount: Number(row.amount),
      postedAt: row.posted_at,
      createdAt: row.created_at ?? row.posted_at,
      paymentMethod: row.payment_method,
      originalTransactionId: row.original_transaction_id,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      transferId: row.transfer_id,
      postedBy: row.posted_by_membership_id
        ? (actors.get(row.posted_by_membership_id) ?? null)
        : null,
      ownerLabel: owners.get(row.folio_id ?? row.financial_account_id ?? "") ?? "Account",
    }));
    const activity = summarizeBusinessDateActivity({
      rows,
      businessDate: viewedBusinessDate,
      timezone: property.timezone,
    });
    const departuresDue = await loadDeparturesDue(
      supabaseAdmin,
      data.restaurantId,
      viewedBusinessDate,
    );

    return {
      canonicalBusinessDate: property.businessDate,
      viewedBusinessDate,
      timezone: property.timezone,
      currency: property.currency,
      ...activity,
      departuresDue,
    };
  });

/**
 * Stamped guest cash plus drawer movements for one hotel shift.
 * Not filtered by business date. Unstamped company/group cash is excluded.
 */
export const getCashierShiftActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; shiftId: string }) =>
    z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: txns, error } = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, folio_id, transaction_type, category, description, amount, posted_at, payment_method, posted_by_membership_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("hotel_cashier_shift_id", data.shiftId)
      .order("posted_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: movements, error: movementError } = await supabaseAdmin
      .from("hotel_drawer_movements")
      .select("id, movement_type, amount, notes, created_at, actor_membership_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("hotel_cashier_shift_id", data.shiftId)
      .order("created_at", { ascending: true });
    if (movementError) throw new Error(movementError.message);

    const stamped = (txns ?? []) as Array<{
      id: string;
      folio_id: string | null;
      transaction_type: string;
      description: string;
      amount: number | string;
      posted_at: string;
      payment_method: string | null;
      posted_by_membership_id: string | null;
    }>;
    const moves = (movements ?? []) as Array<{
      id: string;
      movement_type: string;
      amount: number | string;
      notes: string | null;
      created_at: string;
      actor_membership_id: string | null;
    }>;
    const actors = await actorNames(supabaseAdmin, data.restaurantId, [
      ...stamped.map((row) => row.posted_by_membership_id),
      ...moves.map((row) => row.actor_membership_id),
    ]);
    const folioIds = stamped.map((row) => row.folio_id).filter((id): id is string => Boolean(id));
    const guests = await folioGuests(supabaseAdmin, data.restaurantId, folioIds);
    const cash = splitStampedCash(
      stamped.map((row) => ({
        type: row.transaction_type,
        amount: Number(row.amount),
        paymentMethod: row.payment_method,
      })),
    );

    const lines = [
      ...moves
        .filter((row) => row.movement_type === "cash_in" || row.movement_type === "cash_out")
        .map((row) => ({
          id: row.id,
          occurredAt: row.created_at,
          kind: row.movement_type,
          description:
            row.notes?.trim() || (row.movement_type === "cash_in" ? "Cash in" : "Cash out"),
          amount: row.movement_type === "cash_out" ? -Number(row.amount) : Number(row.amount),
          actor: row.actor_membership_id ? (actors.get(row.actor_membership_id) ?? null) : null,
          guest: null as string | null,
          folioId: null as string | null,
        })),
      ...stamped
        .filter(
          (row) =>
            row.payment_method === "cash" &&
            (row.transaction_type === "payment" ||
              row.transaction_type === "deposit" ||
              row.transaction_type === "refund"),
        )
        .map((row) => ({
          id: row.id,
          occurredAt: row.posted_at,
          kind: row.transaction_type,
          description: row.description,
          amount:
            row.transaction_type === "refund" ? -Math.abs(Number(row.amount)) : -Number(row.amount),
          actor: row.posted_by_membership_id
            ? (actors.get(row.posted_by_membership_id) ?? null)
            : null,
          guest: row.folio_id ? (guests.get(row.folio_id) ?? null) : null,
          folioId: row.folio_id,
        })),
    ].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    return { shiftId: data.shiftId, ...cash, lines };
  });

type ActivityTxn = {
  id: string;
  folio_id: string | null;
  financial_account_id: string | null;
  transaction_type: string;
  category: string;
  description: string;
  amount: number | string;
  posted_at: string;
  created_at: string | null;
  payment_method: string | null;
  original_transaction_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  transfer_id: string | null;
  posted_by_membership_id: string | null;
};

type Admin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

async function loadCashierProperty(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<{ businessDate: string; timezone: string; currency: string }> {
  const { data } = await supabaseAdmin
    .from("restaurants")
    .select("timezone, currency_code, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  const row = data as {
    timezone: string | null;
    currency_code: string | null;
    business_date: string | null;
  } | null;
  const timezone = row?.timezone || "UTC";
  return {
    timezone,
    currency: row?.currency_code || "GBP",
    businessDate: resolvePropertyBusinessDate(
      row?.business_date ? row.business_date.slice(0, 10) : null,
      timezone,
    ),
  };
}

async function ownerLabels(
  supabaseAdmin: Admin,
  restaurantId: string,
  rows: ActivityTxn[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const folioIds = [
    ...new Set(rows.map((row) => row.folio_id).filter((id): id is string => Boolean(id))),
  ];
  if (folioIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("guest_folios")
      .select("id, guest_profiles!guest_folios_guest_same_property(first_name, last_name)")
      .eq("restaurant_id", restaurantId)
      .in("id", folioIds);
    for (const folio of (data ?? []) as unknown as Array<{
      id: string;
      guest_profiles: { first_name: string | null; last_name: string | null } | null;
    }>) {
      labels.set(folio.id, personName(folio.guest_profiles) || "Guest");
    }
  }
  const accountIds = [
    ...new Set(
      rows.map((row) => row.financial_account_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (accountIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("financial_accounts")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", accountIds);
    for (const account of (data ?? []) as Array<{ id: string; name: string | null }>) {
      labels.set(account.id, account.name?.trim() || "Account");
    }
  }
  return labels;
}

async function folioGuests(
  supabaseAdmin: Admin,
  restaurantId: string,
  folioIds: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (folioIds.length === 0) return labels;
  const { data } = await supabaseAdmin
    .from("guest_folios")
    .select("id, guest_profiles!guest_folios_guest_same_property(first_name, last_name)")
    .eq("restaurant_id", restaurantId)
    .in("id", folioIds);
  for (const folio of (data ?? []) as unknown as Array<{
    id: string;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
  }>) {
    labels.set(folio.id, personName(folio.guest_profiles) || "Guest");
  }
  return labels;
}

async function loadDeparturesDue(supabaseAdmin: Admin, restaurantId: string, businessDate: string) {
  const { data } = await supabaseAdmin
    .from("guest_folios")
    .select(
      "id, folio_number, status, guest_profiles!guest_folios_guest_same_property(first_name, last_name), hotel_reservations!guest_folios_reservation_same_property(departure_date, status, hotel_rooms!hotel_reservations_room_same_type(room_number))",
    )
    .eq("restaurant_id", restaurantId)
    .eq("status", "open");
  const folios = (data ?? []) as unknown as Array<{
    id: string;
    folio_number: string;
    status: string;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
    hotel_reservations: {
      departure_date: string | null;
      status: string | null;
      hotel_rooms: { room_number: string } | null;
    } | null;
  }>;
  const dueIds = folios
    .filter(
      (folio) =>
        folio.hotel_reservations?.status === "checked_in" &&
        folio.hotel_reservations.departure_date?.slice(0, 10) === businessDate,
    )
    .map((folio) => folio.id);
  const balances = new Map<string, number>();
  if (dueIds.length > 0) {
    const { data: txns } = await supabaseAdmin
      .from("folio_transactions")
      .select("folio_id, amount")
      .eq("restaurant_id", restaurantId)
      .in("folio_id", dueIds);
    for (const txn of (txns ?? []) as Array<{ folio_id: string; amount: number | string }>) {
      balances.set(txn.folio_id, (balances.get(txn.folio_id) ?? 0) + Number(txn.amount));
    }
  }
  return departuresRequiringSettlement(
    folios.map((folio) => ({
      folioId: folio.id,
      folioNumber: folio.folio_number,
      room: folio.hotel_reservations?.hotel_rooms?.room_number ?? null,
      guest: personName(folio.guest_profiles) || "Guest",
      departure: folio.hotel_reservations?.departure_date?.slice(0, 10) ?? null,
      reservationStatus: folio.hotel_reservations?.status ?? null,
      folioStatus: folio.status,
      balance: balances.get(folio.id) ?? 0,
    })),
    businessDate,
  );
}

async function actorNames(
  supabaseAdmin: Admin,
  restaurantId: string,
  membershipIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return names;
  const { data: members } = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  if (memberRows.length === 0) return names;
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in(
      "id",
      memberRows.map((member) => member.user_id),
    );
  const byUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [profile.id, personName(profile) || profile.email || "Staff member"]),
  );
  for (const member of memberRows)
    names.set(member.id, byUser.get(member.user_id) ?? "Staff member");
  return names;
}

function personName(
  person: { first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  if (!person) return "";
  return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}
