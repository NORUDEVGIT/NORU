import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canActivateSet1,
  canEditSet1,
  emptyIdentity,
  emptyOps,
  emptyPolicies,
  emptyTaxes,
  evaluateSet1Checklist,
  SET1_COMING_SOON,
  SET1_LIVE_CARDS,
} from "./pms-set1-foundation.ts";
import { completeSet2Activate } from "./pms-set2-structure.ts";
import { completeSet3Activate } from "./pms-set3-rates-guest.ts";
import { completeSet4Activate } from "./pms-set4-hk-inventory.ts";
import {
  SET5_ACCOUNTING_WARNING,
  SET5_ADMIN_HREF,
  SET5_ADMIN_UNAVAILABLE,
  SET5_ADMIN_WARNING,
  SET5_API_WARNING,
  SET5_AUDIT_ADMIN,
  SET5_AUDIT_CHANNELS,
  SET5_AUDIT_DEPARTMENT,
  SET5_AUDIT_EVENT_RULES,
  SET5_AUDIT_REQUEST_TYPE,
  SET5_AUDIT_RETENTION,
  SET5_AUDIT_ROUTING,
  SET5_AUDIT_SESSION,
  SET5_AUDIT_TEMPLATE,
  SET5_AUDIT_WORK_CENTER,
  SET5_CHANNELS_WARNING,
  SET5_DEPTS_UNAVAILABLE,
  SET5_DEPTS_WARNING,
  SET5_GUEST_SERVICES_HREF,
  SET5_INTEGRATIONS_ALIAS,
  SET5_INTEGRATIONS_DUAL_HUB,
  SET5_INTEGRATIONS_HREF,
  SET5_NOTIFICATIONS_HREF,
  SET5_NOTIFICATIONS_UNAVAILABLE,
  SET5_PAYMENTS_WARNING,
  SET5_POS_LIVE_NOTE,
  SET5_REQUEST_TYPES_UNAVAILABLE,
  SET5_REQUEST_TYPES_WARNING,
  SET5_RETENTION_WARNING,
  SET5_SECURITY_HREF,
  SET5_SECURITY_UNAVAILABLE,
  SET5_SESSION_WARNING,
  SET5_TEMPLATES_WARNING,
  SET5_THIRD_PARTY_WARNING,
  SET5_WHATSAPP_FUTURE,
  SET5_WORK_CENTRES_WARNING,
  completeSet5Activate,
  emptyNotificationChannels,
  emptySet5Activate,
  evaluateAdminControls,
  evaluateDepartments,
  evaluateGuestServiceTypes,
  evaluateIntegrations,
  evaluateNotifications,
  evaluateSecurityAudit,
  integrationHonestyRows,
  set5MandatoryMissing,
  whatsappStaysDisabled,
} from "./pms-set5-depts-guestsvc.ts";

const completeIdentity = emptyIdentity({
  name: "Harbour House",
  timezone: "Europe/London",
  currencyCode: "GBP",
  propertyCode: "HH",
  legalName: "Harbour House Ltd",
  propertyType: "hotel",
  taxIdentities: [{ label: "VAT", value: "GB123" }],
});
const completeOps = emptyOps({ checkInTime: "15:00", checkOutTime: "11:00" });
const completeTaxes = emptyTaxes({ taxInclusive: false, taxName: "VAT", taxRate: 20 });
const completePolicies = emptyPolicies({
  fees: {
    cancelFeeRequired: true,
    cancelFeeDefault: 0,
    noshowFeeRequired: true,
    noshowFeeDefault: 25,
  },
});

function foundationReady(set5 = completeSet5Activate(), role = "owner") {
  return evaluateSet1Checklist({
    identity: completeIdentity,
    ops: completeOps,
    taxes: completeTaxes,
    policies: completePolicies,
    foundationColumnsAvailable: true,
    pmsSet1Live: false,
    role,
    set2: completeSet2Activate(),
    set3: completeSet3Activate(),
    set4: completeSet4Activate(),
    set5,
  });
}

