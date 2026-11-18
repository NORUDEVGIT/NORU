/**
 * Settings setup progress. Guidance only: it never gates the PMS shell
 * (that is approval + pms_set1_live) and it is never persisted.
 *
 * Every status is recomputed from live facts. Seeded catalogue rows
 * (canonical amenities, default profile types, guest fields, service types,
 * ID types) are not facts here, so they cannot mark an area as started.
 * Checks only pass once the owner has started that area.
 */
import type { PropertySetupCardId } from "./pms-property-setup-card1.ts";

export const SETUP_PROGRESS_STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "needs_attention",
] as const;
export type SetupProgressStatus = (typeof SETUP_PROGRESS_STATUSES)[number];

export function setupProgressStatusLabel(status: SetupProgressStatus): string {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In progress";
  if (status === "needs_attention") return "Needs attention";
  return "Not started";
}

export type SetupCheck = {
  id: string;
  label: string;
  pass: boolean;
  /** Required checks are the only ones that count toward the percentage. */
  required: boolean;
};

export type SetupAreaProgress = {
  cardId: PropertySetupCardId;
  status: SetupProgressStatus;
  /** True when the area has at least one required check right now. */
  required: boolean;
  checks: SetupCheck[];
  issues: string[];
};

export type SetupProgressReport = {
  areas: SetupAreaProgress[];
  requiredPassed: number;
  requiredTotal: number;
  percent: number;
};

export type SetupProgressFacts = {
  card1: {
    /** Property & Business has been saved through the setup flow at least once. */
    saved: boolean;
    steps: { id: string; title: string; complete: boolean }[];
    currencyCode: string;
    vatRegistered: boolean;
  };
  rooms: {
    roomTypes: number;
    activeRoomTypes: number;
    rooms: number;
    activeRooms: number;
    /** Validation problems on the active room types and rooms that exist. */
    configurationIssues: string[];
  };
  financial: {
    ratePlans: number;
    activeRatePlans: number;
    ratePlansInOtherCurrency: number;
    paymentMethods: number;
    activePaymentMethods: number;
    taxes: number;
    activeTaxes: number;
  };
  guest: {
    /** Active ID documents the owner assigned to at least one profile type. */
    assignedIdDocuments: number;
    publishedAgreement: boolean;
  };
  organization: {
    departments: number;
    activeDepartments: number;
  };
  connectivity: {
    integrations: number;
    enabled: number;
    enabledWithErrors: number;
  };
  security: {
    hotelRoles: number;
    nonOwnerStaff: number;
    blockers: string[];
  };
};

export const ROOMS_MISSING_TYPE = "Add at least one room type.";
export const ROOMS_MISSING_ROOM = "Add at least one physical room.";

function check(id: string, label: string, started: boolean, pass: boolean, required = true): SetupCheck {
  return { id, label, pass: started && pass, required };
}

function area(
  cardId: PropertySetupCardId,
  started: boolean,
  checks: SetupCheck[],
  issues: string[] = [],
): SetupAreaProgress {
  let status: SetupProgressStatus = "not_started";
  if (started) {
    if (issues.length > 0) status = "needs_attention";
    else if (checks.length > 0 && checks.every((row) => row.pass)) status = "complete";
    else status = "in_progress";
  }
  return {
    cardId,
    status,
    required: checks.some((row) => row.required),
    checks,
    issues: started ? issues : [] };
}

