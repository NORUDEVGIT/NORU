import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PmsPropertySetupWorkspace } from "@/packages/pms/components/settings/pms-property-setup-workspace";
import {
  Card4ProfileTypesGuide,
  PmsCard4ProfileTypes,
} from "@/packages/pms/components/settings/pms-card4-profile-types";
import {
  Card4RequiredFieldsGuide,
  PmsCard4RequiredFields,
} from "@/packages/pms/components/settings/pms-card4-required-fields";
import {
  Card4IdentityDocumentsGuide,
  PmsCard4IdentityDocuments,
} from "@/packages/pms/components/settings/pms-card4-identity-documents";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { getPmsCard4ProfileTypes } from "@/packages/pms/lib/profile-types-card4.functions";
import { getPmsCard4RequiredFields } from "@/packages/pms/lib/required-fields-card4.functions";
import { guestFieldsConfigured } from "@/packages/pms/lib/required-fields-card4.server";
import { getPmsCard4IdentityDocumentTypes } from "@/packages/pms/lib/identity-documents-card4.functions";
import { identityDocumentTypesConfigured } from "@/packages/pms/lib/identity-documents-card4.server";
import { getPmsCard4Preferences } from "@/packages/pms/lib/preferences-card4.functions";
import { preferencesConfigured } from "@/packages/pms/lib/preferences-card4.server";
import {
  Card4PreferencesGuide,
  PmsCard4Preferences,
} from "@/packages/pms/components/settings/pms-card4-preferences";
import {
  Card4CompanyBusinessGuide,
  PmsCard4CompanyBusiness,
} from "@/packages/pms/components/settings/pms-card4-company-business";
import {
  Card4ServiceCategoriesGuide,
  PmsCard4ServiceCategories,
} from "@/packages/pms/components/settings/pms-card4-service-categories";
import {
  Card4ServiceTypesGuide,
  PmsCard4ServiceTypes,
} from "@/packages/pms/components/settings/pms-card4-service-types";
import {
  Card4ServicePricingGuide,
  PmsCard4ServicePricing,
} from "@/packages/pms/components/settings/pms-card4-service-pricing";
import {
  Card4ServiceDepartmentAssignmentGuide,
  PmsCard4ServiceDepartmentAssignment,
} from "@/packages/pms/components/settings/pms-card4-service-department-assignment";
import {
  Card4ServiceSlaRulesGuide,
  PmsCard4ServiceSlaRules,
} from "@/packages/pms/components/settings/pms-card4-service-sla-rules";
import {
  Card4ServiceAvailabilityGuide,
  PmsCard4ServiceAvailability,
} from "@/packages/pms/components/settings/pms-card4-service-availability";
import {
  Card4CommunicationChannelsGuide,
  PmsCard4CommunicationChannels,
} from "@/packages/pms/components/settings/pms-card4-communication-channels";
import {
  Card4CommunicationTemplatesGuide,
  PmsCard4CommunicationTemplates,
} from "@/packages/pms/components/settings/pms-card4-communication-templates";
import {
  Card4NotificationEventsGuide,
  PmsCard4NotificationEvents,
} from "@/packages/pms/components/settings/pms-card4-notification-events";
import {
  Card4AutomationRulesGuide,
  PmsCard4AutomationRules,
} from "@/packages/pms/components/settings/pms-card4-automation-rules";
import {
  Card4SenderSettingsGuide,
  PmsCard4SenderSettings,
} from "@/packages/pms/components/settings/pms-card4-sender-settings";
import { getPmsCard4CompanyBusiness } from "@/packages/pms/lib/company-business-card4.functions";
import { companyBusinessConfigured as companyBusinessReady } from "@/packages/pms/lib/company-business-card4.server";
import { getPmsCard4ServiceCategories } from "@/packages/pms/lib/service-categories-card4.functions";
import { serviceCategoriesConfigured } from "@/packages/pms/lib/service-categories-card4.server";
import { getPmsCard4ServiceTypes } from "@/packages/pms/lib/service-types-card4.functions";
import { serviceTypesConfigured } from "@/packages/pms/lib/service-types-card4.server";
import { getPmsCard4ServicePricing } from "@/packages/pms/lib/service-pricing-card4.functions";
import { servicePricingConfigured } from "@/packages/pms/lib/service-pricing-card4.server";
import { getPmsCard4ServiceDepartmentAssignments } from "@/packages/pms/lib/service-department-assignment-card4.functions";
import { serviceDepartmentAssignmentsConfigured } from "@/packages/pms/lib/service-department-assignment-card4.server";
import { getPmsCard4ServiceSlaRules } from "@/packages/pms/lib/service-sla-rules-card4.functions";
import { serviceSlaRulesConfigured } from "@/packages/pms/lib/service-sla-rules-card4.server";
import { getPmsCard4ServiceAvailability } from "@/packages/pms/lib/service-availability-card4.functions";
import { serviceAvailabilityConfigured } from "@/packages/pms/lib/service-availability-card4.server";
import { getPmsCard4CommunicationChannels } from "@/packages/pms/lib/communication-channels-card4.functions";
import { communicationChannelsConfigured } from "@/packages/pms/lib/communication-channels-card4.server";
import { getPmsCard4CommunicationTemplates } from "@/packages/pms/lib/communication-templates-card4.functions";
import {
  communicationTemplatesConfigured,
  renderTemplateText,
  stripTemplateHtml,
} from "@/packages/pms/lib/communication-templates-card4.server";
import { getPmsCard4NotificationEvents } from "@/packages/pms/lib/notification-events-card4.functions";
import { notificationEventsConfigured } from "@/packages/pms/lib/notification-events-card4.server";
import { getPmsCard4AutomationRules } from "@/packages/pms/lib/automation-rules-card4.functions";
import { automationRulesConfigured } from "@/packages/pms/lib/automation-rules-card4.server";
import { getPmsCard4SenderSettings } from "@/packages/pms/lib/sender-settings-card4.functions";
import { senderSettingsConfigured } from "@/packages/pms/lib/sender-settings-card4.server";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD4_GST_STEPS,
  CARD4_GST_SUBTITLE,
  CARD4_GPR_SUBTITLE,
  CARD4_MAIN_SECTIONS,
  CARD4_NOTIFICATION_STEPS,
  CARD4_NOTIFY_SUBTITLE,
  CARD4_SIDEBAR_OUT,
  CARD4_STEPS,
  CARD4_WORKSPACE_TITLE,
  card4CompletedCount,
  card4GstCompletedCount,
  card4GstStepById,
  card4NotificationStepById,
  card4ProgressPct,
  card4StepById,
  evaluateCard4StepStatus,
  evaluateGstStepStatus,
  evaluateNotificationStepStatus,
  nextCard4GstStep,
  nextCard4NotificationStep,
  nextCard4Step,
  type Card4GstStepId,
  type Card4MainSectionId,
  type Card4NotificationStepId,
  type Card4StepId,
} from "@/packages/pms/lib/pms-property-setup-card4";
import { cn } from "@/shared/lib/utils";