describe("PMS-SET5 Warning-only catalogues", () => {
  it("keeps empty depts, request types and templates as Warning and Complete when one is active", () => {
    const empty = evaluateDepartments(emptySet5Activate({ departmentsAvailable: true, workCentersAvailable: true }));
    assert.equal(empty.readiness, "warning");
    assert.ok(empty.warnings.includes(SET5_DEPTS_WARNING));
    assert.ok(empty.warnings.includes(SET5_WORK_CENTRES_WARNING));
    assert.deepEqual(empty.missing, []);

    const oneDept = evaluateDepartments(
      emptySet5Activate({
        departmentsAvailable: true,
        activeDepartmentCount: 1,
        workCentersAvailable: true,
        workCenterCount: 1,
        routingSaved: true,
      }),
    );
    assert.equal(oneDept.readiness, "complete");

    const emptyTypes = evaluateGuestServiceTypes(emptySet5Activate({ requestTypesAvailable: true }));
    assert.equal(emptyTypes.readiness, "warning");
    assert.ok(emptyTypes.warnings.includes(SET5_REQUEST_TYPES_WARNING));
    assert.equal(
      evaluateGuestServiceTypes(emptySet5Activate({ requestTypesAvailable: true, activeRequestTypeCount: 1 })).readiness,
      "complete",
    );

    const emptyTemplates = evaluateNotifications(emptySet5Activate({ notificationsAvailable: true, channelsSaved: true }));
    assert.equal(emptyTemplates.readiness, "warning");
    assert.ok(emptyTemplates.warnings.includes(SET5_TEMPLATES_WARNING));
    assert.ok(emptyTemplates.warnings.includes(SET5_CHANNELS_WARNING) === false);
  });
});

describe("PMS-SET5 no new Activate Incomplete blockers", () => {
  it("never adds SET5 missing to Activate and keeps SET1–4 mandatory", () => {
    const missing0051 = foundationReady(emptySet5Activate());
    assert.deepEqual(set5MandatoryMissing(emptySet5Activate()), []);
    assert.equal(missing0051.canActivate, true);
    assert.equal(missing0051.domains.departments.readiness, "warning");
    assert.ok(missing0051.domains.departments.warnings.includes(SET5_DEPTS_UNAVAILABLE));
    assert.ok(missing0051.domains["guest-services-types"].warnings.includes(SET5_REQUEST_TYPES_UNAVAILABLE));
    assert.ok(missing0051.domains.notifications.warnings.includes(SET5_NOTIFICATIONS_UNAVAILABLE));
    assert.ok(missing0051.domains["admin-controls"].warnings.includes(SET5_ADMIN_UNAVAILABLE));
    assert.ok(missing0051.domains["security-audit"].warnings.includes(SET5_SECURITY_UNAVAILABLE));
    assert.ok(!missing0051.mandatoryMissing.includes("Department"));
    assert.ok(!missing0051.mandatoryMissing.includes("Guest request type"));
    assert.ok(!missing0051.mandatoryMissing.includes("Notification template"));

    const dualHub = foundationReady(completeSet5Activate({ dualHubResolved: false }));
    assert.equal(dualHub.domains.integrations.readiness, "incomplete");
    assert.ok(dualHub.domains.integrations.missing.includes("Integrations home"));
    assert.ok(dualHub.domains.integrations.warnings.includes(SET5_INTEGRATIONS_DUAL_HUB));
    assert.equal(dualHub.canActivate, true);
    assert.ok(!dualHub.mandatoryMissing.includes("Integrations home"));
  });
});

describe("PMS-SET5 single Activate and checklist expand", () => {
  it("keeps one pms_set1_live flag and does not let SET5 warnings block Activate", () => {
    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(owner.overall, "warning");
    assert.equal(owner.domains.integrations.readiness, "warning");
    assert.ok(owner.domains.integrations.warnings.includes(SET5_PAYMENTS_WARNING));
    assert.ok(owner.domains.integrations.warnings.includes(SET5_ACCOUNTING_WARNING));
    assert.ok(owner.domains.integrations.warnings.includes(SET5_API_WARNING));
    assert.ok(owner.domains.integrations.warnings.includes(SET5_THIRD_PARTY_WARNING));
    assert.equal(canActivateSet1("owner"), true);

    const manager = foundationReady(completeSet5Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);

    assert.equal(evaluateAdminControls(completeSet5Activate({ adminSaved: false })).readiness, "warning");
    assert.ok(evaluateAdminControls(completeSet5Activate({ adminSaved: false })).warnings.includes(SET5_ADMIN_WARNING));
    assert.equal(evaluateSecurityAudit(completeSet5Activate({ sessionSaved: false, retentionSaved: false })).readiness, "warning");
    assert.ok(evaluateSecurityAudit(completeSet5Activate({ sessionSaved: false })).warnings.includes(SET5_SESSION_WARNING));
    assert.ok(evaluateSecurityAudit(completeSet5Activate({ retentionSaved: false })).warnings.includes(SET5_RETENTION_WARNING));
    assert.ok(evaluateNotifications(completeSet5Activate({ channelsSaved: false })).warnings.includes(SET5_CHANNELS_WARNING));
  });
});

