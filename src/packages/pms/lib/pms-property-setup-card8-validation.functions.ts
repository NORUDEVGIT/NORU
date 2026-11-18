/**
 * Card 8 System Validation — read-only live aggregation.
 *
 * This endpoint performs no insert/update/delete. It reloads Card 1–7 source
 * data and delegates every readiness decision to the existing domain modules.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPmsPackage } from "./pms-package.server";
import type { Card8ValidationCategory } from "./pms-property-setup-card8-validation";
import {
  adaptCard8DomainSlices,
  buildCard8ValidationReport,
  failedCard8Adapter,
  type Card8AdapterResult,
  type Card8DomainSlice,
} from "./pms-property-setup-card8-validation.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

function incomplete(label: string, complete: boolean): string[] {
  return complete ? [] : [`${label} is incomplete.`];
}

async function runCard1(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [
    { loadCard1ValidationSnapshot },
    { CARD1_STEPS, card1StepComplete, card1StructureWarnings, card1TaxWarnings },
  ] = await Promise.all([
    import("./pms-property-setup-card1.functions"),
    import("./pms-property-setup-card1"),
  ]);
  const { snapshot, set2 } = await loadCard1ValidationSnapshot(db, restaurantId);
  const slices: Card8DomainSlice[] = CARD1_STEPS.map((step) => ({
    id: step.id,
    label: step.title,
    blockers: incomplete(step.title, card1StepComplete(step.id, snapshot.draft, set2)),
  }));
  slices.push(
    {
      id: "tax-warnings",
      label: "Tax Documents",
      warnings: card1TaxWarnings(snapshot.draft),
    },
    {
      id: "structure-warnings",
      label: "Property Structure",
      warnings: card1StructureWarnings(snapshot.draft, set2),
    },
  );
  return adaptCard8DomainSlices(1, "property", slices);
}

async function runCard2(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [
    { loadCard2RoomTypesReadiness },
    { loadAmenitiesReadinessInput },
    { evaluateAmenitiesReadiness },
    { loadCard2HousekeepingSnapshot },
    { evaluateCard2HousekeepingReadiness },
    { loadCard2InventoryValidation },
    { loadCard2MaintenanceValidation },
    { loadRatesCard2Snapshot },
    { evaluateRatesCard2Readiness },
  ] = await Promise.all([
    import("./rooms.functions"),
    import("./rooms-amenities.functions"),
    import("./rooms-card2-amenities.server"),
    import("./housekeeping-card2.functions"),
    import("./housekeeping-card2.server"),
    import("./inventory-rules.functions"),
    import("./maintenance.functions"),
    import("./rates-card2.functions"),
    import("./rates-card2.server"),
  ]);
  const [
    roomTypes,
    amenitiesInput,
    housekeepingSnapshot,
    inventory,
    maintenance,
    ratesSnapshot,
    { loadMealsCard3Snapshot },
    { evaluateMealsCard3Readiness },
    accessibilityWarnings,
    connectingWarnings,
  ] = await Promise.all([
    loadCard2RoomTypesReadiness(db, restaurantId),
    loadAmenitiesReadinessInput(db, restaurantId),
    loadCard2HousekeepingSnapshot(db, restaurantId, false),
    loadCard2InventoryValidation(db, restaurantId),
    loadCard2MaintenanceValidation(db, restaurantId),
    loadRatesCard2Snapshot(db, restaurantId),
    import("./meals-card3.functions"),
    import("./meals-card3.server"),
    loadAccessibilityValidationWarnings(db, restaurantId),
    loadConnectingValidationWarnings(db, restaurantId),
  ]);
  const amenities = evaluateAmenitiesReadiness(amenitiesInput);
  const housekeeping = evaluateCard2HousekeepingReadiness(housekeepingSnapshot);
  const rates = evaluateRatesCard2Readiness(ratesSnapshot);
  const meals = evaluateMealsCard3Readiness(await loadMealsCard3Snapshot(db, restaurantId));
  const [{ CARD2_RATES_HREF, card2StepHref }] = await Promise.all([
    import("./pms-property-setup-card2"),
  ]);
  return adaptCard8DomainSlices(2, "rooms", [
    { id: "room-types", label: "Room Types & Rooms", blockers: roomTypes.blockers },
    {
      id: "rates-pricing",
      label: "Rate & Pricing",
      blockers: rates.blockers,
      href: CARD2_RATES_HREF,
    },
    { id: "amenities", label: "Amenities", blockers: amenities.blockers },
    {
      id: "meal-plans-packages",
      label: "Meal Plans & Packages",
      blockers: meals.blockers,
      href: CARD2_RATES_HREF,
    },
    {
      id: "housekeeping",
      label: "Housekeeping",
      blockers: housekeeping.blockers,
      warnings: housekeeping.warnings,
    },
    {
      id: "inventory-rules",
      label: "Inventory Rules",
      blockers: inventory.blockers,
      href: card2StepHref("inventory-rules"),
    },
    { id: "accessibility", label: "Accessibility", warnings: accessibilityWarnings },
    { id: "connecting-rooms", label: "Connecting rooms", warnings: connectingWarnings },
    { id: "maintenance", label: "Maintenance", blockers: maintenance.blockers },
  ]);
}

/** Warnings only: accessibility configuration never blocks readiness. */
async function loadAccessibilityValidationWarnings(
  db: DbClient,
  restaurantId: string,
): Promise<string[]> {
  const [{ loadAccessibilityReview }, { accessibilityValidationWarnings }] = await Promise.all([
    import("./room-accessibility.functions"),
    import("./room-accessibility"),
  ]);
  return accessibilityValidationWarnings(await loadAccessibilityReview(db, restaurantId));
}

