/**
 * PMS-SET5 — Departments · Guest services types · Notifications · Admin ·
 * Integrations · Security (Issue #77).
 *
 * Abel-approved 2026-09-14 locks:
 * - Departments Warning. ≥1 active department → Complete for that row.
 *   Empty work centres stay Warning. No invented sample departments.
 * - Guest services is a request-type catalogue only. ≥1 active type → Complete.
 * - Notifications are not an ESP. Email / SMS / in-app only. WhatsApp is
 *   future and stays disabled. Empty templates = Warning.
 * - Admin is thin numbering / approvals / override. No second StaffManager.
 * - Integrations home is Settings #integrations. /restaurant/pms/integrations
 *   redirects there. Honesty only — POS charge-to-room Live note; payment /
 *   accounting / API / third-party Foundation / not connected = Warning.
 *   Dual-hub unresolved is Incomplete checklist honesty, never an Activate flag.
 *   Do not invent live payment gateways, channel managers or accounting connectors.
 * - Security is session / retention / thin sensitive-data flags aligned with
 *   SET3. No IAM. Do not rebuild Guest Profile.
 * - Single Activate still flips only pms_set1_live. No new SET5 Incomplete
 *   Activate blockers. SET1–4 mandatory still block.
 * - 0051 tables/columns are additive and may be absent — never crash.
 */

import type { Set1DomainReport, Set1Readiness } from "./pms-set1-foundation.ts";

export const SET5_GUEST_SERVICES_HREF = "/restaurant/pms/guest-services";
export const SET5_NOTIFICATIONS_HREF = "/restaurant/pms/notifications";
export const SET5_ADMIN_HREF = "/restaurant/pms/administration";
export const SET5_SECURITY_HREF = "/restaurant/pms/security-audit";
export const SET5_INTEGRATIONS_HREF = "/restaurant/settings#integrations";
export const SET5_INTEGRATIONS_ALIAS = "/restaurant/pms/integrations";

export const SET5_DEPTS_UNAVAILABLE = "Unavailable — department catalogues are not applied yet.";
export const SET5_DEPTS_WARNING = "No active departments in the catalogue yet. This is a warning, not a block.";
export const SET5_WORK_CENTRES_WARNING = "No work centres in the catalogue yet. This is a warning, not a block.";
export const SET5_ROUTING_WARNING = "No posting routing defaults saved yet. This is a warning, not a block.";
export const SET5_REQUEST_TYPES_UNAVAILABLE = "Unavailable — guest request types are not applied yet.";
export const SET5_REQUEST_TYPES_WARNING = "No active guest request types in the catalogue yet. This is a warning, not a block.";
export const SET5_NOTIFICATIONS_UNAVAILABLE = "Unavailable — notification settings are not applied yet.";
export const SET5_TEMPLATES_WARNING = "No notification templates in the catalogue yet. This is a warning, not a block.";
export const SET5_CHANNELS_WARNING = "Notification channels are a draft until you save. WhatsApp stays future.";
export const SET5_ADMIN_UNAVAILABLE = "Unavailable — administration controls are not applied yet.";
export const SET5_ADMIN_WARNING = "Numbering, approvals and override are a draft until you save. This is a warning, not a block.";
export const SET5_SECURITY_UNAVAILABLE = "Unavailable — session and audit-retention posture is not applied yet.";
export const SET5_SESSION_WARNING = "Session access posture is a draft until you save. This is a warning, not a block.";
export const SET5_RETENTION_WARNING = "Audit retention posture is a draft until you save. This is a warning, not a block.";
export const SET5_INTEGRATIONS_DUAL_HUB =
  "Integrations still has two homes. Settings is the source of truth — this is Incomplete honesty, not an Activate block.";
