/**
 * Cashiering-owned late-checkout fee posting.
 *
 * Reuses the cancel/no-show pattern: open the reservation folio, guard with
 * reference_type + remaining gross, then post_folio_transaction type `charge`.
 * Front Office calls this from an explicit grant only — Night Audit never posts.
 */
import { callPostFolioTransaction, cashierError, categoryForType } from "./cashiering.server";

export const LATE_CHECKOUT_FEE_REFERENCE_TYPE = "late_checkout";
export const LATE_CHECKOUT_FEE_DESCRIPTION = "Late checkout fee";

export type LateCheckoutFeePostResult =
  | { status: "skipped_zero" }
  | { status: "already_posted"; transactionId: string | null; amount: number; folioId: string }
  | { status: "posted"; transactionId: string; amount: number; folioId: string };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Stable per live fee attempt. Re-grant while a fee remains active is blocked by
 * the remaining-gross check. After a full Cashiering reverse, priorCount advances
 * so a new grant can post once (same pattern as cancel/no-show fees).
 */
export function lateCheckoutFeeIdempotencyKey(reservationId: string, priorCount: number): string {
  return `lcfee${reservationId.replace(/-/g, "")}${priorCount}`;
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function openReservationFolio(
  supabaseAdmin: Admin,
  restaurantId: string,
  reservationId: string,
  membershipId: string,
): Promise<{ id: string; status: string }> {
  const { data, error } = (await supabaseAdmin.rpc("open_reservation_fee_folio" as never, {
    _restaurant_id: restaurantId,
    _reservation_id: reservationId,
    _membership_id: membershipId,
  } as never)) as { data: unknown; error: { message: string } | null };
  if (error) {
    if (/RESERVATION_NOT_BILLABLE/i.test(error.message)) {
      throw new Error("Open a folio for this stay in Cashiering before posting a late checkout fee.");
    }
    throw cashierError(error.message);
  }
  const folio = data as { id: string; status?: string };
  return { id: folio.id, status: folio.status ?? "open" };
}

async function loadLateCheckoutFeeCharges(
  supabaseAdmin: Admin,
  restaurantId: string,
  folioId: string,
  reservationId: string,
): Promise<{
  priorCount: number;
  active: { id: string; amount: number } | null;
}> {
  const { data: priorFees, error } = await supabaseAdmin
    .from("folio_transactions")
    .select("id, amount")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folioId)
    .eq("transaction_type", "charge")
    .eq("reference_type", LATE_CHECKOUT_FEE_REFERENCE_TYPE)
    .eq("reference_id", reservationId);
  if (error) throw new Error(error.message);

  const priors = (priorFees ?? []) as { id: string; amount: number | string }[];
  for (const prior of priors) {
    const { data: remaining } = (await supabaseAdmin.rpc("charge_group_remaining_gross" as never, {
      _restaurant_id: restaurantId,
      _charge_id: prior.id,
    } as never)) as { data: unknown };
    if (Number(remaining ?? 0) >= 0.01) {
      return {
        priorCount: priors.length,
        active: { id: prior.id, amount: Number(prior.amount) },
      };
    }
  }
  return { priorCount: priors.length, active: null };
}

/**
 * Posts at most one late-checkout fee per reservation.
 * Amount must already be the canonical restaurants.late_checkout_fee.
 */
export async function postLateCheckoutFeeCharge(params: {
  restaurantId: string;
  reservationId: string;
  amount: number;
  membershipId: string;
}): Promise<LateCheckoutFeePostResult> {
  const amount = roundMoney(params.amount);
  if (!(amount > 0)) return { status: "skipped_zero" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folio = await openReservationFolio(
    supabaseAdmin,
    params.restaurantId,
    params.reservationId,
    params.membershipId,
  );
  if (folio.status === "closed") {
    throw new Error("The folio is closed. Reopen or settle it in Cashiering before posting a late checkout fee.");
  }

  const { priorCount, active } = await loadLateCheckoutFeeCharges(
    supabaseAdmin,
    params.restaurantId,
    folio.id,
    params.reservationId,
  );
  if (active) {
    return {
      status: "already_posted",
      transactionId: active.id,
      amount: active.amount,
      folioId: folio.id,
    };
  }

  try {
    const posted = await callPostFolioTransaction({
      restaurantId: params.restaurantId,
      folioId: folio.id,
      type: "charge",
      category: categoryForType("charge"),
      description: LATE_CHECKOUT_FEE_DESCRIPTION,
      amount,
      referenceType: LATE_CHECKOUT_FEE_REFERENCE_TYPE,
      referenceId: params.reservationId,
      membershipId: params.membershipId,
      idempotencyKey: lateCheckoutFeeIdempotencyKey(params.reservationId, priorCount),
    });
    return {
      status: "posted",
      transactionId: posted.id,
      amount,
      folioId: folio.id,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (/shift/i.test(message)) {
      throw new Error("Open a cashier shift before posting a late checkout fee.");
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
