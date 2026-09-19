/**
 * Persist Card 5 overall status into restaurants.pms_property_setup_status.
 * Validate never writes; domain saves call this after a successful mutation.
 */
import type { Json } from "@/integrations/supabase/types";
import { emptyDepartmentsSnapshot } from "./departments-card5.server";
import { emptyFacilitiesSnapshot } from "./outlets-card5.server";
import { emptySalesSnapshot } from "./sales-events-card5.server";
import { buildCard5ValidationReport, mergeCard5Status } from "./card5-readiness.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

async function loadOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export async function loadCard5ValidationSnapshots(db: DbClient, restaurantId: string) {
  const [{ loadCard5DepartmentsSnapshot }, { loadCard5FacilitiesSnapshot }, { loadCard5SalesSnapshot }] =
    await Promise.all([
      import("./departments-card5.functions"),
      import("./outlets-card5.functions"),
      import("./sales-events-card5.functions"),
    ]);
  const [departments, facilities, sales] = await Promise.all([
    loadOrEmpty(
      () => loadCard5DepartmentsSnapshot(db, restaurantId),
      emptyDepartmentsSnapshot(),
    ),
    loadOrEmpty(() => loadCard5FacilitiesSnapshot(db, restaurantId), emptyFacilitiesSnapshot()),
    loadOrEmpty(() => loadCard5SalesSnapshot(db, restaurantId), emptySalesSnapshot()),
  ]);
  return { departments, facilities, sales };
}

export async function persistCard5Overall(db: DbClient, restaurantId: string) {
  const snapshots = await loadCard5ValidationSnapshots(db, restaurantId);
  const report = buildCard5ValidationReport(
    snapshots.departments,
    snapshots.facilities,
    snapshots.sales,
  );
  const current = await db
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const next = mergeCard5Status(current.data?.pms_property_setup_status, report.overall);
  const saved = await db
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
  return report;
}