export const SET5_PAYMENTS_WARNING = "Payment gateways are not connected. Foundation only — not a live connector.";
export const SET5_ACCOUNTING_WARNING = "Accounting export is not connected. Foundation only — not a live connector.";
export const SET5_API_WARNING = "API keys and webhooks are not connected. Foundation only — not a live connector.";
export const SET5_THIRD_PARTY_WARNING =
  "Channel managers, door locks and other third-party systems are not connected. Foundation only.";
export const SET5_POS_LIVE_NOTE =
  "Charge to room is live. Restaurant and POS sales can post onto an in-house folio. This page does not operate the POS.";
export const SET5_WHATSAPP_FUTURE = "WhatsApp is a future channel and stays disabled.";

export const SET5_AUDIT_DEPARTMENT = "pms_set5_department_updated";
export const SET5_AUDIT_WORK_CENTER = "pms_set5_work_center_updated";
export const SET5_AUDIT_ROUTING = "pms_set5_routing_updated";
export const SET5_AUDIT_REQUEST_TYPE = "pms_set5_request_type_updated";
export const SET5_AUDIT_CHANNELS = "pms_set5_notification_channels_updated";
export const SET5_AUDIT_TEMPLATE = "pms_set5_notification_template_updated";
export const SET5_AUDIT_EVENT_RULES = "pms_set5_notification_events_updated";
export const SET5_AUDIT_ADMIN = "pms_set5_admin_controls_updated";
export const SET5_AUDIT_SESSION = "pms_set5_session_access_updated";
export const SET5_AUDIT_RETENTION = "pms_set5_audit_retention_updated";
export const SET5_AUDIT_ACTIONS = [
  SET5_AUDIT_DEPARTMENT,
  SET5_AUDIT_WORK_CENTER,
  SET5_AUDIT_ROUTING,
  SET5_AUDIT_REQUEST_TYPE,
  SET5_AUDIT_CHANNELS,
  SET5_AUDIT_TEMPLATE,
  SET5_AUDIT_EVENT_RULES,
  SET5_AUDIT_ADMIN,
  SET5_AUDIT_SESSION,
  SET5_AUDIT_RETENTION,
] as const;

export const NOTIFICATION_CHANNELS = ["email", "sms", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  in_app: "In-app",
};

export const NOTIFICATION_EVENT_KEYS = [
  "reservation_confirmed",
  "pre_arrival",
  "guest_request_created",
  "night_audit_exception",
] as const;
export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventKey, string> = {
  reservation_confirmed: "Reservation confirmed",
  pre_arrival: "Pre-arrival",
  guest_request_created: "Guest request created",
  night_audit_exception: "Night audit exception",
};

export type PmsSet5CatalogueItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type PmsDepartment = PmsSet5CatalogueItem;

export type PmsWorkCenter = PmsSet5CatalogueItem & {
  departmentId: string;
};

export type PmsGuestRequestType = PmsSet5CatalogueItem & {
  departmentId: string | null;
};

export type PmsNotificationTemplate = {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannel;
  body: string;
  active: boolean;
};

export type RoutingDefaults = {
  defaultDepartmentId: string | null;
  folioPostingUsesDepartment: boolean;
  savedAt: string | null;
};

export type NotificationChannels = {
  email: boolean;
  sms: boolean;
  inApp: boolean;
  whatsapp: false;
  savedAt: string | null;
};

export type NotificationEventRule = {
  eventKey: NotificationEventKey;
  channel: NotificationChannel;
  enabled: boolean;
};

export type NotificationEventRules = {
  rules: NotificationEventRule[];
  savedAt: string | null;
};

export type AdminControls = {
  reservationPrefix: string;
  folioPrefix: string;
  rateOverrideNeedsApproval: boolean;
  lateCheckoutNeedsApproval: boolean;
  managerOverrideEnabled: boolean;
  savedAt: string | null;
};

export type SessionAccessPosture = {
  idleTimeoutMinutes: number | null;
  reauthForSensitive: boolean;
  savedAt: string | null;
};

