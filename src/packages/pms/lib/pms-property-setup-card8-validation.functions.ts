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
  ] = await Promise.all([
    import("./rooms.functions"),
    import("./rooms-amenities.functions"),
    import("./rooms-card2-amenities.server"),
    import("./housekeeping-card2.functions"),
    import("./housekeeping-card2.server"),
    import("./inventory-rules.functions"),
    import("./maintenance.functions"),
  ]);
  const [roomTypes, amenitiesInput, housekeepingSnapshot, inventory, maintenance] =
    await Promise.all([
      loadCard2RoomTypesReadiness(db, restaurantId),
      loadAmenitiesReadinessInput(db, restaurantId),
      loadCard2HousekeepingSnapshot(db, restaurantId, false),
      loadCard2InventoryValidation(db, restaurantId),
      loadCard2MaintenanceValidation(db, restaurantId),
    ]);
  const amenities = evaluateAmenitiesReadiness(amenitiesInput);
  const housekeeping = evaluateCard2HousekeepingReadiness(housekeepingSnapshot);
  return adaptCard8DomainSlices(2, "rooms", [
    { id: "room-types", label: "Room Types & Rooms", blockers: roomTypes.blockers },
    { id: "amenities", label: "Amenities", blockers: amenities.blockers },
    {
      id: "housekeeping",
      label: "Housekeeping",
      blockers: housekeeping.blockers,
      warnings: housekeeping.warnings,
    },
    { id: "inventory-rules", label: "Inventory Rules", blockers: inventory.blockers },
    { id: "maintenance", label: "Maintenance", blockers: maintenance.blockers },
  ]);
}