describe("PMS-SET5 hub unmute and deep-links", () => {
  it("promotes SET5 cards, remints Coming soon as SET6 only, and does not label Banks or Roles SET5 Live", () => {
    assert.equal(SET5_GUEST_SERVICES_HREF, "/restaurant/pms/guest-services");
    assert.equal(SET5_NOTIFICATIONS_HREF, "/restaurant/pms/notifications");
    assert.equal(SET5_ADMIN_HREF, "/restaurant/pms/administration");
    assert.equal(SET5_SECURITY_HREF, "/restaurant/pms/security-audit");
    assert.equal(SET5_INTEGRATIONS_HREF, "/restaurant/settings#integrations");
    assert.equal(SET5_INTEGRATIONS_ALIAS, "/restaurant/pms/integrations");
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "departments" && card.title === "Departments"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "guest-services-types"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "notifications"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "admin-controls"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "integrations"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "security-audit"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Banks"));
    assert.ok(!SET1_LIVE_CARDS.some((card) => card.title === "Roles"));
    assert.ok(!SET1_COMING_SOON.some((card) => card.wave === "SET5"));
    assert.ok(SET1_COMING_SOON.every((card) => card.wave === "SET6"));
    assert.deepEqual(
      SET1_COMING_SOON.map((card) => card.title),
      ["Sales", "Distribution", "Reports", "Offline"],
    );

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /Set5DepartmentsSection/);
    assert.match(hub, /Set5GuestServicesSection/);
    assert.match(hub, /Set5NotificationsSection/);
    assert.match(hub, /Set5AdminSection/);
    assert.match(hub, /Set5IntegrationsSection/);
    assert.match(hub, /Set5SecuritySection/);
    assert.match(hub, /Show all/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    assert.doesNotMatch(hub, /overbooking/i);

    const section = readFileSync(new URL("../components/settings/pms-set5-section.tsx", import.meta.url), "utf8");
    assert.match(section, /SET5_GUEST_SERVICES_HREF/);
    assert.match(section, /SET5_NOTIFICATIONS_HREF/);
    assert.match(section, /SET5_ADMIN_HREF/);
    assert.match(section, /SET5_SECURITY_HREF/);
    assert.match(section, /Open guest services/);
    assert.match(section, /Open notifications/);
    assert.match(section, /Open administration/);
    assert.match(section, /Open security/);
    assert.doesNotMatch(section, /StaffManager/);
    assert.doesNotMatch(section, /WhatsApp is live/i);
    assert.match(section, /SET5_WHATSAPP_FUTURE/);
    assert.doesNotMatch(section, /FO-CHROME1/);
    assert.doesNotMatch(section, /overbooking/i);
    assert.doesNotMatch(section, /channel manager/i);
    assert.doesNotMatch(section, /Stripe|Adyen|Xero|QuickBooks/);
  });
});

describe("PMS-SET5 integrations honesty and redirect", () => {
  it("keeps POS charge-to-room Live and other connectors Foundation, and redirects the alias", () => {
    const rows = integrationHonestyRows({
      posChargeToRoomLive: true,
      paymentConnected: false,
      accountingConnected: false,
      apiConnected: false,
      thirdPartyConnected: false,
      dualHubResolved: true,
    });
    assert.equal(rows[0]?.status, "live");
    assert.match(rows[0]?.note ?? "", /Charge to room is live/);
    assert.equal(SET5_POS_LIVE_NOTE.includes("Charge to room is live"), true);
    assert.equal(evaluateIntegrations(completeSet5Activate()).readiness, "warning");

    const route = readFileSync(new URL("../../../routes/restaurant/pms/integrations.tsx", import.meta.url), "utf8");
    assert.match(route, /SET5_INTEGRATIONS_HREF/);
    assert.match(route, /href: SET5_INTEGRATIONS_HREF/);
    assert.doesNotMatch(route, /PmsIntegrationsWorkspace/);
    assert.doesNotMatch(route, /payment gateway live/i);
  });
});