export type AuditRetentionPosture = {
  retentionDays: number | null;
  maskIdNumbers: boolean;
  restrictGuestExport: boolean;
  savedAt: string | null;
};

export type IntegrationHonesty = {
  posChargeToRoomLive: true;
  paymentConnected: false;
  accountingConnected: false;
  apiConnected: false;
  thirdPartyConnected: false;
  dualHubResolved: boolean;
};

export type Set5ActivateInput = {
  departmentsAvailable: boolean;
  activeDepartmentCount: number;
  workCentersAvailable: boolean;
  workCenterCount: number;
  routingSaved: boolean;
  requestTypesAvailable: boolean;
  activeRequestTypeCount: number;
  notificationsAvailable: boolean;
  templateCount: number;
  channelsSaved: boolean;
  adminAvailable: boolean;
  adminSaved: boolean;
  securityAvailable: boolean;
  sessionSaved: boolean;
  retentionSaved: boolean;
  dualHubResolved: boolean;
};

export type Set5Snapshot = {
  departmentsAvailable: boolean;
  workCentersAvailable: boolean;
  requestTypesAvailable: boolean;
  notificationsAvailable: boolean;
  adminAvailable: boolean;
  securityAvailable: boolean;
  departments: PmsDepartment[];
  workCenters: PmsWorkCenter[];
  requestTypes: PmsGuestRequestType[];
  templates: PmsNotificationTemplate[];
  routingDefaults: RoutingDefaults;
  channels: NotificationChannels;
  eventRules: NotificationEventRules;
  adminControls: AdminControls;
  sessionAccess: SessionAccessPosture;
  auditRetention: AuditRetentionPosture;
  integrations: IntegrationHonesty;
};

