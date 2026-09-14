/**
 * PMS-SET6 — Sales & events · Distribution · Reports · Offline & sync
 * (Issue #80). Closes the Property Settings Hub (wave 6/6).
 *
 * Abel-approved 2026-09-14 locks:
 * - Thin catalogues / posture only. No Sales CRM. No invented live
 *   channel-manager / OTA sync. No BI rebuild. No full offline / PWA stack.
 * - Empty optional catalogues / postures = Warning (non-blocking).
 *   No new SET6 Incomplete Activate blockers.
 * - Single Activate still flips only pms_set1_live. No pms_set6_live.
 * - SET6 saves join hub Recent changes (pms_set6_* audit). No redesign.
 * - Coming soon is empty — programme close. No SET7.
 * - Foundation chip stays until Abel drops it. Do not invent a second Activate.
 * - FO-CHROME1 / overbooking out.
 * - Direct booking Live honesty; OTA Not Connected / Foundation — never fake
 *   Connected OTA. Never fake Offline Ready.
 * - 0052 tables/columns are additive and may be absent — never crash.
 */

import type { Set1DomainReport, Set1Readiness } from "./pms-set1-foundation.ts";

export const SET6_SALES_HREF = "/restaurant/pms/sales-events";
export const SET6_DISTRIBUTION_HREF = "/restaurant/pms/distribution";
export const SET6_REPORTS_HREF = "/restaurant/pms/reports";

export const SET6_SALES_UNAVAILABLE = "Unavailable — sales and event catalogues are not applied yet.";
export const SET6_SALES_WARNING =
  "No active market segment, source code or event type yet. This is a warning, not a block.";
export const SET6_SALES_PLANNED =
  "The Sales & events workspace is planned. This card is a catalogue only — not a sales CRM.";
export const SET6_DISTRIBUTION_UNAVAILABLE = "Unavailable — distribution posture is not applied yet.";
export const SET6_CHANNEL_WARNING = "Channel-class posture is a draft until you save. This is a warning, not a block.";
export const SET6_MAPPING_WARNING = "Mapping-completeness posture is a draft until you save. This is a warning, not a block.";
export const SET6_DIRECT_LIVE_NOTE =
  "Direct booking is live. This page records channel-class posture only and does not invent a channel manager.";
export const SET6_OTA_FOUNDATION =
  "OTA is not connected. Foundation only — never treat this as a live OTA connection.";
export const SET6_GDS_FOUNDATION = "GDS is not connected. Foundation only — not a live connector.";
export const SET6_CORPORATE_FOUNDATION = "Corporate is posture only. Foundation — not a live connector.";
export const SET6_REPORTS_UNAVAILABLE = "Unavailable — reports posture is not applied yet.";
export const SET6_REPORTS_CATALOGUE_WARNING =
  "Report-pack catalogue is a draft until you save. This is a warning, not a block.";
export const SET6_REPORTS_SCHEDULE_WARNING =
  "Schedule and access posture is a draft until you save. This is a warning, not a block.";
export const SET6_REPORTS_NO_BI = "This is catalogue and access posture only. It is not a BI rebuild.";
export const SET6_OFFLINE_UNAVAILABLE = "Unavailable — offline posture is not applied yet.";
export const SET6_OFFLINE_ENABLE_WARNING =
  "Offline enablement is a draft until you save. This is a warning, not a block.";
export const SET6_OFFLINE_SYNC_WARNING = "Sync and conflict labels are a draft until you save. This is a warning, not a block.";
export const SET6_OFFLINE_INTENT_ONLY =
  "These are intent flags only. Saving posture does not ship an offline runtime and must never read Offline Ready.";