describe("PMS-SET5 WhatsApp stays future and no ESP/IAM", () => {
  it("locks WhatsApp disabled and does not invent a send pipeline or IAM", () => {
    assert.equal(whatsappStaysDisabled(emptyNotificationChannels()), true);
    assert.equal(whatsappStaysDisabled({ whatsapp: false }), true);
    assert.equal(SET5_WHATSAPP_FUTURE.includes("future"), true);

    const fns = readFileSync(new URL("./pms-set5-depts-guestsvc.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /whatsapp: false/);
    assert.doesNotMatch(fns, /sendEmail|sendSms|resend|twilio|queue/i);
    assert.doesNotMatch(fns, /IAM|identity provider|SSO/i);

    const contract = readFileSync(new URL("./pms-set5-depts-guestsvc.ts", import.meta.url), "utf8");
    assert.match(contract, /not an ESP/i);
    assert.doesNotMatch(contract, /mailgun|postmark/i);
  });
});

describe("PMS-SET5 no second Activate and SET6 / FO-CHROME1 / overbooking out", () => {
  it("does not add pms_set5_live or later-wave forms", () => {
    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_set5_live/);
    assert.match(activate, /SET5_AUDIT_ACTIONS/);

    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(chrome, /FO-CHROME1/);
    assert.equal(SET5_AUDIT_DEPARTMENT, "pms_set5_department_updated");
    assert.equal(SET5_AUDIT_WORK_CENTER, "pms_set5_work_center_updated");
    assert.equal(SET5_AUDIT_ROUTING, "pms_set5_routing_updated");
    assert.equal(SET5_AUDIT_REQUEST_TYPE, "pms_set5_request_type_updated");
    assert.equal(SET5_AUDIT_CHANNELS, "pms_set5_notification_channels_updated");
    assert.equal(SET5_AUDIT_TEMPLATE, "pms_set5_notification_template_updated");
    assert.equal(SET5_AUDIT_EVENT_RULES, "pms_set5_notification_events_updated");
    assert.equal(SET5_AUDIT_ADMIN, "pms_set5_admin_controls_updated");
    assert.equal(SET5_AUDIT_SESSION, "pms_set5_session_access_updated");
    assert.equal(SET5_AUDIT_RETENTION, "pms_set5_audit_retention_updated");
  });
});

describe("PMS-SET5 migration 0051 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes and does not apply live", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0051_pms_set5_depts_guestsvc_admin.sql");
    const supabase = join(here, "../../../../supabase/migrations/0051_pms_set5_depts_guestsvc_admin.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /pms_departments/);
    assert.match(drizzleSql, /pms_work_centers/);
    assert.match(drizzleSql, /pms_routing_defaults/);
    assert.match(drizzleSql, /pms_guest_request_types/);
    assert.match(drizzleSql, /pms_notification_channels/);
    assert.match(drizzleSql, /pms_notification_templates/);
    assert.match(drizzleSql, /pms_notification_event_rules/);
    assert.match(drizzleSql, /pms_admin_controls/);
    assert.match(drizzleSql, /pms_session_access_posture/);
    assert.match(drizzleSql, /pms_audit_retention_posture/);
    assert.doesNotMatch(drizzleSql, /SECURITY DEFINER/i);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_departments/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_guest_request_types/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.pms_notification_templates/);
    assert.match(drizzleSql, /WhatsApp stays future\/disabled/);
    assert.doesNotMatch(drizzleSql, /channel IN \('email', 'sms', 'in_app', 'whatsapp'\)/);
    assert.doesNotMatch(drizzleSql, /overbooking/i);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
    assert.match(drizzleSql, /APPLY HELD/i);
  });
});