/** Warnings only: connecting room configuration never blocks readiness. */
async function loadConnectingValidationWarnings(db: DbClient, restaurantId: string): Promise<string[]> {
  const [{ loadConnectingReview }, { connectingValidationWarnings }] = await Promise.all([
    import("./room-connections.functions"),
    import("./room-connections"),
  ]);
  return connectingValidationWarnings(await loadConnectingReview(db, restaurantId));
}

async function runCard3(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [
    { loadCurrencyCard3Snapshot },
    { evaluateCurrencyCard3Readiness },
    { loadTaxesCard3Snapshot },
    { evaluateTaxesCard3Readiness },
    { loadPaymentsCard3Snapshot },
    { evaluatePaymentsCard3Readiness },
    { loadBillingCard3Snapshot },
    { evaluateBillingCard3Readiness },
    { loadCorporateCard3Snapshot },
    { evaluateCorporateCard3Readiness },
    { loadCommercialCard3Snapshot },
    { evaluateCommercialCard3Readiness },
  ] = await Promise.all([
    import("./currency-card3.functions"),
    import("./currency-card3.server"),
    import("./taxes-card3.functions"),
    import("./taxes-card3.server"),
    import("./payments-card3.functions"),
    import("./payments-card3.server"),
    import("./billing-card3.functions"),
    import("./billing-card3.server"),
    import("./corporate-card3.functions"),
    import("./corporate-card3.server"),
    import("./commercial-card3.functions"),
    import("./commercial-card3.server"),
  ]);
  const snapshots = await Promise.all([
    loadCurrencyCard3Snapshot(db, restaurantId),
    loadTaxesCard3Snapshot(db, restaurantId),
    loadPaymentsCard3Snapshot(db, restaurantId),
    loadBillingCard3Snapshot(db, restaurantId),
    loadCorporateCard3Snapshot(db, restaurantId),
    loadCommercialCard3Snapshot(db, restaurantId),
  ]);
  const readiness = [
    evaluateCurrencyCard3Readiness(snapshots[0]),
    evaluateTaxesCard3Readiness(snapshots[1]),
    evaluatePaymentsCard3Readiness(snapshots[2]),
    evaluateBillingCard3Readiness(snapshots[3]),
    evaluateCorporateCard3Readiness(snapshots[4]),
    evaluateCommercialCard3Readiness(snapshots[5]),
  ];
  const labels = [
    "Currency",
    "Taxes",
    "Payments",
    "Billing",
    "Corporate",
    "Commercial",
  ];
  return adaptCard8DomainSlices(
    3,
    "financial",
    readiness.map((slice, index) => ({
      id: labels[index]!.toLowerCase(),
      label: labels[index]!,
      blockers: slice.blockers,
      warnings: "warnings" in slice && Array.isArray(slice.warnings) ? slice.warnings : [],
    })),
  );
}