export const SET6_AUDIT_MARKET_SEGMENT = "pms_set6_market_segment_updated";
export const SET6_AUDIT_SOURCE_CODE = "pms_set6_source_code_updated";
export const SET6_AUDIT_SALES_CHANNEL = "pms_set6_sales_channel_updated";
export const SET6_AUDIT_ACCOUNT_TYPE = "pms_set6_account_type_updated";
export const SET6_AUDIT_EVENT_TYPE = "pms_set6_event_type_updated";
export const SET6_AUDIT_FUNCTION_SPACE = "pms_set6_function_space_updated";
export const SET6_AUDIT_DISTRIBUTION_CHANNEL = "pms_set6_distribution_channel_updated";
export const SET6_AUDIT_DISTRIBUTION_MAPPING = "pms_set6_distribution_mapping_updated";
export const SET6_AUDIT_REPORTS_CATALOGUE = "pms_set6_reports_catalogue_updated";
export const SET6_AUDIT_REPORTS_SCHEDULE = "pms_set6_reports_schedule_updated";
export const SET6_AUDIT_OFFLINE_ENABLEMENT = "pms_set6_offline_enablement_updated";
export const SET6_AUDIT_OFFLINE_SYNC = "pms_set6_offline_sync_updated";
export const SET6_AUDIT_ACTIONS = [
  SET6_AUDIT_MARKET_SEGMENT,
  SET6_AUDIT_SOURCE_CODE,
  SET6_AUDIT_SALES_CHANNEL,
  SET6_AUDIT_ACCOUNT_TYPE,
  SET6_AUDIT_EVENT_TYPE,
  SET6_AUDIT_FUNCTION_SPACE,
  SET6_AUDIT_DISTRIBUTION_CHANNEL,
  SET6_AUDIT_DISTRIBUTION_MAPPING,
  SET6_AUDIT_REPORTS_CATALOGUE,
  SET6_AUDIT_REPORTS_SCHEDULE,
  SET6_AUDIT_OFFLINE_ENABLEMENT,
  SET6_AUDIT_OFFLINE_SYNC,
] as const;

export const SET6_CATALOGUE_KINDS = [
  "market_segment",
  "source_code",
  "sales_channel",
  "account_type",
  "event_type",
  "function_space",
] as const;
export type Set6CatalogueKind = (typeof SET6_CATALOGUE_KINDS)[number];

export const SET6_CATALOGUE_LABELS: Record<Set6CatalogueKind, string> = {
  market_segment: "Market segments",
  source_code: "Source codes",
  sales_channel: "Sales channel labels",
  account_type: "Account type labels",
  event_type: "Event types",
  function_space: "Function space labels",
};

export const DISTRIBUTION_CHANNEL_CLASSES = ["direct", "ota", "gds", "corporate"] as const;
export type DistributionChannelClass = (typeof DISTRIBUTION_CHANNEL_CLASSES)[number];

export const DISTRIBUTION_CHANNEL_LABELS: Record<DistributionChannelClass, string> = {
  direct: "Direct",
  ota: "OTA foundation",
  gds: "GDS",
  corporate: "Corporate",
};

export const REPORT_PACKS = ["operational", "financial", "occupancy", "revenue", "management"] as const;
export type ReportPack = (typeof REPORT_PACKS)[number];

export const REPORT_PACK_LABELS: Record<ReportPack, string> = {
  operational: "Operational",
  financial: "Financial",
  occupancy: "Occupancy",
  revenue: "Revenue",
  management: "Management",
};

export type PmsSet6CatalogueItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type ChannelClassRow = {
  class: DistributionChannelClass;
  open: boolean;
  stopSell: boolean;
};

export type DistributionChannelPosture = {
  channels: ChannelClassRow[];
  savedAt: string | null;
};

export type DistributionMappingPosture = {
  rateMapped: boolean;
  inventoryMapped: boolean;
  roomTypeMapped: boolean;
  savedAt: string | null;
};

export type ReportsCataloguePosture = {
  packs: Record<ReportPack, boolean>;
  savedAt: string | null;
};

export type ReportsScheduleAccessPosture = {
  scheduleEnabled: boolean;
  ownerManagerAccessOnly: boolean;
  savedAt: string | null;
};

export type OfflineEnablementPosture = {
  frontOfficeEnabled: boolean;
  pmsEnabled: boolean;
  savedAt: string | null;
};

export type OfflineSyncPosture = {
  conflictLabel: string;
  savedAt: string | null;
};

export type Set6ActivateInput = {
  salesCataloguesAvailable: boolean;
  eventTypesAvailable: boolean;
  activeMarketSegmentCount: number;
  activeSourceCodeCount: number;
  activeEventTypeCount: number;
  distributionAvailable: boolean;
  channelPostureSaved: boolean;
  mappingPostureSaved: boolean;
  reportsAvailable: boolean;
  reportsCatalogueSaved: boolean;
  reportsScheduleSaved: boolean;
  offlineAvailable: boolean;
  offlineEnablementSaved: boolean;
  offlineSyncSaved: boolean;
};

