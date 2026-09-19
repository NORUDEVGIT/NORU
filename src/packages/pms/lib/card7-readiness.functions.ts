/**
 * Persist Card 7 programme status on domain saves only.
 * Validate never writes. Overall may persist complete when all four domains are ready.
 */
import type { Json } from "@/integrations/supabase/types";
import { emptySecuritySnapshot } from "./security-roles-card7.server";
import { emptyAuditSnapshot } from "./audit-card7.server";
import { emptyReportsSnapshot } from "./reports-card7.server";
import { emptyImportSnapshot } from "./import-card7.server";
import { buildCard7ValidationReport, mergeCard7Status } from "./card7-readiness.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

async function loadOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export async function loadCard7ValidationSnapshot(db: DbClient, restaurantId: string) {
  const { loadCard7SecuritySnapshot } = await import("./security-roles-card7.functions");
  const { loadCard7AuditSnapshot } = await import("./audit-card7.functions");
  const { loadCard7ReportsSnapshot } = await import("./reports-card7.functions");
  const { loadCard7ImportSnapshot } = await import("./import-card7.functions");
  const [security, audit, reports, importDomain] = await Promise.all([
    loadOrEmpty(() => loadCard7SecuritySnapshot(db, restaurantId), emptySecuritySnapshot()),
    loadOrEmpty(() => loadCard7AuditSnapshot(db, restaurantId), emptyAuditSnapshot()),
    loadOrEmpty(() => loadCard7ReportsSnapshot(db, restaurantId), emptyReportsSnapshot()),
    loadOrEmpty(() => loadCard7ImportSnapshot(db, restaurantId), emptyImportSnapshot()),
  ]);
  return { security, audit, reports, importDomain };
}

export async function persistCard7Overall(db: DbClient, restaurantId: string) {
  const snapshot = await loadCard7ValidationSnapshot(db, restaurantId);
  const report = buildCard7ValidationReport(snapshot);
  const current = await db
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const next = mergeCard7Status(current.data?.pms_property_setup_status, report.overall);
  const saved = await db
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
  return report;
}