async function runCard4(
  db: DbClient,
  restaurantId: string,
  userId: string,
): Promise<Card8AdapterResult> {
  const [
    profileFns,
    requiredFns,
    identityFns,
    preferenceFns,
    companyFns,
    groupFns,
    travelAgencyFns,
    categoryFns,
    typeFns,
    pricingFns,
    assignmentFns,
    slaFns,
    availabilityFns,
    channelFns,
    templateFns,
    eventFns,
    ruleFns,
    senderFns,
    defaultFns,
    profileRules,
    requiredRules,
    identityRules,
    preferenceRules,
    companyRules,
    groupRules,
    travelAgencyRules,
    categoryRules,
    typeRules,
    pricingRules,
    assignmentRules,
    slaRules,
    availabilityRules,
    channelRules,
    templateRules,
    eventRules,
    ruleRules,
    senderRules,
    defaultRules,
    card4,
  ] = await Promise.all([
    import("./profile-types-card4.functions"),
    import("./required-fields-card4.functions"),
    import("./identity-documents-card4.functions"),
    import("./preferences-card4.functions"),
    import("./company-business-card4.functions"),
    import("./group-types-card4.functions"),
    import("./travel-agency-types-card4.functions"),
    import("./service-categories-card4.functions"),
    import("./service-types-card4.functions"),
    import("./service-pricing-card4.functions"),
    import("./service-department-assignment-card4.functions"),
    import("./service-sla-rules-card4.functions"),
    import("./service-availability-card4.functions"),
    import("./communication-channels-card4.functions"),
    import("./communication-templates-card4.functions"),
    import("./notification-events-card4.functions"),
    import("./automation-rules-card4.functions"),
    import("./sender-settings-card4.functions"),
    import("./communication-defaults-card4.functions"),
    import("./profile-types-card4.server"),
    import("./required-fields-card4.server"),
    import("./identity-documents-card4.server"),
    import("./preferences-card4.server"),
    import("./company-business-card4.server"),
    import("./group-types-card4.server"),
    import("./travel-agency-types-card4.server"),
    import("./service-categories-card4.server"),
    import("./service-types-card4.server"),
    import("./service-pricing-card4.server"),
    import("./service-department-assignment-card4.server"),
    import("./service-sla-rules-card4.server"),
    import("./service-availability-card4.server"),
    import("./communication-channels-card4.server"),
    import("./communication-templates-card4.server"),
    import("./notification-events-card4.server"),
    import("./automation-rules-card4.server"),
    import("./sender-settings-card4.server"),
    import("./communication-defaults-card4.server"),
    import("./pms-property-setup-card4"),
  ]);
  async function loadOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await load();
    } catch {
      return fallback;
    }
  }
  const [
    profile,
    required,
    identity,
    preferences,
    company,
    groupTypes,
    travelAgencyTypes,
    categories,
    types,
    pricing,
    assignments,
    sla,
    availability,
    channels,
    templates,
    events,
    automation,
    sender,
    defaults,
  ] = await Promise.all([
    loadOrEmpty(
      () => profileFns.loadProfileTypesCard4Snapshot(db, restaurantId, userId, false, false),
      { types: [] },
    ),
    loadOrEmpty(
      () => requiredFns.loadRequiredFieldsCard4Snapshot(db, restaurantId, userId, false, false),
      { fields: [] },
    ),
    loadOrEmpty(
      () => identityFns.loadIdentityDocumentsCard4Snapshot(db, restaurantId, userId, false, false),
      { documentTypes: [] },
    ),
    loadOrEmpty(
      () => preferenceFns.loadPreferencesCard4Snapshot(db, restaurantId, userId, false, false),
      { categories: [], types: [] },
    ),
    loadOrEmpty(
      () => companyFns.loadCompanyBusinessCard4Snapshot(db, restaurantId, userId, false, false),
      {
        types: [],
        settings: {
          enabled: false,
          defaultBusinessTypeId: null,
          autoApproval: false,
          defaultInvalid: false,
        },
      },
    ),
    loadOrEmpty(
      () => groupFns.loadGroupTypesCard4Snapshot(db, restaurantId, userId, false, false),
      { types: [] },
    ),
    loadOrEmpty(
      () =>
        travelAgencyFns.loadTravelAgencyTypesCard4Snapshot(db, restaurantId, userId, false, false),
      { types: [] },
    ),
    loadOrEmpty(
      () => categoryFns.loadServiceCategoriesCard4Snapshot(db, restaurantId, userId, false, false),
      { categories: [] },
    ),
    loadOrEmpty(() => typeFns.loadServiceTypesCard4Snapshot(db, restaurantId, userId), {
      categories: [],
      types: [],
    }),
    loadOrEmpty(() => pricingFns.loadServicePricingCard4Snapshot(db, restaurantId), {
      pricing: [],
      serviceTypes: [],
    }),
    loadOrEmpty(
      () => assignmentFns.loadServiceDepartmentAssignmentsCard4Snapshot(db, restaurantId),
      { assignments: [], serviceTypes: [], departments: [] },
    ),
    loadOrEmpty(() => slaFns.loadServiceSlaRulesCard4Snapshot(db, restaurantId), {
      rules: [],
      serviceTypes: [],
    }),
    loadOrEmpty(() => availabilityFns.loadServiceAvailabilityCard4Snapshot(db, restaurantId), {
      availability: [],
      serviceTypes: [],
    }),
    loadOrEmpty(() => channelFns.loadPmsCard4CommunicationChannelsSnapshot(db, restaurantId), {
      channels: [],
    }),
    loadOrEmpty(() => templateFns.loadCommunicationTemplatesCard4Snapshot(db, restaurantId), {
      templates: [],
    }),
    loadOrEmpty(() => eventFns.loadPmsCard4NotificationEventsSnapshot(db, restaurantId), {
      events: [],
    }),
    loadOrEmpty(() => ruleFns.loadAutomationRulesCard4Snapshot(db, restaurantId), { rules: [] }),
    loadOrEmpty(() => senderFns.loadPmsCard4SenderSettingsSnapshot(db, restaurantId), {
      settings: [],
    }),
    loadOrEmpty(() => defaultFns.loadPmsCard4CommunicationDefaultsSnapshot(db, restaurantId), {
      defaults: null,
      channels: [],
      senders: [],
    }),
  ]);
  const profileTypesConfigured = profileRules.profileTypeConfigured(profile.types);
  const requiredFieldsConfigured = requiredRules.guestFieldsConfigured(required.fields);
  const identityDocumentsConfigured = identityRules.identityDocumentTypesConfigured(
    identity.documentTypes,
  );
  const preferencesConfigured = preferenceRules.preferencesConfigured(
    preferences.categories,
    preferences.types,
  );
  const companyBusinessConfigured = companyRules.companyBusinessConfigured(
    company.types,
    company.settings,
  );
  const groupTypesConfigured = groupRules.groupTypesConfigured(groupTypes.types);
  const travelAgencyTypesConfigured = travelAgencyRules.travelAgencyTypesConfigured(
    travelAgencyTypes.types,
  );
  const gstConfigured = [
    categoryRules.serviceCategoriesConfigured(categories.categories),
    typeRules.serviceTypesConfigured(types.categories, types.types),
    pricingRules.servicePricingConfigured(pricing.pricing, pricing.serviceTypes),
    assignmentRules.serviceDepartmentAssignmentsConfigured(
      assignments.assignments,
      assignments.serviceTypes,
      assignments.departments,
    ),
    slaRules.serviceSlaRulesConfigured(sla.rules, sla.serviceTypes),
    availabilityRules.serviceAvailabilityConfigured(
      availability.availability,
      availability.serviceTypes,
    ),
  ] as const;
  const channelsConfigured = channelRules.communicationChannelsConfigured(channels.channels);
  const templatesConfigured = templateRules.communicationTemplatesConfigured(templates.templates);
  const eventsConfigured = eventRules.notificationEventsConfigured(events.events);
  const rulesConfigured = ruleRules.automationRulesConfigured(automation.rules);
  const senderConfigured = senderRules.senderSettingsConfigured(sender.settings, channels.channels);
  const defaultsConfigured = defaultRules.communicationDefaultsConfigured(
    defaults.defaults,
    channels.channels,
    defaults.senders,
  );
  const slices: Card8DomainSlice[] = card4.CARD4_STEPS.map((step) => ({
    id: step.id,
    label: step.title,
    blockers: incomplete(
      step.title,
      card4.evaluateCard4StepStatus(
        step.id,
        undefined,
        profileTypesConfigured,
        requiredFieldsConfigured,
        identityDocumentsConfigured,
        preferencesConfigured,
        companyBusinessConfigured,
        groupTypesConfigured,
        travelAgencyTypesConfigured,
      ) === "complete",
    ),
  }));
  slices.push(
    ...card4.CARD4_GST_STEPS.map((step) => ({
      id: step.id,
      label: step.title,
      blockers: incomplete(
        step.title,
        card4.evaluateGstStepStatus(
          step.id,
          gstConfigured[0],
          gstConfigured[1],
          gstConfigured[2],
          gstConfigured[3],
          gstConfigured[4],
          gstConfigured[5],
        ) === "complete",
      ),
    })),
    ...card4.CARD4_NOTIFICATION_STEPS.map((step) => ({
      id: step.id,
      label: step.title,
      blockers: incomplete(
        step.title,
        card4.evaluateNotificationStepStatus(
          step.id,
          channelsConfigured,
          templatesConfigured,
          eventsConfigured,
          rulesConfigured,
          senderConfigured,
          defaultsConfigured,
        ) === "complete",
      ),
    })),
  );
  return adaptCard8DomainSlices(4, "guest", slices);
}