export type Set6Snapshot = {
  marketSegmentsAvailable: boolean;
  sourceCodesAvailable: boolean;
  salesChannelsAvailable: boolean;
  accountTypesAvailable: boolean;
  eventTypesAvailable: boolean;
  functionSpacesAvailable: boolean;
  distributionAvailable: boolean;
  reportsAvailable: boolean;
  offlineAvailable: boolean;
  marketSegments: PmsSet6CatalogueItem[];
  sourceCodes: PmsSet6CatalogueItem[];
  salesChannels: PmsSet6CatalogueItem[];
  accountTypes: PmsSet6CatalogueItem[];
  eventTypes: PmsSet6CatalogueItem[];
  functionSpaces: PmsSet6CatalogueItem[];
  channelPosture: DistributionChannelPosture;
  mappingPosture: DistributionMappingPosture;
  reportsCatalogue: ReportsCataloguePosture;
  reportsSchedule: ReportsScheduleAccessPosture;
  offlineEnablement: OfflineEnablementPosture;
  offlineSync: OfflineSyncPosture;
};

export function emptyChannelPosture(partial?: Partial<DistributionChannelPosture>): DistributionChannelPosture {
  const listed = Array.isArray(partial?.channels) ? partial.channels : [];
  const byClass = new Map(listed.map((row) => [row.class, row]));
  return {
    savedAt: partial?.savedAt ?? null,
    channels: DISTRIBUTION_CHANNEL_CLASSES.map((channelClass) => {
      const row = byClass.get(channelClass);
      return {
        class: channelClass,
        open: row?.open === true || (channelClass === "direct" && row?.open !== false),
        stopSell: row?.stopSell === true,
      };
    }),
  };
}