async function runCard3(db: DbClient, restaurantId: string): Promise<Card8AdapterResult> {
  const [
    { loadCurrencyCard3Snapshot },
    { evaluateCurrencyCard3Readiness },
    { loadTaxesCard3Snapshot },
    { evaluateTaxesCard3Readiness },
    { loadRatesCard3Snapshot },
    { evaluateRatesCard3Readiness },
    { loadMealsCard3Snapshot },
    { evaluateMealsCard3Readiness },
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
    import("./rates-card3.functions"),
    import("./rates-card3.server"),
    import("./meals-card3.functions"),
    import("./meals-card3.server"),
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
    loadRatesCard3Snapshot(db, restaurantId),
    loadMealsCard3Snapshot(db, restaurantId),
    loadPaymentsCard3Snapshot(db, restaurantId),
    loadBillingCard3Snapshot(db, restaurantId),
    loadCorporateCard3Snapshot(db, restaurantId),
    loadCommercialCard3Snapshot(db, restaurantId),
  ]);
  const readiness = [
    evaluateCurrencyCard3Readiness(snapshots[0]),
    evaluateTaxesCard3Readiness(snapshots[1]),
    evaluateRatesCard3Readiness(snapshots[2]),
    evaluateMealsCard3Readiness(snapshots[3]),
    evaluatePaymentsCard3Readiness(snapshots[4]),
    evaluateBillingCard3Readiness(snapshots[5]),
    evaluateCorporateCard3Readiness(snapshots[6]),
    evaluateCommercialCard3Readiness(snapshots[7]),
  ];
  const labels = [
    "Currency",
    "Taxes",
    "Rates",
    "Meals",
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
    categoryFns,
    typeFns,
    pricingFns,
    assignmentFns,
    slaFns,
    availabilityFns,
    channelFns,
    profileRules,
    requiredRules,
    identityRules,
    preferenceRules,
    companyRules,
    categoryRules,
    typeRules,
    pricingRules,
    assignmentRules,
    slaRules,
    availabilityRules,
    channelRules,
    card4,
  ] = await Promise.all([
    import("./profile-types-card4.functions"),
    import("./required-fields-card4.functions"),
    import("./identity-documents-card4.functions"),
    import("./preferences-card4.functions"),
    import("./company-business-card4.functions"),
    import("./service-categories-card4.functions"),
    import("./service-types-card4.functions"),
    import("./service-pricing-card4.functions"),
    import("./service-department-assignment-card4.functions"),
    import("./service-sla-rules-card4.functions"),
    import("./service-availability-card4.functions"),
    import("./communication-channels-card4.functions"),
    import("./profile-types-card4.server"),
    import("./required-fields-card4.server"),
    import("./identity-documents-card4.server"),
    import("./preferences-card4.server"),
    import("./company-business-card4.server"),
    import("./service-categories-card4.server"),
    import("./service-types-card4.server"),
    import("./service-pricing-card4.server"),
    import("./service-department-assignment-card4.server"),
    import("./service-sla-rules-card4.server"),
    import("./service-availability-card4.server"),
    import("./communication-channels-card4.server"),
    import("./pms-property-setup-card4"),
  ]);
  const [
    profile,
    required,
    identity,
    preferences,
    company,
    categories,
    types,
    pricing,
    assignments,
    sla,
    availability,
    channels,
  ] = await Promise.all([
    profileFns.loadProfileTypesCard4Snapshot(db, restaurantId, userId, false, false),
    requiredFns.loadRequiredFieldsCard4Snapshot(db, restaurantId, userId, false, false),
    identityFns.loadIdentityDocumentsCard4Snapshot(db, restaurantId, userId, false, false),
    preferenceFns.loadPreferencesCard4Snapshot(db, restaurantId, userId, false, false),
    companyFns.loadCompanyBusinessCard4Snapshot(db, restaurantId, userId, false, false),
    categoryFns.loadServiceCategoriesCard4Snapshot(db, restaurantId, userId, false, false),
    typeFns.loadServiceTypesCard4Snapshot(db, restaurantId, userId),
    pricingFns.loadServicePricingCard4Snapshot(db, restaurantId),
    assignmentFns.loadServiceDepartmentAssignmentsCard4Snapshot(db, restaurantId),
    slaFns.loadServiceSlaRulesCard4Snapshot(db, restaurantId),
    availabilityFns.loadServiceAvailabilityCard4Snapshot(db, restaurantId),
    channelFns.loadPmsCard4CommunicationChannelsSnapshot(db, restaurantId),
  ]);
  const mainConfigured = [
    profileRules.profileTypeConfigured(profile.types),
    requiredRules.guestFieldsConfigured(required.fields),
    identityRules.identityDocumentTypesConfigured(identity.documentTypes),
    preferenceRules.preferencesConfigured(preferences.categories, preferences.types),
    companyRules.companyBusinessConfigured(company.types, company.settings),
  ];
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
  ];
  const slices: Card8DomainSlice[] = card4.CARD4_STEPS.map((step, index) => ({
    id: step.id,
    label: step.title,
    blockers: incomplete(
      step.title,
      card4.evaluateCard4StepStatus(
        step.id,
        undefined,
        mainConfigured[0]!,
        mainConfigured[1]!,
        mainConfigured[2]!,
        mainConfigured[3]!,
        mainConfigured[4]!,
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
          gstConfigured[0]!,
          gstConfigured[1]!,
          gstConfigured[2]!,
          gstConfigured[3]!,
          gstConfigured[4]!,
          gstConfigured[5]!,
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
          channelRules.communicationChannelsConfigured(channels.channels),
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
  const [{ loadCard7ValidationSnapshot }, { buildCard7ValidationReport }] = await Promise.all([
    import("./card7-readiness.functions"),
    import("./card7-readiness.server"),
  ]);
  const snapshot = await loadCard7ValidationSnapshot(db, restaurantId);
  const report = buildCard7ValidationReport(snapshot);
  return adaptCard8DomainSlices(7, "security_data", [
    { id: "security", label: "Security & Roles", ...report.security },
    { id: "audit", label: "Audit", ...report.audit },
    { id: "reports", label: "Reports", ...report.reports },
    { id: "import", label: "Data Import", ...report.importDomain },
    { id: "integrity", label: "Integrity", ...report.integrity },
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
  .inputValidator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    return loadCard8ValidationReport(db, data.restaurantId, context.userId);
  });
