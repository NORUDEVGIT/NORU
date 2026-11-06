/**
 * Card 4 overall readiness & status evaluation.
 *
 * Evaluates live configuration across Profile Rules, Service Types, and Notifications.
 * Persists status into restaurants.pms_property_setup_status.
 */
import type { Json } from "@/integrations/supabase/types";
import {
  CARD4_PROGRAMME_CARD_ID,
  evaluateCard4OverallStatus,
  mergeCard4Status,
} from "./pms-property-setup-card4.ts";
import {
  parsePropertySetupStatus,
  type PropertySetupCardStatus,
} from "./pms-property-setup-card1.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

export type Card4StatusReport = {
  status: PropertySetupCardStatus;
  profileTypesCount: number;
  serviceTypesCount: number;
};

async function loadOrEmpty<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export async function loadCard4StatusReport(
  db: DbClient,
  restaurantId: string,
  userId: string,
): Promise<Card4StatusReport> {
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
  ]);

  const [
    currentRest,
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
    rules,
    sender,
    defaults,
  ] = await Promise.all([
    db
      .from("restaurants")
      .select("pms_property_setup_status")
      .eq("id", restaurantId)
      .maybeSingle(),
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
      { types: [], settings: { enabled: false, defaultBusinessTypeId: null, autoApproval: false, defaultInvalid: false } },
    ),
    loadOrEmpty(
      () => groupFns.loadGroupTypesCard4Snapshot(db, restaurantId, userId, false, false),
      { types: [] },
    ),
    loadOrEmpty(
      () => travelAgencyFns.loadTravelAgencyTypesCard4Snapshot(db, restaurantId, userId, false, false),
      { types: [] },
    ),
    loadOrEmpty(
      () => categoryFns.loadServiceCategoriesCard4Snapshot(db, restaurantId, userId, false, false),
      { categories: [] },
    ),
    loadOrEmpty(
      () => typeFns.loadServiceTypesCard4Snapshot(db, restaurantId, userId),
      { categories: [], types: [] },
    ),
    loadOrEmpty(
      () => pricingFns.loadServicePricingCard4Snapshot(db, restaurantId),
      { pricing: [], serviceTypes: [] },
    ),
    loadOrEmpty(
      () => assignmentFns.loadServiceDepartmentAssignmentsCard4Snapshot(db, restaurantId),
      { assignments: [], serviceTypes: [], departments: [] },
    ),
    loadOrEmpty(
      () => slaFns.loadServiceSlaRulesCard4Snapshot(db, restaurantId),
      { rules: [], serviceTypes: [] },
    ),
    loadOrEmpty(
      () => availabilityFns.loadServiceAvailabilityCard4Snapshot(db, restaurantId),
      { availability: [], serviceTypes: [] },
    ),
    loadOrEmpty(
      () => channelFns.loadPmsCard4CommunicationChannelsSnapshot(db, restaurantId),
      { channels: [] },
    ),
    loadOrEmpty(
      () => templateFns.loadCommunicationTemplatesCard4Snapshot(db, restaurantId),
      { templates: [] },
    ),
    loadOrEmpty(
      () => eventFns.loadPmsCard4NotificationEventsSnapshot(db, restaurantId),
      { events: [] },
    ),
    loadOrEmpty(
      () => ruleFns.loadAutomationRulesCard4Snapshot(db, restaurantId),
      { rules: [] },
    ),
    loadOrEmpty(
      () => senderFns.loadPmsCard4SenderSettingsSnapshot(db, restaurantId),
      { settings: [] },
    ),
    loadOrEmpty(
      () => defaultFns.loadPmsCard4CommunicationDefaultsSnapshot(db, restaurantId),
      { defaults: null, channels: [], senders: [] },
    ),
  ]);

  const profileTypesCount = profile.types.length;
  const serviceTypesCount = types.types.length;

  const profileTypesConfigured = profileTypesCount > 0;
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
  const serviceCategoriesConfigured = categoryRules.serviceCategoriesConfigured(
    categories.categories,
  );
  const serviceTypesConfigured = typeRules.serviceTypesConfigured(
    types.categories,
    types.types,
  );
  const servicePricingConfigured = pricingRules.servicePricingConfigured(
    pricing.pricing,
    pricing.serviceTypes,
  );
  const serviceDepartmentAssignmentsConfigured =
    assignmentRules.serviceDepartmentAssignmentsConfigured(
      assignments.assignments,
      assignments.serviceTypes,
      assignments.departments,
    );
  const serviceSlaRulesConfigured = slaRules.serviceSlaRulesConfigured(
    sla.rules,
    sla.serviceTypes,
  );
  const serviceAvailabilityConfigured = availabilityRules.serviceAvailabilityConfigured(
    availability.availability,
    availability.serviceTypes,
  );
  const communicationChannelsConfigured = channelRules.communicationChannelsConfigured(
    channels.channels,
  );
  const communicationTemplatesConfigured = templateRules.communicationTemplatesConfigured(
    templates.templates,
  );
  const notificationEventsConfigured = eventRules.notificationEventsConfigured(
    events.events,
  );
  const automationRulesConfigured = ruleRules.automationRulesConfigured(rules.rules);
  const senderSettingsConfigured = senderRules.senderSettingsConfigured(
    sender.settings,
    channels.channels,
  );
  const communicationDefaultsConfigured = defaultRules.communicationDefaultsConfigured(
    defaults.defaults,
    channels.channels,
    defaults.senders,
  );

  let computedStatus = evaluateCard4OverallStatus({
    profileTypesConfigured,
    requiredFieldsConfigured,
    identityDocumentsConfigured,
    preferencesConfigured,
    companyBusinessConfigured,
    groupTypesConfigured,
    travelAgencyTypesConfigured,
    serviceCategoriesConfigured,
    serviceTypesConfigured,
    servicePricingConfigured,
    serviceDepartmentAssignmentsConfigured,
    serviceSlaRulesConfigured,
    serviceAvailabilityConfigured,
    communicationChannelsConfigured,
    communicationTemplatesConfigured,
    notificationEventsConfigured,
    automationRulesConfigured,
    senderSettingsConfigured,
    communicationDefaultsConfigured,
  });

  const storedStatus = parsePropertySetupStatus(currentRest?.data?.pms_property_setup_status);
  const storedCardStatus = storedStatus.cards[CARD4_PROGRAMME_CARD_ID];

  // If stored says complete, trust it; if computed says complete, promote it.
  if (storedCardStatus === "complete") {
    computedStatus = "complete";
  } else if (computedStatus === "not_started" && storedCardStatus === "in_progress") {
    computedStatus = "in_progress";
  }

  // Self-heal stored status in restaurants table if it diverged
  if (storedCardStatus !== computedStatus && computedStatus !== "not_started") {
    const next = mergeCard4Status(currentRest?.data?.pms_property_setup_status, computedStatus);
    await db
      .from("restaurants")
      .update({ pms_property_setup_status: next as unknown as Json })
      .eq("id", restaurantId)
      .then(() => {})
      .catch(() => {});
  }

  return {
    status: computedStatus,
    profileTypesCount,
    serviceTypesCount,
  };
}

export async function persistCard4Status(
  db: DbClient,
  restaurantId: string,
  status: PropertySetupCardStatus,
) {
  const current = await db
    .from("restaurants")
    .select("pms_property_setup_status")
    .eq("id", restaurantId)
    .maybeSingle();

  if (current.error) throw new Error(current.error.message);

  const next = mergeCard4Status(current.data?.pms_property_setup_status, status);
  const saved = await db
    .from("restaurants")
    .update({ pms_property_setup_status: next as unknown as Json })
    .eq("id", restaurantId);

  if (saved.error) throw new Error(saved.error.message);
  return { ok: true, status };
}