export function emptyMappingPosture(partial?: Partial<DistributionMappingPosture>): DistributionMappingPosture {
  return {
    rateMapped: partial?.rateMapped === true,
    inventoryMapped: partial?.inventoryMapped === true,
    roomTypeMapped: partial?.roomTypeMapped === true,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyReportsCatalogue(partial?: Partial<ReportsCataloguePosture>): ReportsCataloguePosture {
  return {
    savedAt: partial?.savedAt ?? null,
    packs: {
      operational: partial?.packs?.operational !== false,
      financial: partial?.packs?.financial !== false,
      occupancy: partial?.packs?.occupancy !== false,
      revenue: partial?.packs?.revenue !== false,
      management: partial?.packs?.management !== false,
    },
  };
}

export function emptyReportsSchedule(partial?: Partial<ReportsScheduleAccessPosture>): ReportsScheduleAccessPosture {
  return {
    scheduleEnabled: partial?.scheduleEnabled === true,
    ownerManagerAccessOnly: partial?.ownerManagerAccessOnly !== false,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyOfflineEnablement(partial?: Partial<OfflineEnablementPosture>): OfflineEnablementPosture {
  return {
    frontOfficeEnabled: partial?.frontOfficeEnabled === true,
    pmsEnabled: partial?.pmsEnabled === true,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyOfflineSync(partial?: Partial<OfflineSyncPosture>): OfflineSyncPosture {
  return {
    conflictLabel: String(partial?.conflictLabel ?? "").trim(),
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptySet6Activate(partial?: Partial<Set6ActivateInput>): Set6ActivateInput {
  return {
    salesCataloguesAvailable: false,
    eventTypesAvailable: false,
    activeMarketSegmentCount: 0,
    activeSourceCodeCount: 0,
    activeEventTypeCount: 0,
    distributionAvailable: false,
    channelPostureSaved: false,
    mappingPostureSaved: false,
    reportsAvailable: false,
    reportsCatalogueSaved: false,
    reportsScheduleSaved: false,
    offlineAvailable: false,
    offlineEnablementSaved: false,
    offlineSyncSaved: false,
    ...partial,
  };
}

export function completeSet6Activate(partial?: Partial<Set6ActivateInput>): Set6ActivateInput {
  return emptySet6Activate({
    salesCataloguesAvailable: true,
    eventTypesAvailable: true,
    activeMarketSegmentCount: 1,
    activeSourceCodeCount: 1,
    activeEventTypeCount: 1,
    distributionAvailable: true,
    channelPostureSaved: true,
    mappingPostureSaved: true,
    reportsAvailable: true,
    reportsCatalogueSaved: true,
    reportsScheduleSaved: true,
    offlineAvailable: true,
    offlineEnablementSaved: true,
    offlineSyncSaved: true,
    ...partial,
  });
}

export function emptySet6Snapshot(partial?: Partial<Set6Snapshot>): Set6Snapshot {
  return {
    marketSegmentsAvailable: false,
    sourceCodesAvailable: false,
    salesChannelsAvailable: false,
    accountTypesAvailable: false,
    eventTypesAvailable: false,
    functionSpacesAvailable: false,
    distributionAvailable: false,
    reportsAvailable: false,
    offlineAvailable: false,
    marketSegments: [],
    sourceCodes: [],
    salesChannels: [],
    accountTypes: [],
    eventTypes: [],
    functionSpaces: [],
    channelPosture: emptyChannelPosture(),
    mappingPosture: emptyMappingPosture(),
    reportsCatalogue: emptyReportsCatalogue(),
    reportsSchedule: emptyReportsSchedule(),
    offlineEnablement: emptyOfflineEnablement(),
    offlineSync: emptyOfflineSync(),
    ...partial,
  };
}

export function activateInputFromSet6Snapshot(snapshot: Set6Snapshot): Set6ActivateInput {
  return {
    salesCataloguesAvailable: snapshot.marketSegmentsAvailable || snapshot.sourceCodesAvailable,
    eventTypesAvailable: snapshot.eventTypesAvailable,
    activeMarketSegmentCount: snapshot.marketSegments.filter((row) => row.active).length,
    activeSourceCodeCount: snapshot.sourceCodes.filter((row) => row.active).length,
    activeEventTypeCount: snapshot.eventTypes.filter((row) => row.active).length,
    distributionAvailable: snapshot.distributionAvailable,
    channelPostureSaved: Boolean(snapshot.channelPosture.savedAt),
    mappingPostureSaved: Boolean(snapshot.mappingPosture.savedAt),
    reportsAvailable: snapshot.reportsAvailable,
    reportsCatalogueSaved: Boolean(snapshot.reportsCatalogue.savedAt),
    reportsScheduleSaved: Boolean(snapshot.reportsSchedule.savedAt),
    offlineAvailable: snapshot.offlineAvailable,
    offlineEnablementSaved: Boolean(snapshot.offlineEnablement.savedAt),
    offlineSyncSaved: Boolean(snapshot.offlineSync.savedAt),
  };
}

function savedAtOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { savedAt?: unknown };
  return typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
}

export function parseChannelClass(value: unknown): DistributionChannelClass | "" {
  return (DISTRIBUTION_CHANNEL_CLASSES as readonly string[]).includes(String(value))
    ? (value as DistributionChannelClass)
    : "";
}

export function parseReportPack(value: unknown): ReportPack | "" {
  return (REPORT_PACKS as readonly string[]).includes(String(value)) ? (value as ReportPack) : "";
}

export function parseChannelPosture(value: unknown): DistributionChannelPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyChannelPosture();
  const rec = value as { channels?: unknown };
  const listed = Array.isArray(rec.channels) ? rec.channels : [];
  const byClass = new Map<DistributionChannelClass, ChannelClassRow>();
  for (const row of listed) {
    if (!row || typeof row !== "object") continue;
    const item = row as { class?: unknown; open?: unknown; stopSell?: unknown };
    const channelClass = parseChannelClass(item.class);
    if (!channelClass) continue;
    byClass.set(channelClass, {
      class: channelClass,
      open: item.open === true,
      stopSell: item.stopSell === true,
    });
  }
  return emptyChannelPosture({ savedAt, channels: [...byClass.values()] });
}

export function parseMappingPosture(value: unknown): DistributionMappingPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyMappingPosture();
  const rec = value as Partial<DistributionMappingPosture>;
  return emptyMappingPosture({
    rateMapped: rec.rateMapped === true,
    inventoryMapped: rec.inventoryMapped === true,
    roomTypeMapped: rec.roomTypeMapped === true,
    savedAt,
  });
}

export function parseReportsCatalogue(value: unknown): ReportsCataloguePosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyReportsCatalogue();
  const rec = value as { packs?: Partial<Record<ReportPack, unknown>> };
  return emptyReportsCatalogue({
    savedAt,
    packs: {
      operational: rec.packs?.operational !== false,
      financial: rec.packs?.financial !== false,
      occupancy: rec.packs?.occupancy !== false,
      revenue: rec.packs?.revenue !== false,
      management: rec.packs?.management !== false,
    },
  });
}

export function parseReportsSchedule(value: unknown): ReportsScheduleAccessPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyReportsSchedule();
  const rec = value as Partial<ReportsScheduleAccessPosture>;
  return emptyReportsSchedule({
    scheduleEnabled: rec.scheduleEnabled === true,
    ownerManagerAccessOnly: rec.ownerManagerAccessOnly !== false,
    savedAt,
  });
}

export function parseOfflineEnablement(value: unknown): OfflineEnablementPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyOfflineEnablement();
  const rec = value as Partial<OfflineEnablementPosture>;
  return emptyOfflineEnablement({
    frontOfficeEnabled: rec.frontOfficeEnabled === true,
    pmsEnabled: rec.pmsEnabled === true,
    savedAt,
  });
}

export function parseOfflineSync(value: unknown): OfflineSyncPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyOfflineSync();
  const rec = value as Partial<OfflineSyncPosture>;
  return emptyOfflineSync({
    conflictLabel: String(rec.conflictLabel ?? "").trim(),
    savedAt,
  });
}

function domain(id: Set1DomainReport["id"], missing: string[], warnings: string[]): Set1DomainReport {
  const readiness: Set1Readiness = missing.length ? "incomplete" : warnings.length ? "warning" : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluateSalesEvents(input: Set6ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  const canRead = input.salesCataloguesAvailable || input.eventTypesAvailable;
  if (!canRead) warnings.push(SET6_SALES_UNAVAILABLE);
  else if (input.activeMarketSegmentCount + input.activeSourceCodeCount + input.activeEventTypeCount === 0) {
    warnings.push(SET6_SALES_WARNING);
  }
  return domain("sales-events", [], warnings);
}

export function evaluateDistribution(input: Set6ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.distributionAvailable) warnings.push(SET6_DISTRIBUTION_UNAVAILABLE);
  else {
    if (!input.channelPostureSaved) warnings.push(SET6_CHANNEL_WARNING);
    if (!input.mappingPostureSaved) warnings.push(SET6_MAPPING_WARNING);
  }
  return domain("distribution", [], warnings);
}

export function evaluateReports(input: Set6ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.reportsAvailable) warnings.push(SET6_REPORTS_UNAVAILABLE);
  else {
    if (!input.reportsCatalogueSaved) warnings.push(SET6_REPORTS_CATALOGUE_WARNING);
    if (!input.reportsScheduleSaved) warnings.push(SET6_REPORTS_SCHEDULE_WARNING);
  }
  return domain("reports", [], warnings);
}