async function runCard5(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [{ loadCard5ValidationSnapshots }, { buildCard5ValidationReport }] = await Promise.all([
    import("./card5-readiness.functions"),
    import("./card5-readiness.server"),
  ]);
  const snapshots = await loadCard5ValidationSnapshots(db, restaurantId);
  const report = buildCard5ValidationReport(
    snapshots.departments,
    snapshots.facilities,
    snapshots.sales,
  );
  return adaptCard8DomainSlices(5, "organization", [
    { id: "departments", label: "Departments", ...report.departments },
    { id: "facilities", label: "Outlets & Facilities", ...report.facilities },
    { id: "sales", label: "Sales & Events", ...report.sales },
    { id: "integrity", label: "Integrity", ...report.integrity },
  ]);
}

async function runCard6(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [{ loadCard6IntegrationsSnapshot }, { summarizeIntegrations }] = await Promise.all([
    import("./integrations-card6.functions"),
    import("./integrations-card6.server"),
  ]);
  const snapshot = await loadCard6IntegrationsSnapshot(db, restaurantId);
  const summary = summarizeIntegrations(snapshot.integrations);
  const warnings: string[] = [];
  if (summary.total === 0) warnings.push("No integration catalogue entries are configured.");
  if (summary.errors > 0) {
    warnings.push(
      `${summary.errors} integration${summary.errors === 1 ? "" : "s"} currently report setup errors.`,
    );
  }
  return adaptCard8DomainSlices(6, "connectivity", [
    { id: "integrations", label: "Integrations", warnings },
  ]);
}