export function emptyRoutingDefaults(partial?: Partial<RoutingDefaults>): RoutingDefaults {
  return {
    defaultDepartmentId: partial?.defaultDepartmentId ?? null,
    folioPostingUsesDepartment: partial?.folioPostingUsesDepartment ?? false,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyNotificationChannels(partial?: Partial<NotificationChannels>): NotificationChannels {
  return {
    email: partial?.email !== false,
    sms: partial?.sms === true,
    inApp: partial?.inApp !== false,
    whatsapp: false,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyNotificationEventRules(partial?: Partial<NotificationEventRules>): NotificationEventRules {
  return {
    savedAt: partial?.savedAt ?? null,
    rules:
      partial?.rules ??
      NOTIFICATION_EVENT_KEYS.map((eventKey) => ({
        eventKey,
        channel: eventKey === "guest_request_created" ? "in_app" : "email",
        enabled: false,
      })),
  };
}

export function emptyAdminControls(partial?: Partial<AdminControls>): AdminControls {
  return {
    reservationPrefix: partial?.reservationPrefix ?? "",
    folioPrefix: partial?.folioPrefix ?? "",
    rateOverrideNeedsApproval: partial?.rateOverrideNeedsApproval !== false,
    lateCheckoutNeedsApproval: partial?.lateCheckoutNeedsApproval === true,
    managerOverrideEnabled: partial?.managerOverrideEnabled === true,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptySessionAccess(partial?: Partial<SessionAccessPosture>): SessionAccessPosture {
  return {
    idleTimeoutMinutes: partial?.idleTimeoutMinutes ?? null,
    reauthForSensitive: partial?.reauthForSensitive === true,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyAuditRetention(partial?: Partial<AuditRetentionPosture>): AuditRetentionPosture {
  return {
    retentionDays: partial?.retentionDays ?? null,
    maskIdNumbers: partial?.maskIdNumbers !== false,
    restrictGuestExport: partial?.restrictGuestExport === true,
    savedAt: partial?.savedAt ?? null,
  };
}

export function emptyIntegrationHonesty(partial?: Partial<IntegrationHonesty>): IntegrationHonesty {
  return {
    posChargeToRoomLive: true,
    paymentConnected: false,
    accountingConnected: false,
    apiConnected: false,
    thirdPartyConnected: false,
    dualHubResolved: partial?.dualHubResolved ?? true,
  };
}

export function emptySet5Activate(partial?: Partial<Set5ActivateInput>): Set5ActivateInput {
  return {
    departmentsAvailable: false,
    activeDepartmentCount: 0,
    workCentersAvailable: false,
    workCenterCount: 0,
    routingSaved: false,
    requestTypesAvailable: false,
    activeRequestTypeCount: 0,
    notificationsAvailable: false,
    templateCount: 0,
    channelsSaved: false,
    adminAvailable: false,
    adminSaved: false,
    securityAvailable: false,
    sessionSaved: false,
    retentionSaved: false,
    dualHubResolved: true,
    ...partial,
  };
}

export function completeSet5Activate(partial?: Partial<Set5ActivateInput>): Set5ActivateInput {
  return emptySet5Activate({
    departmentsAvailable: true,
    activeDepartmentCount: 1,
    workCentersAvailable: true,
    workCenterCount: 1,
    routingSaved: true,
    requestTypesAvailable: true,
    activeRequestTypeCount: 1,
    notificationsAvailable: true,
    templateCount: 1,
    channelsSaved: true,
    adminAvailable: true,
    adminSaved: true,
    securityAvailable: true,
    sessionSaved: true,
    retentionSaved: true,
    dualHubResolved: true,
    ...partial,
  });
}

export function emptySet5Snapshot(partial?: Partial<Set5Snapshot>): Set5Snapshot {
  return {
    departmentsAvailable: false,
    workCentersAvailable: false,
    requestTypesAvailable: false,
    notificationsAvailable: false,
    adminAvailable: false,
    securityAvailable: false,
    departments: [],
    workCenters: [],
    requestTypes: [],
    templates: [],
    routingDefaults: emptyRoutingDefaults(),
    channels: emptyNotificationChannels(),
    eventRules: emptyNotificationEventRules(),
    adminControls: emptyAdminControls(),
    sessionAccess: emptySessionAccess(),
    auditRetention: emptyAuditRetention(),
    integrations: emptyIntegrationHonesty(),
    ...partial,
  };
}

export function activateInputFromSet5Snapshot(snapshot: Set5Snapshot): Set5ActivateInput {
  return {
    departmentsAvailable: snapshot.departmentsAvailable,
    activeDepartmentCount: snapshot.departments.filter((row) => row.active).length,
    workCentersAvailable: snapshot.workCentersAvailable,
    workCenterCount: snapshot.workCenters.filter((row) => row.active).length,
    routingSaved: Boolean(snapshot.routingDefaults.savedAt),
    requestTypesAvailable: snapshot.requestTypesAvailable,
    activeRequestTypeCount: snapshot.requestTypes.filter((row) => row.active).length,
    notificationsAvailable: snapshot.notificationsAvailable,
    templateCount: snapshot.templates.filter((row) => row.active).length,
    channelsSaved: Boolean(snapshot.channels.savedAt),
    adminAvailable: snapshot.adminAvailable,
    adminSaved: Boolean(snapshot.adminControls.savedAt),
    securityAvailable: snapshot.securityAvailable,
    sessionSaved: Boolean(snapshot.sessionAccess.savedAt),
    retentionSaved: Boolean(snapshot.auditRetention.savedAt),
    dualHubResolved: snapshot.integrations.dualHubResolved,
  };
}

export function parseNotificationChannel(value: unknown): NotificationChannel | "" {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(String(value)) ? (value as NotificationChannel) : "";
}

export function parseNotificationEventKey(value: unknown): NotificationEventKey | "" {
  return (NOTIFICATION_EVENT_KEYS as readonly string[]).includes(String(value)) ? (value as NotificationEventKey) : "";
}

function savedAtOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as { savedAt?: unknown };
  return typeof rec.savedAt === "string" && rec.savedAt.trim() ? rec.savedAt : null;
}

export function parseRoutingDefaults(value: unknown): RoutingDefaults {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyRoutingDefaults();
  const rec = value as Partial<RoutingDefaults>;
  return emptyRoutingDefaults({
    defaultDepartmentId: rec.defaultDepartmentId ? String(rec.defaultDepartmentId) : null,
    folioPostingUsesDepartment: rec.folioPostingUsesDepartment === true,
    savedAt,
  });
}

export function parseNotificationChannels(value: unknown): NotificationChannels {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyNotificationChannels();
  const rec = value as Partial<NotificationChannels>;
  return emptyNotificationChannels({
    email: rec.email !== false,
    sms: rec.sms === true,
    inApp: rec.inApp !== false,
    whatsapp: false,
    savedAt,
  });
}

export function parseNotificationEventRules(value: unknown): NotificationEventRules {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyNotificationEventRules();
  const rec = value as { rules?: unknown };
  const listed = Array.isArray(rec.rules) ? rec.rules : [];
  const byKey = new Map<NotificationEventKey, NotificationEventRule>();
  for (const row of listed) {
    if (!row || typeof row !== "object") continue;
    const item = row as { eventKey?: unknown; channel?: unknown; enabled?: unknown };
    const eventKey = parseNotificationEventKey(item.eventKey);
    const channel = parseNotificationChannel(item.channel);
    if (!eventKey || !channel) continue;
    byKey.set(eventKey, { eventKey, channel, enabled: item.enabled === true });
  }
  return emptyNotificationEventRules({
    savedAt,
    rules: NOTIFICATION_EVENT_KEYS.map(
      (eventKey) =>
        byKey.get(eventKey) ?? {
          eventKey,
          channel: eventKey === "guest_request_created" ? "in_app" : "email",
          enabled: false,
        },
    ),
  });
}

export function parseAdminControls(value: unknown): AdminControls {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyAdminControls();
  const rec = value as Partial<AdminControls>;
  return emptyAdminControls({
    reservationPrefix: String(rec.reservationPrefix ?? "").trim(),
    folioPrefix: String(rec.folioPrefix ?? "").trim(),
    rateOverrideNeedsApproval: rec.rateOverrideNeedsApproval !== false,
    lateCheckoutNeedsApproval: rec.lateCheckoutNeedsApproval === true,
    managerOverrideEnabled: rec.managerOverrideEnabled === true,
    savedAt,
  });
}

export function parseSessionAccess(value: unknown): SessionAccessPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptySessionAccess();
  const rec = value as Partial<SessionAccessPosture>;
  const minutes = Number(rec.idleTimeoutMinutes);
  return emptySessionAccess({
    idleTimeoutMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    reauthForSensitive: rec.reauthForSensitive === true,
    savedAt,
  });
}

export function parseAuditRetention(value: unknown): AuditRetentionPosture {
  const savedAt = savedAtOf(value);
  if (!savedAt || !value || typeof value !== "object") return emptyAuditRetention();
  const rec = value as Partial<AuditRetentionPosture>;
  const days = Number(rec.retentionDays);
  return emptyAuditRetention({
    retentionDays: Number.isFinite(days) && days > 0 ? days : null,
    maskIdNumbers: rec.maskIdNumbers !== false,
    restrictGuestExport: rec.restrictGuestExport === true,
    savedAt,
  });
}

export function whatsappStaysDisabled(channels: Pick<NotificationChannels, "whatsapp">): boolean {
  return channels.whatsapp === false;
}

function domain(id: Set1DomainReport["id"], missing: string[], warnings: string[]): Set1DomainReport {
  const readiness: Set1Readiness = missing.length ? "incomplete" : warnings.length ? "warning" : "complete";
  return { id, readiness, missing, warnings };
}

export function evaluateDepartments(input: Set5ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.departmentsAvailable) warnings.push(SET5_DEPTS_UNAVAILABLE);
  else if (input.activeDepartmentCount === 0) warnings.push(SET5_DEPTS_WARNING);
  if (!input.workCentersAvailable) {
    if (!warnings.includes(SET5_DEPTS_UNAVAILABLE)) warnings.push(SET5_WORK_CENTRES_WARNING);
  } else if (input.workCenterCount === 0) {
    warnings.push(SET5_WORK_CENTRES_WARNING);
  }
  if (!input.departmentsAvailable) {
    if (!warnings.includes(SET5_ROUTING_WARNING)) warnings.push(SET5_ROUTING_WARNING);
  } else if (!input.routingSaved) {
    warnings.push(SET5_ROUTING_WARNING);
  }
  return domain("departments", [], warnings);
}

export function evaluateGuestServiceTypes(input: Set5ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.requestTypesAvailable) warnings.push(SET5_REQUEST_TYPES_UNAVAILABLE);
  else if (input.activeRequestTypeCount === 0) warnings.push(SET5_REQUEST_TYPES_WARNING);
  return domain("guest-services-types", [], warnings);
}

export function evaluateNotifications(input: Set5ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.notificationsAvailable) warnings.push(SET5_NOTIFICATIONS_UNAVAILABLE);
  else {
    if (!input.channelsSaved) warnings.push(SET5_CHANNELS_WARNING);
    if (input.templateCount === 0) warnings.push(SET5_TEMPLATES_WARNING);
  }
  return domain("notifications", [], warnings);
}

export function evaluateAdminControls(input: Set5ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.adminAvailable) warnings.push(SET5_ADMIN_UNAVAILABLE);
  else if (!input.adminSaved) warnings.push(SET5_ADMIN_WARNING);
  return domain("administration", [], warnings);
}

export function evaluateIntegrations(input: Set5ActivateInput): Set1DomainReport {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!input.dualHubResolved) missing.push("Integrations home");
  warnings.push(SET5_PAYMENTS_WARNING, SET5_ACCOUNTING_WARNING, SET5_API_WARNING, SET5_THIRD_PARTY_WARNING);
  if (!input.dualHubResolved) warnings.push(SET5_INTEGRATIONS_DUAL_HUB);
  return domain("integrations", missing, warnings);
}

export function evaluateSecurityAudit(input: Set5ActivateInput): Set1DomainReport {
  const warnings: string[] = [];
  if (!input.securityAvailable) warnings.push(SET5_SECURITY_UNAVAILABLE);
  else {
    if (!input.sessionSaved) warnings.push(SET5_SESSION_WARNING);
    if (!input.retentionSaved) warnings.push(SET5_RETENTION_WARNING);
  }
  return domain("security-audit", [], warnings);
}

/** SET5 never adds Activate Incomplete blockers. Dual-hub Incomplete is honesty only. */
export function set5MandatoryMissing(_input: Set5ActivateInput): string[] {
  return [];
}

export function integrationHonestyRows(input: IntegrationHonesty): Array<{
  id: string;
  title: string;
  status: "live" | "warning" | "incomplete";
  note: string;
}> {
  return [
    { id: "pos", title: "POS charge to room", status: "live", note: SET5_POS_LIVE_NOTE },
    { id: "payments", title: "Payment gateways", status: "warning", note: SET5_PAYMENTS_WARNING },
    { id: "accounting", title: "Accounting", status: "warning", note: SET5_ACCOUNTING_WARNING },
    { id: "api", title: "APIs", status: "warning", note: SET5_API_WARNING },
    { id: "third-party", title: "Third-party systems", status: "warning", note: SET5_THIRD_PARTY_WARNING },
    ...(input.dualHubResolved
      ? []
      : [{ id: "dual-hub", title: "Integrations home", status: "incomplete" as const, note: SET5_INTEGRATIONS_DUAL_HUB }]),
  ];
}