export function evaluateOfflineSync(input: Set6ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.offlineAvailable) warnings.push(SET6_OFFLINE_UNAVAILABLE);
  else {
    if (!input.offlineEnablementSaved) warnings.push(SET6_OFFLINE_ENABLE_WARNING);
    if (!input.offlineSyncSaved) warnings.push(SET6_OFFLINE_SYNC_WARNING);
  }
  return domain("offline-sync", [], warnings);
}

/** SET6 never adds Activate Incomplete blockers. */
export function set6MandatoryMissing(_input: Set6ActivateInput): string[] {
  return [];
}

export function distributionHonestyRows(): Array<{
  id: DistributionChannelClass;
  title: string;
  status: "live" | "warning";
  note: string;
}> {
  return [
    { id: "direct", title: "Direct", status: "live", note: SET6_DIRECT_LIVE_NOTE },
    { id: "ota", title: "OTA foundation", status: "warning", note: SET6_OTA_FOUNDATION },
    { id: "gds", title: "GDS", status: "warning", note: SET6_GDS_FOUNDATION },
    { id: "corporate", title: "Corporate", status: "warning", note: SET6_CORPORATE_FOUNDATION },
  ];
}

export function neverFakeConnectedOta(note: string): boolean {
  return !/\b(ota is connected|connected ota|ota connected)\b/i.test(note);
}

export function neverFakeOfflineReady(copy: string): boolean {
  const lower = copy.toLowerCase();
  if (lower.includes("never") && lower.includes("offline ready")) return true;
  return !/offline ready/i.test(lower);
}