async function runCard7(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [
    { loadCard7ValidationSnapshot },
    { buildCard7ValidationReport },
    { STAFF_ACCESS_HREF },
  ] = await Promise.all([
    import("./card7-readiness.functions"),
    import("./card7-readiness.server"),
    import("./pms-property-setup-card5"),
  ]);
  const snapshot = await loadCard7ValidationSnapshot(db, restaurantId);
  const report = buildCard7ValidationReport(snapshot);
  return adaptCard8DomainSlices(7, "security_data", [
    {
      id: "security",
      label: "Security & Roles",
      blockers: report.security.blockers,
      warnings: report.security.warnings,
      href: STAFF_ACCESS_HREF,
    },
    { id: "audit", label: "Audit", blockers: report.audit.blockers, warnings: report.audit.warnings },
    {
      id: "reports",
      label: "Reports",
      blockers: report.reports.blockers,
      warnings: report.reports.warnings,
    },
    {
      id: "import",
      label: "Data Import",
      blockers: report.importDomain.blockers,
      warnings: report.importDomain.warnings,
    },
    {
      id: "integrity",
      label: "Integrity",
      blockers: report.integrity.blockers,
      warnings: report.integrity.warnings,
    },
  ]);
}

async function safely(
  cardNumber: Card8AdapterResult["cardNumber"],
  category: Card8ValidationCategory,
  run: () => Promise<Card8AdapterResult>,
): Promise<Card8AdapterResult> {
  try {
    return await run();
  } catch (error) {
    return failedCard8Adapter(cardNumber, category, error);
  }
}

/** Shared read-only loader for consumers such as Phase 3 Go-Live readiness. */
export async function loadCard8ValidationReport(
  db: DbClient,
  restaurantId: string,
  userId: string,
) {
  const results = await Promise.all([
    safely(1, "property", () => runCard1(db, restaurantId)),
    safely(2, "rooms", () => runCard2(db, restaurantId)),
    safely(3, "financial", () => runCard3(db, restaurantId)),
    safely(4, "guest", () => runCard4(db, restaurantId, userId)),
    safely(5, "organization", () => runCard5(db, restaurantId)),
    safely(6, "connectivity", () => runCard6(db, restaurantId)),
    safely(7, "security_data", () => runCard7(db, restaurantId)),
  ]);
  return buildCard8ValidationReport(results);
}

export const getCard8Validation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    return loadCard8ValidationReport(db, data.restaurantId, context.userId);
  });
