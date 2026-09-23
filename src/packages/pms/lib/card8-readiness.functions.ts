/**
 * Card 8 readiness loaders and programme-status persistence.
 *
 * Only domain save handlers call persistCard8Overall. Validate uses the
 * read-only loader and never writes programme status.
 */
import type { Json } from "@/integrations/supabase/types";
import {
  buildCard8ReadinessReport,
  mergeCard8Status,
  type Card8ReadinessSnapshot,
} from "./card8-readiness.server";
import { loadCard8ActivationEligibility } from "./pms-property-setup-card8-activation.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

export async function loadCard8ReadinessSnapshot(
  db: DbClient,
  restaurantId: string,
  userId: string,
  role: string,
): Promise<Card8ReadinessSnapshot> {
  const [
    { loadCard8OfflineSnapshot },
    { loadCard8ValidationReport },
    { loadCard8GoliveSnapshot },
    { loadSet1ActivationState },
  ] = await Promise.all([
    import("./pms-property-setup-card8-offline.functions"),
    import("./pms-property-setup-card8-validation.functions"),
    import("./pms-property-setup-card8-golive.functions"),
    import("./pms-set1-foundation.functions"),
  ]);
  const [offline, validation, golive, set1] = await Promise.all([
    loadCard8OfflineSnapshot(db, restaurantId),
    loadCard8ValidationReport(db, restaurantId, userId),
    loadCard8GoliveSnapshot(db, restaurantId, false),
    loadSet1ActivationState(db, restaurantId, role),
  ]);
  const activation = await loadCard8ActivationEligibility(
    db,
    restaurantId,
    userId,
    role,
    set1.checklist.mandatoryMissing.length === 0,
    { validation, golive },
  );
  return { offline, validation, golive, activation };
}

export async function loadCard8ReadinessReport(
  db: DbClient,
  restaurantId: string,
  userId: string,
  role: string,
) {
  return buildCard8ReadinessReport(
    await loadCard8ReadinessSnapshot(db, restaurantId, userId, role),
  );
}

export async function persistCard8Overall(
  db: DbClient,
  restaurantId: string,
  userId: string,
  role: string,
) {
  const report = await loadCard8ReadinessReport(db, restaurantId, userId, role);
  const current = await db
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const next = mergeCard8Status(current.data?.pms_property_setup_status, report.overall);
  const saved = await db
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
  return report;
}
