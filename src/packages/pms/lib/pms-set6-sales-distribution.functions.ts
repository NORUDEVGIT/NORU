/**
 * PMS-SET6 — load / save sales catalogues and distribution / reports / offline posture.
 *
 * 0052 tables are optional at runtime: missing relations never crash the hub.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import type { Json } from "@/integrations/supabase/types";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  SET6_AUDIT_ACCOUNT_TYPE,
  SET6_AUDIT_DISTRIBUTION_CHANNEL,
  SET6_AUDIT_DISTRIBUTION_MAPPING,
  SET6_AUDIT_EVENT_TYPE,
  SET6_AUDIT_FUNCTION_SPACE,
  SET6_AUDIT_MARKET_SEGMENT,
  SET6_AUDIT_OFFLINE_ENABLEMENT,
  SET6_AUDIT_OFFLINE_SYNC,
  SET6_AUDIT_REPORTS_CATALOGUE,
  SET6_AUDIT_REPORTS_SCHEDULE,
  SET6_AUDIT_SALES_CHANNEL,
  SET6_AUDIT_SOURCE_CODE,
  SET6_CATALOGUE_KINDS,
  activateInputFromSet6Snapshot,
  emptyChannelPosture,
  emptyMappingPosture,
  emptyOfflineEnablement,
  emptyOfflineSync,
  emptyReportsCatalogue,
  emptyReportsSchedule,
  emptySet6Snapshot,
  parseChannelPosture,
  parseMappingPosture,
  parseOfflineEnablement,
  parseOfflineSync,
  parseReportsCatalogue,
  parseReportsSchedule,
  type DistributionChannelPosture,
  type DistributionMappingPosture,
  type OfflineEnablementPosture,
  type OfflineSyncPosture,
  type PmsSet6CatalogueItem,
  type ReportsCataloguePosture,
  type ReportsScheduleAccessPosture,
  type Set6CatalogueKind,
  type Set6Snapshot,
} from "./pms-set6-sales-distribution";

const idSchema = z.string().uuid();
const SET6_UNAVAILABLE_SALES = "Those sales catalogues are unavailable until migration 0052 is applied.";
const SET6_UNAVAILABLE_DISTRIBUTION = "Distribution posture is unavailable until migration 0052 is applied.";
const SET6_UNAVAILABLE_REPORTS = "Reports posture is unavailable until migration 0052 is applied.";
const SET6_UNAVAILABLE_OFFLINE = "Offline posture is unavailable until migration 0052 is applied.";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const CATALOGUE_TABLE: Record<Set6CatalogueKind, "pms_market_segments" | "pms_source_codes" | "pms_sales_channel_labels" | "pms_account_type_labels" | "pms_event_types" | "pms_function_space_labels"> = {
  market_segment: "pms_market_segments",
  source_code: "pms_source_codes",
  sales_channel: "pms_sales_channel_labels",
  account_type: "pms_account_type_labels",
  event_type: "pms_event_types",
  function_space: "pms_function_space_labels",
};

const CATALOGUE_AUDIT: Record<Set6CatalogueKind, string> = {
  market_segment: SET6_AUDIT_MARKET_SEGMENT,
  source_code: SET6_AUDIT_SOURCE_CODE,
  sales_channel: SET6_AUDIT_SALES_CHANNEL,
  account_type: SET6_AUDIT_ACCOUNT_TYPE,
  event_type: SET6_AUDIT_EVENT_TYPE,
  function_space: SET6_AUDIT_FUNCTION_SPACE,
};

const CATALOGUE_CODE_ERROR: Record<Set6CatalogueKind, string> = {
  market_segment: "That market-segment code is already used.",
  source_code: "That source-code is already used.",
  sales_channel: "That sales-channel code is already used.",
  account_type: "That account-type code is already used.",
  event_type: "That event-type code is already used.",
  function_space: "That function-space code is already used.",
};

async function writeAudit(
  supabaseAdmin: Admin,
  params: {
    restaurantId: string;
    actorUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    section?: string;
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: params.action,
    metadata: {
      section: params.section ?? null,
      before: params.before as Json,
      after: params.after as Json,
      when: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[pms-set6] audit", error.message);
    return false;
  }
  return true;
}

function mapCatalogue(rows: Array<{ id: string; code: string; name: string; description?: string | null; active: boolean }>): PmsSet6CatalogueItem[] {
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: String(row.description ?? ""),
    active: row.active,
  }));
}

async function loadCatalogue(
  supabaseAdmin: Admin,
  restaurantId: string,
  table: (typeof CATALOGUE_TABLE)[Set6CatalogueKind],
): Promise<{ available: boolean; rows: PmsSet6CatalogueItem[] }> {
  const result = await supabaseAdmin
    .from(table)
    .select("id, code, name, description, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (result.error && isMissingSchemaError(result.error)) return { available: false, rows: [] };
  if (result.error) throw new Error(result.error.message);
  return { available: true, rows: mapCatalogue((result.data ?? []) as Array<PmsSet6CatalogueItem>) };
}

export async function loadSet6Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Set6Snapshot> {
  const snapshot = emptySet6Snapshot();

  const columnsRes = await supabaseAdmin
    .from("restaurants")
    .select(
      "pms_distribution_channel_posture, pms_distribution_mapping_posture, pms_reports_catalogue_posture, pms_reports_schedule_access_posture, pms_offline_enablement_posture, pms_offline_sync_posture",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (columnsRes.error && isMissingSchemaError(columnsRes.error)) {
    snapshot.distributionAvailable = false;
    snapshot.reportsAvailable = false;
    snapshot.offlineAvailable = false;
    snapshot.channelPosture = emptyChannelPosture();
    snapshot.mappingPosture = emptyMappingPosture();
    snapshot.reportsCatalogue = emptyReportsCatalogue();
    snapshot.reportsSchedule = emptyReportsSchedule();
    snapshot.offlineEnablement = emptyOfflineEnablement();
    snapshot.offlineSync = emptyOfflineSync();
  } else if (columnsRes.error) {
    throw new Error(columnsRes.error.message);
  } else {
    snapshot.distributionAvailable = true;
    snapshot.reportsAvailable = true;
    snapshot.offlineAvailable = true;
    snapshot.channelPosture = parseChannelPosture(columnsRes.data?.pms_distribution_channel_posture);
    snapshot.mappingPosture = parseMappingPosture(columnsRes.data?.pms_distribution_mapping_posture);
    snapshot.reportsCatalogue = parseReportsCatalogue(columnsRes.data?.pms_reports_catalogue_posture);
    snapshot.reportsSchedule = parseReportsSchedule(columnsRes.data?.pms_reports_schedule_access_posture);
    snapshot.offlineEnablement = parseOfflineEnablement(columnsRes.data?.pms_offline_enablement_posture);
    snapshot.offlineSync = parseOfflineSync(columnsRes.data?.pms_offline_sync_posture);
  }

  const [market, source, channel, account, eventType, functionSpace] = await Promise.all([
    loadCatalogue(supabaseAdmin, restaurantId, "pms_market_segments"),
    loadCatalogue(supabaseAdmin, restaurantId, "pms_source_codes"),
    loadCatalogue(supabaseAdmin, restaurantId, "pms_sales_channel_labels"),
    loadCatalogue(supabaseAdmin, restaurantId, "pms_account_type_labels"),
    loadCatalogue(supabaseAdmin, restaurantId, "pms_event_types"),
    loadCatalogue(supabaseAdmin, restaurantId, "pms_function_space_labels"),
  ]);
  snapshot.marketSegmentsAvailable = market.available;
  snapshot.marketSegments = market.rows;
  snapshot.sourceCodesAvailable = source.available;
  snapshot.sourceCodes = source.rows;
  snapshot.salesChannelsAvailable = channel.available;
  snapshot.salesChannels = channel.rows;
  snapshot.accountTypesAvailable = account.available;
  snapshot.accountTypes = account.rows;
  snapshot.eventTypesAvailable = eventType.available;
  snapshot.eventTypes = eventType.rows;
  snapshot.functionSpacesAvailable = functionSpace.available;
  snapshot.functionSpaces = functionSpace.rows;

  return snapshot;
}

export const getPmsSet6Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromSet6Snapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

async function requireEditor(restaurantId: string, context: { userId: string }) {
  const me = await withPmsPackage(restaurantId, callerMembership(context as never, restaurantId));
  if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
  return me;
}

function catalogueAvailable(snapshot: Set6Snapshot, kind: Set6CatalogueKind): boolean {
  if (kind === "market_segment") return snapshot.marketSegmentsAvailable;
  if (kind === "source_code") return snapshot.sourceCodesAvailable;
  if (kind === "sales_channel") return snapshot.salesChannelsAvailable;
  if (kind === "account_type") return snapshot.accountTypesAvailable;
  if (kind === "event_type") return snapshot.eventTypesAvailable;
  return snapshot.functionSpacesAvailable;
}

export const savePmsSet6Catalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        kind: z.enum(SET6_CATALOGUE_KINDS),
        id: idSchema.optional(),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(240).optional(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!catalogueAvailable(before, data.kind)) throw new Error(SET6_UNAVAILABLE_SALES);
    const table = CATALOGUE_TABLE[data.kind];
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      description: data.description ?? "",
      attrs: {} as Json,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from(table).update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from(table).insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error(CATALOGUE_CODE_ERROR[data.kind]);
      if (isMissingSchemaError(result.error)) throw new Error(SET6_UNAVAILABLE_SALES);
      throw new Error(result.error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: CATALOGUE_AUDIT[data.kind],
      section: data.kind === "event_type" || data.kind === "function_space" ? "sales-events" : "sales-events",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsDistributionChannelPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        channels: z.array(
          z.object({
            class: z.enum(["direct", "ota", "gds", "corporate"]),
            open: z.boolean(),
            stopSell: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const channelPosture: DistributionChannelPosture = emptyChannelPosture({
      channels: data.channels,
      savedAt: new Date().toISOString(),
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.distributionAvailable) throw new Error(SET6_UNAVAILABLE_DISTRIBUTION);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_distribution_channel_posture: channelPosture as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_DISTRIBUTION);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_DISTRIBUTION_CHANNEL,
      section: "distribution",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsDistributionMappingPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        rateMapped: z.boolean(),
        inventoryMapped: z.boolean(),
        roomTypeMapped: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const mappingPosture: DistributionMappingPosture = {
      rateMapped: data.rateMapped,
      inventoryMapped: data.inventoryMapped,
      roomTypeMapped: data.roomTypeMapped,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.distributionAvailable) throw new Error(SET6_UNAVAILABLE_DISTRIBUTION);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_distribution_mapping_posture: mappingPosture as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_DISTRIBUTION);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_DISTRIBUTION_MAPPING,
      section: "distribution",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsReportsCataloguePosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        packs: z.object({
          operational: z.boolean(),
          financial: z.boolean(),
          occupancy: z.boolean(),
          revenue: z.boolean(),
          management: z.boolean(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const reportsCatalogue: ReportsCataloguePosture = {
      packs: data.packs,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.reportsAvailable) throw new Error(SET6_UNAVAILABLE_REPORTS);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_reports_catalogue_posture: reportsCatalogue as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_REPORTS);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_REPORTS_CATALOGUE,
      section: "reports",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsReportsScheduleAccessPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        scheduleEnabled: z.boolean(),
        ownerManagerAccessOnly: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const reportsSchedule: ReportsScheduleAccessPosture = {
      scheduleEnabled: data.scheduleEnabled,
      ownerManagerAccessOnly: data.ownerManagerAccessOnly,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.reportsAvailable) throw new Error(SET6_UNAVAILABLE_REPORTS);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_reports_schedule_access_posture: reportsSchedule as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_REPORTS);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_REPORTS_SCHEDULE,
      section: "reports",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsOfflineEnablementPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        frontOfficeEnabled: z.boolean(),
        pmsEnabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const offlineEnablement: OfflineEnablementPosture = {
      frontOfficeEnabled: data.frontOfficeEnabled,
      pmsEnabled: data.pmsEnabled,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.offlineAvailable) throw new Error(SET6_UNAVAILABLE_OFFLINE);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_offline_enablement_posture: offlineEnablement as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_OFFLINE);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_OFFLINE_ENABLEMENT,
      section: "offline-sync",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsOfflineSyncPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        conflictLabel: z.string().trim().max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const offlineSync: OfflineSyncPosture = {
      conflictLabel: data.conflictLabel,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.offlineAvailable) throw new Error(SET6_UNAVAILABLE_OFFLINE);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_offline_sync_posture: offlineSync as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET6_UNAVAILABLE_OFFLINE);
      throw new Error(error.message);
    }
    const after = await loadSet6Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET6_AUDIT_OFFLINE_SYNC,
      section: "offline-sync",
      before,
      after,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export type { Set6Snapshot };