export function buildSetupProgressReport(facts: SetupProgressFacts): SetupProgressReport {
  const { card1, rooms, financial, guest, organization, connectivity, security } = facts;

  const propertyBusiness = area(
    "property-business",
    card1.saved,
    card1.steps.map((step) => check(`card1-${step.id}`, step.title, card1.saved, step.complete)),
  );

  const roomsStarted = rooms.roomTypes > 0 || rooms.rooms > 0;
  const roomsOperations = area(
    "rooms-inventory",
    roomsStarted,
    [
      check("rooms-type", "At least one active room type", roomsStarted, rooms.activeRoomTypes > 0),
      check("rooms-room", "At least one active physical room", roomsStarted, rooms.activeRooms > 0),
      check(
        "rooms-valid",
        "Room types, beds and room locations are valid",
        roomsStarted,
        rooms.activeRoomTypes > 0 && rooms.activeRooms > 0 && rooms.configurationIssues.length === 0,
      ),
    ],
    rooms.configurationIssues,
  );

  const financialStarted =
    financial.ratePlans > 0 || financial.paymentMethods > 0 || financial.taxes > 0;
  const financialChecks = [
    check("financial-rate", "At least one active rate plan", financialStarted, financial.activeRatePlans > 0),
    check(
      "financial-payment",
      "At least one active payment method",
      financialStarted,
      financial.activePaymentMethods > 0,
    ),
    check(
      "financial-currency",
      "Property currency confirmed in Property & Business",
      financialStarted,
      card1.saved && card1.currencyCode.trim().length > 0,
    ),
  ];
  if (card1.vatRegistered) {
    financialChecks.push(
      check("financial-tax", "At least one active tax for a VAT-registered property", financialStarted, financial.activeTaxes > 0),
    );
  }
  const financialIssues =
    financial.ratePlansInOtherCurrency > 0
      ? [
          `${financial.ratePlansInOtherCurrency} active rate ${
            financial.ratePlansInOtherCurrency === 1 ? "plan uses" : "plans use"
          } a currency other than ${card1.currencyCode || "the property currency"}.`,
        ]
      : [];
  const financialCommercial = area("rates-guest-rules", financialStarted, financialChecks, financialIssues);

  const guestStarted = guest.assignedIdDocuments > 0 || guest.publishedAgreement;
  const guestServices = area("housekeeping-maintenance", guestStarted, [
    check(
      "guest-id-documents",
      "ID documents assigned to guest profile types",
      guestStarted,
      guest.assignedIdDocuments > 0,
    ),
    check("guest-agreement", "Guest registration agreement published", guestStarted, guest.publishedAgreement),
  ]);

  const organizationStarted = organization.departments > 0;
  const organizationFacilities = area("departments-services", organizationStarted, [
    check(
      "organization-department",
      "At least one active department",
      organizationStarted,
      organization.activeDepartments > 0,
      false,
    ),
  ]);

  const connectivityStarted = connectivity.integrations > 0;
  const integrationInUse = connectivity.enabled > 0;
  const connectivityDistribution = area(
    "notifications-security",
    connectivityStarted,
    [
      check(
        "connectivity-enabled",
        "Enabled integrations are connected without errors",
        connectivityStarted,
        integrationInUse && connectivity.enabledWithErrors === 0,
        integrationInUse,
      ),
    ],
    connectivity.enabledWithErrors > 0
      ? [
          `${connectivity.enabledWithErrors} enabled ${
            connectivity.enabledWithErrors === 1 ? "integration reports" : "integrations report"
          } an error.`,
        ]
      : [],
  );

  const securityStarted = security.hotelRoles > 0 || security.nonOwnerStaff > 0;
  const securityRequired = security.nonOwnerStaff > 0;
  const securityData = area(
    "sales-distribution",
    securityStarted,
    [
      check(
        "security-roles",
        "Hotel roles and permissions are valid for your staff",
        securityStarted,
        security.blockers.length === 0,
        securityRequired,
      ),
    ],
    securityRequired ? security.blockers : [],
  );

  const domainAreas = [
    propertyBusiness,
    roomsOperations,
    financialCommercial,
    guestServices,
    organizationFacilities,
    connectivityDistribution,
    securityData,
  ];
  const required = domainAreas.flatMap((row) => row.checks.filter((item) => item.required));
  const requiredPassed = required.filter((row) => row.pass).length;
  const requiredTotal = required.length;

  const attention = domainAreas.filter((row) => row.status === "needs_attention" && row.required);
  const anyStarted = domainAreas.some((row) => row.status !== "not_started");
  const systemStatus: SetupProgressStatus =
    attention.length > 0
      ? "needs_attention"
      : requiredTotal > 0 && requiredPassed === requiredTotal
        ? "complete"
        : anyStarted
          ? "in_progress"
          : "not_started";
  const systemGoLive: SetupAreaProgress = {
    cardId: "payments-administration",
    status: systemStatus,
    required: false,
    checks: [],
    issues: attention.flatMap((row) => row.issues) };

  return {
    areas: [...domainAreas, systemGoLive],
    requiredPassed,
    requiredTotal,
    percent: requiredTotal > 0 ? Math.round((requiredPassed / requiredTotal) * 100) : 0 };
}