export function PmsPropertySetupCard4Section({
  restaurantId,
  canEdit,
  initialStep = "profile-types",
}: {
  restaurantId: string;
  canEdit: boolean;
  initialStep?: Card4StepId;
}) {
  const [mainSection, setMainSection] = useState<Card4MainSectionId>("profile-rules");
  const [step, setStep] = useState<Card4StepId>(initialStep);
  const [gstStep, setGstStep] = useState<Card4GstStepId>("service-categories");
  const [notificationStep, setNotificationStep] = useState<Card4NotificationStepId>("channels");
  const [saveRequest, setSaveRequest] = useState<{ token: number; thenNext: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const loadTypes = useServerFn(getPmsCard4ProfileTypes);
  const loadFields = useServerFn(getPmsCard4RequiredFields);
  const loadDocuments = useServerFn(getPmsCard4IdentityDocumentTypes);
  const loadPreferences = useServerFn(getPmsCard4Preferences);
  const loadCompanyBusiness = useServerFn(getPmsCard4CompanyBusiness);
  const loadServiceCategories = useServerFn(getPmsCard4ServiceCategories);
  const loadServiceTypes = useServerFn(getPmsCard4ServiceTypes);
  const loadServicePricing = useServerFn(getPmsCard4ServicePricing);
  const loadAssignments = useServerFn(getPmsCard4ServiceDepartmentAssignments);
  const loadSlaRules = useServerFn(getPmsCard4ServiceSlaRules);
  const loadAvailability = useServerFn(getPmsCard4ServiceAvailability);
  const loadCommunicationChannels = useServerFn(getPmsCard4CommunicationChannels);
  const loadCommunicationTemplates = useServerFn(getPmsCard4CommunicationTemplates);
  const loadNotificationEvents = useServerFn(getPmsCard4NotificationEvents);
  const loadAutomationRules = useServerFn(getPmsCard4AutomationRules);
  const loadSenderSettings = useServerFn(getPmsCard4SenderSettings);
  const typesQuery = useQuery({
    queryKey: ["pms-card4-profile-types", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId } }),
    retry: false,
  });
  const fieldsQuery = useQuery({
    queryKey: ["pms-card4-required-fields", restaurantId],
    queryFn: () => loadFields({ data: { restaurantId } }),
    retry: false,
  });
  const documentsQuery = useQuery({
    queryKey: ["pms-card4-identity-documents", restaurantId],
    queryFn: () => loadDocuments({ data: { restaurantId } }),
    enabled: typesQuery.isSuccess,
    retry: false,
  });
  const preferencesQuery = useQuery({
    queryKey: ["pms-card4-preferences", restaurantId],
    queryFn: () => loadPreferences({ data: { restaurantId } }),
    retry: false,
  });
  const companyQuery = useQuery({
    queryKey: ["pms-card4-company-business", restaurantId],
    queryFn: () => loadCompanyBusiness({ data: { restaurantId } }),
    retry: false,
  });
  const serviceCategoriesQuery = useQuery({
    queryKey: ["pms-card4-service-categories", restaurantId],
    queryFn: () => loadServiceCategories({ data: { restaurantId } }),
    retry: false,
  });
  const serviceTypesQuery = useQuery({
    queryKey: ["pms-card4-service-types", restaurantId],
    queryFn: () => loadServiceTypes({ data: { restaurantId } }),
    retry: false,
  });
  const servicePricingQuery = useQuery({
    queryKey: ["pms-card4-service-pricing", restaurantId],
    queryFn: () => loadServicePricing({ data: { restaurantId } }),
    retry: false,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["pms-card4-department-assignment", restaurantId],
    queryFn: () => loadAssignments({ data: { restaurantId } }),
    retry: false,
  });
  const slaRulesQuery = useQuery({
    queryKey: ["pms-card4-service-sla-rules", restaurantId],
    queryFn: () => loadSlaRules({ data: { restaurantId } }),
    retry: false,
  });
  const availabilityQuery = useQuery({
    queryKey: ["pms-card4-service-availability", restaurantId],
    queryFn: () => loadAvailability({ data: { restaurantId } }),
    retry: false,
  });
  const communicationChannelsQuery = useQuery({
    queryKey: ["pms-card4-communication-channels", restaurantId],
    queryFn: () => loadCommunicationChannels({ data: { restaurantId } }),
    retry: false,
  });
  const communicationTemplatesQuery = useQuery({
    queryKey: ["pms-card4-communication-templates", restaurantId],
    queryFn: () => loadCommunicationTemplates({ data: { restaurantId } }),
    retry: false,
  });
  const notificationEventsQuery = useQuery({
    queryKey: ["pms-card4-notification-events", restaurantId],
    queryFn: () => loadNotificationEvents({ data: { restaurantId } }),
    retry: false,
  });
  const automationRulesQuery = useQuery({
    queryKey: ["pms-card4-automation-rules", restaurantId],
    queryFn: () => loadAutomationRules({ data: { restaurantId } }),
    retry: false,
  });
  const senderSettingsQuery = useQuery({
    queryKey: ["pms-card4-sender-settings", restaurantId],
    queryFn: () => loadSenderSettings({ data: { restaurantId } }),
    retry: false,
  });
  const profileTypesConfigured = (typesQuery.data?.types.length ?? 0) > 0;
  const requiredFieldsConfigured = guestFieldsConfigured(fieldsQuery.data?.fields ?? []);
  const identityDocumentsConfigured = identityDocumentTypesConfigured(
    documentsQuery.data?.documentTypes ?? [],
  );
  const preferencesReady = preferencesConfigured(
    preferencesQuery.data?.categories ?? [],
    preferencesQuery.data?.types ?? [],
  );
  const companyReady = companyBusinessReady(
    companyQuery.data?.types ?? [],
    companyQuery.data?.settings ?? {
      enabled: false,
      defaultBusinessTypeId: null,
      autoApproval: false,
      defaultInvalid: false,
    },
  );
  const categoriesReady = serviceCategoriesConfigured(
    serviceCategoriesQuery.data?.categories ?? [],
  );
  const typesReady = serviceTypesConfigured(
    serviceTypesQuery.data?.categories ?? [],
    serviceTypesQuery.data?.types ?? [],
  );
  const pricingReady = servicePricingConfigured(
    servicePricingQuery.data?.pricing ?? [],
    servicePricingQuery.data?.serviceTypes ?? [],
  );
  const assignmentsReady = serviceDepartmentAssignmentsConfigured(
    assignmentsQuery.data?.assignments ?? [],
    assignmentsQuery.data?.serviceTypes ?? [],
    assignmentsQuery.data?.departments ?? [],
  );
  const slaRulesReady = serviceSlaRulesConfigured(
    slaRulesQuery.data?.rules ?? [],
    slaRulesQuery.data?.serviceTypes ?? [],
  );
  const availabilityReady = serviceAvailabilityConfigured(
    availabilityQuery.data?.availability ?? [],
    availabilityQuery.data?.serviceTypes ?? [],
  );
  const channelsReady = communicationChannelsConfigured(
    communicationChannelsQuery.data?.channels ?? [],
  );
  const templatesReady = communicationTemplatesConfigured(
    communicationTemplatesQuery.data?.templates ?? [],
  );
  const eventsReady = notificationEventsConfigured(notificationEventsQuery.data?.events ?? []);
  const rulesReady = automationRulesConfigured(automationRulesQuery.data?.rules ?? []);
  const senderReady = senderSettingsConfigured(
    senderSettingsQuery.data?.settings ?? [],
    communicationChannelsQuery.data?.channels ?? [],
  );

  const onSavingChange = useCallback((nextSaving: boolean, nextCanSave: boolean) => {
    setSaving(nextSaving);
    setCanSave(nextCanSave);
  }, []);

  const current = card4StepById(step);
  const next = nextCard4Step(step);
  const gstCurrent = card4GstStepById(gstStep);
  const gstNext = nextCard4GstStep(gstStep);
  const notificationCurrent = card4NotificationStepById(notificationStep);
  const notificationNext = nextCard4NotificationStep(notificationStep);
  const stepStatuses: Partial<Record<Card4StepId, PropertySetupCardStatus>> = {
    "profile-types": evaluateCard4StepStatus(
      "profile-types",
      undefined,
      profileTypesConfigured,
      requiredFieldsConfigured,
      identityDocumentsConfigured,
      preferencesReady,
    ),
    "required-fields": evaluateCard4StepStatus(
      "required-fields",
      undefined,
      profileTypesConfigured,
      requiredFieldsConfigured,
      identityDocumentsConfigured,
      preferencesReady,
    ),
    "identity-documents": evaluateCard4StepStatus(
      "identity-documents",
      undefined,
      profileTypesConfigured,
      requiredFieldsConfigured,
      identityDocumentsConfigured,
      preferencesReady,
    ),
    preferences: evaluateCard4StepStatus(
      "preferences",
      undefined,
      profileTypesConfigured,
      requiredFieldsConfigured,
      identityDocumentsConfigured,
      preferencesReady,
      companyReady,
    ),
    "company-business": evaluateCard4StepStatus(
      "company-business",
      undefined,
      profileTypesConfigured,
      requiredFieldsConfigured,
      identityDocumentsConfigured,
      preferencesReady,
      companyReady,
    ),
  };
  const gstStatuses: Partial<Record<Card4GstStepId, PropertySetupCardStatus>> = {
    "service-categories": evaluateGstStepStatus(
      "service-categories",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
    "service-types": evaluateGstStepStatus(
      "service-types",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
    "service-pricing": evaluateGstStepStatus(
      "service-pricing",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
    "department-assignment": evaluateGstStepStatus(
      "department-assignment",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
    "sla-rules": evaluateGstStepStatus(
      "sla-rules",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
    "service-availability": evaluateGstStepStatus(
      "service-availability",
      categoriesReady,
      typesReady,
      pricingReady,
      assignmentsReady,
      slaRulesReady,
      availabilityReady,
    ),
  };
  const notificationStatuses: Partial<Record<Card4NotificationStepId, PropertySetupCardStatus>> =
    Object.fromEntries(
      CARD4_NOTIFICATION_STEPS.map((row) => [
        row.id,
        evaluateNotificationStepStatus(
          row.id,
          channelsReady,
          templatesReady,
          eventsReady,
          rulesReady,
          senderReady,
        ),
      ]),
    );
  const gprCompleted = card4CompletedCount(stepStatuses);
  const gstCompleted = card4GstCompletedCount(gstStatuses);
  const notificationCompleted = CARD4_NOTIFICATION_STEPS.filter(
    (row) => notificationStatuses[row.id] === "complete",
  ).length;
  const completedCount =
    mainSection === "guest-service-types"
      ? gstCompleted
      : mainSection === "notifications"
        ? notificationCompleted
        : gprCompleted;
  const allGprComplete =
    profileTypesConfigured &&
    requiredFieldsConfigured &&
    identityDocumentsConfigured &&
    preferencesReady &&
    companyReady;
  const cardStatus: PropertySetupCardStatus =
    allGprComplete &&
    categoriesReady &&
    typesReady &&
    pricingReady &&
    assignmentsReady &&
    slaRulesReady &&
    availabilityReady &&
    channelsReady &&
    templatesReady &&
    eventsReady &&
    rulesReady &&
    senderReady
      ? "complete"
      : profileTypesConfigured ||
          requiredFieldsConfigured ||
          identityDocumentsConfigured ||
          preferencesReady ||
          companyReady ||
          categoriesReady ||
          typesReady ||
          pricingReady ||
          assignmentsReady ||
          slaRulesReady ||
          availabilityReady ||
          channelsReady ||
          templatesReady ||
          eventsReady ||
          rulesReady ||
          senderReady
        ? "in_progress"
        : "not_started";

  function goHub() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  function requestSave(thenNext: boolean) {
    setSaveRequest((prev) => ({ token: (prev?.token ?? 0) + 1, thenNext }));
  }

  function onSaved(thenNext: boolean) {
    if (!thenNext) return;
    if (mainSection === "profile-rules") {
      if (next) setStep(next);
      else {
        setMainSection("guest-service-types");
        setGstStep("service-categories");
      }
      return;
    }
    if (mainSection === "guest-service-types") {
      if (gstNext) setGstStep(gstNext);
      else {
        setMainSection("notifications");
        setNotificationStep("channels");
      }
      return;
    }
    if (notificationNext) setNotificationStep(notificationNext);
    else goHub();
  }

  function goContinue() {
    if (mainSection === "notifications") {
      if (
        notificationStep === "channels" ||
        notificationStep === "communication-templates" ||
        notificationStep === "notification-events" ||
        notificationStep === "automation-rules" ||
        notificationStep === "sender-settings"
      ) {
        requestSave(true);
        return;
      }
      if (notificationNext) setNotificationStep(notificationNext);
      else goHub();
      return;
    }
    if (mainSection === "guest-service-types") {
      if (
        gstStep === "service-categories" ||
        gstStep === "service-types" ||
        gstStep === "service-pricing" ||
        gstStep === "department-assignment" ||
        gstStep === "sla-rules" ||
        gstStep === "service-availability"
      ) {
        requestSave(true);
        return;
      }
      if (gstNext) setGstStep(gstNext);
      return;
    }
    if (
      step === "profile-types" ||
      step === "required-fields" ||
      step === "identity-documents" ||
      step === "preferences" ||
      step === "company-business"
    ) {
      requestSave(true);
      return;
    }
    if (next) setStep(next);
  }

  const gprLive =
    step === "profile-types" ||
    step === "required-fields" ||
    step === "identity-documents" ||
    step === "preferences" ||
    step === "company-business";
  const gstLive =
    gstStep === "service-categories" ||
    gstStep === "service-types" ||
    gstStep === "service-pricing" ||
    gstStep === "department-assignment" ||
    gstStep === "sla-rules" ||
    gstStep === "service-availability";
  const liveStep =
    mainSection === "profile-rules"
      ? gprLive
      : mainSection === "guest-service-types"
        ? gstLive
        : notificationStep === "channels" ||
          notificationStep === "communication-templates" ||
          notificationStep === "notification-events" ||
          notificationStep === "automation-rules" ||
          notificationStep === "sender-settings";
  const subtitle =
    mainSection === "guest-service-types"
      ? CARD4_GST_SUBTITLE
      : mainSection === "notifications"
        ? CARD4_NOTIFY_SUBTITLE
        : CARD4_GPR_SUBTITLE;
  const currentSectionTitle =
    mainSection === "guest-service-types"
      ? gstCurrent.title
      : mainSection === "notifications"
        ? notificationCurrent.title
        : current.title;
  const nextStepTitle =
    mainSection === "guest-service-types"
      ? gstNext
        ? card4GstStepById(gstNext).title
        : null
      : mainSection === "profile-rules"
        ? next
          ? card4StepById(next).title
          : "Guest Service Types"
        : notificationNext
          ? card4NotificationStepById(notificationNext).title
          : null;
  const workspaceSteps =
    mainSection === "guest-service-types"
      ? CARD4_GST_STEPS.map((row) => ({
          id: row.id,
          number: row.number,
          title: row.title,
          status: gstStatuses[row.id] ?? "not_started",
        }))
      : mainSection === "notifications"
        ? CARD4_NOTIFICATION_STEPS.map((row) => ({
            id: row.id,
            number: row.number,
            title: row.title,
            status: notificationStatuses[row.id] ?? "not_started",
          }))
        : CARD4_STEPS.map((row) => ({
            id: row.id,
            number: row.number,
            title: row.title,
            status: stepStatuses[row.id] ?? "not_started",
          }));

  return (
    <PmsPropertySetupWorkspace
      testIdPrefix="pms-card4"
      sidebarOutCopy={CARD4_SIDEBAR_OUT}
      nav={CARD1_PMS_NAV}
      title={CARD4_WORKSPACE_TITLE}
      subtitle={subtitle}
      sectionSwitcher={
        <div className="mt-3 flex flex-wrap gap-2" data-testid="pms-card4-main-sections">
          {CARD4_MAIN_SECTIONS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setMainSection(row.id)}
              aria-current={mainSection === row.id ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                mainSection === row.id
                  ? "border-[#C89933] bg-[#C89933]/15 text-[#251605]"
                  : "border-[#CCCCCC] text-muted-foreground hover:border-[#C89933]/60",
              )}
            >
              {row.title}
            </button>
          ))}
        </div>
      }
      steps={workspaceSteps}
      activeStepId={
        mainSection === "guest-service-types"
          ? gstStep
          : mainSection === "notifications"
            ? notificationStep
            : step
      }
      onSelectStep={(id) => {
        if (mainSection === "guest-service-types") setGstStep(id as Card4GstStepId);
        else if (mainSection === "notifications")
          setNotificationStep(id as Card4NotificationStepId);
        else if (mainSection === "profile-rules") setStep(id as Card4StepId);
      }}
      progressPct={
        mainSection === "guest-service-types"
          ? Math.round((gstCompleted / CARD4_GST_STEPS.length) * 100)
          : mainSection === "notifications"
            ? Math.round((notificationCompleted / CARD4_NOTIFICATION_STEPS.length) * 100)
            : card4ProgressPct(gprCompleted)
      }
      completedCount={completedCount}
      currentSection={currentSectionTitle}
      nextStepTitle={nextStepTitle}
      cardStatusLabel={propertySetupStatusLabel(cardStatus)}
      progressLabel={
        mainSection === "guest-service-types"
          ? "Guest Service Types"
          : mainSection === "notifications"
            ? "Notifications & Communication"
            : "Guest Profile Rules"
      }
      onBack={goHub}
      backLabel="Cancel"
      saveDraftDisabled={!canEdit || !liveStep || !canSave || saving}
      continueDisabled={!canEdit || (liveStep && (!canSave || saving))}
      continuePending={saving}
      onSaveDraft={() => requestSave(false)}
      onContinue={goContinue}
      continueLabel="Save & Next"
      railExtras={
        mainSection === "notifications" && notificationStep === "channels" ? (
          <Card4CommunicationChannelsGuide
            channels={communicationChannelsQuery.data?.channels ?? []}
          />
        ) : mainSection === "notifications" && notificationStep === "communication-templates" ? (
          <Card4CommunicationTemplatesGuide
            templates={communicationTemplatesQuery.data?.templates ?? []}
            previewSubject={renderTemplateText(
              communicationTemplatesQuery.data?.templates[0]?.subject ?? "",
            )}
            previewBody={renderTemplateText(
              stripTemplateHtml(communicationTemplatesQuery.data?.templates[0]?.message ?? ""),
            )}
          />
        ) : mainSection === "notifications" && notificationStep === "notification-events" ? (
          <Card4NotificationEventsGuide events={notificationEventsQuery.data?.events ?? []} />
        ) : mainSection === "notifications" && notificationStep === "automation-rules" ? (
          <Card4AutomationRulesGuide rules={automationRulesQuery.data?.rules ?? []} />
        ) : mainSection === "notifications" && notificationStep === "sender-settings" ? (
          <Card4SenderSettingsGuide settings={senderSettingsQuery.data?.settings ?? []} />
        ) : mainSection === "guest-service-types" && gstStep === "service-categories" ? (
          <Card4ServiceCategoriesGuide
            count={serviceCategoriesQuery.data?.categories.length ?? 0}
          />
        ) : mainSection === "guest-service-types" && gstStep === "service-types" ? (
          <Card4ServiceTypesGuide count={serviceTypesQuery.data?.types.length ?? 0} />
        ) : mainSection === "guest-service-types" && gstStep === "service-pricing" ? (
          <Card4ServicePricingGuide
            pricedCount={servicePricingQuery.data?.pricing.length ?? 0}
            activeServiceTypeCount={
              servicePricingQuery.data?.serviceTypes.filter((row) => row.active).length ?? 0
            }
          />
        ) : mainSection === "guest-service-types" && gstStep === "department-assignment" ? (
          <Card4ServiceDepartmentAssignmentGuide
            assignmentCount={assignmentsQuery.data?.assignments.length ?? 0}
            activeDepartmentCount={
              assignmentsQuery.data?.departments.filter((row) => row.active).length ?? 0
            }
          />
        ) : mainSection === "guest-service-types" && gstStep === "sla-rules" ? (
          <Card4ServiceSlaRulesGuide
            ruleCount={slaRulesQuery.data?.rules.length ?? 0}
            activeServiceTypeCount={
              slaRulesQuery.data?.serviceTypes.filter((row) => row.active).length ?? 0
            }
          />
        ) : mainSection === "guest-service-types" && gstStep === "service-availability" ? (
          <Card4ServiceAvailabilityGuide
            configuredCount={availabilityQuery.data?.availability.length ?? 0}
            activeServiceTypeCount={
              availabilityQuery.data?.serviceTypes.filter((row) => row.active).length ?? 0
            }
          />
        ) : mainSection !== "profile-rules" ? null : step === "profile-types" ? (
          <Card4ProfileTypesGuide count={typesQuery.data?.types.length ?? 0} />
        ) : step === "required-fields" ? (
          <Card4RequiredFieldsGuide
            count={fieldsQuery.data?.fields.length ?? 0}
            onGoIdentityDocuments={() => setStep("identity-documents")}
          />
        ) : step === "identity-documents" ? (
          <Card4IdentityDocumentsGuide
            activeCount={documentsQuery.data?.documentTypes.filter((row) => row.active).length ?? 0}
          />
        ) : step === "preferences" ? (
          <Card4PreferencesGuide
            categoryCount={preferencesQuery.data?.categories.length ?? 0}
            typeCount={preferencesQuery.data?.types.length ?? 0}
          />
        ) : step === "company-business" ? (
          <Card4CompanyBusinessGuide
            typeCount={companyQuery.data?.types.length ?? 0}
            typesWithFields={
              companyQuery.data?.types.filter((row) => row.requiredFieldIds.length > 0).length ?? 0
            }
            settingsReady={companyReady}
            saved={Boolean(companyQuery.data?.lastUpdatedAt)}
          />
        ) : null
      }
    >
      {mainSection === "notifications" ? (
        notificationStep === "channels" ? (
          <PmsCard4CommunicationChannels
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : notificationStep === "communication-templates" ? (
          <PmsCard4CommunicationTemplates
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : notificationStep === "notification-events" ? (
          <PmsCard4NotificationEvents
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : notificationStep === "automation-rules" ? (
          <PmsCard4AutomationRules
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : notificationStep === "sender-settings" ? (
          <PmsCard4SenderSettings
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : (
          <div
            className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8"
            data-testid={`card4-placeholder-${notificationStep}`}
          >
            <h2 className="font-display text-2xl text-[#251605]">{notificationCurrent.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{notificationCurrent.placeholder}</p>
          </div>
        )
      ) : mainSection === "guest-service-types" ? (
        gstStep === "service-categories" ? (
          <PmsCard4ServiceCategories
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : gstStep === "service-types" ? (
          <PmsCard4ServiceTypes
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : gstStep === "service-pricing" ? (
          <PmsCard4ServicePricing
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : gstStep === "department-assignment" ? (
          <PmsCard4ServiceDepartmentAssignment
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : gstStep === "sla-rules" ? (
          <PmsCard4ServiceSlaRules
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : gstStep === "service-availability" ? (
          <PmsCard4ServiceAvailability
            restaurantId={restaurantId}
            canEdit={canEdit}
            onSavingChange={onSavingChange}
            saveRequest={saveRequest}
            onSaved={onSaved}
          />
        ) : (
          <div
            className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8"
            data-testid={`card4-placeholder-${gstStep}`}
          >
            <h2 className="font-display text-2xl text-[#251605]">{gstCurrent.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{gstCurrent.placeholder}</p>
          </div>
        )
      ) : step === "profile-types" ? (
        <PmsCard4ProfileTypes
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
        />
      ) : step === "required-fields" ? (
        <PmsCard4RequiredFields
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
          onGoIdentityDocuments={() => setStep("identity-documents")}
        />
      ) : step === "identity-documents" ? (
        <PmsCard4IdentityDocuments
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
        />
      ) : step === "preferences" ? (
        <PmsCard4Preferences
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
        />
      ) : step === "company-business" ? (
        <PmsCard4CompanyBusiness
          restaurantId={restaurantId}
          canEdit={canEdit}
          onSavingChange={onSavingChange}
          saveRequest={saveRequest}
          onSaved={onSaved}
          onGoRequiredFields={() => setStep("required-fields")}
        />
      ) : (
        <div
          className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8"
          data-testid={`card4-placeholder-${step}`}
        >
          <h2 className="font-display text-2xl text-[#251605]">{current.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{current.placeholder}</p>
        </div>
      )}
    </PmsPropertySetupWorkspace>
  );
}
