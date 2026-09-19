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
import { getPmsCard4CompanyBusiness } from "@/packages/pms/lib/company-business-card4.functions";
import { companyBusinessConfigured as companyBusinessReady } from "@/packages/pms/lib/company-business-card4.server";
import { getPmsCard4ServiceCategories } from "@/packages/pms/lib/service-categories-card4.functions";
import { serviceCategoriesConfigured } from "@/packages/pms/lib/service-categories-card4.server";
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
  CARD4_NOTIFY_SUBTITLE,
  CARD4_SIDEBAR_OUT,
  CARD4_STEPS,
  CARD4_WORKSPACE_TITLE,
  card4CompletedCount,
  card4GstCompletedCount,
  card4GstStepById,
  card4ProgressPct,
  card4StepById,
  evaluateCard4StepStatus,
  evaluateGstStepStatus,
  nextCard4GstStep,
  nextCard4Step,
  type Card4GstStepId,
  type Card4MainSectionId,
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
  const [saveRequest, setSaveRequest] = useState<{ token: number; thenNext: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const loadTypes = useServerFn(getPmsCard4ProfileTypes);
  const loadFields = useServerFn(getPmsCard4RequiredFields);
  const loadDocuments = useServerFn(getPmsCard4IdentityDocumentTypes);
  const loadPreferences = useServerFn(getPmsCard4Preferences);
  const loadCompanyBusiness = useServerFn(getPmsCard4CompanyBusiness);
  const loadServiceCategories = useServerFn(getPmsCard4ServiceCategories);
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

  const onSavingChange = useCallback((nextSaving: boolean, nextCanSave: boolean) => {
    setSaving(nextSaving);
    setCanSave(nextCanSave);
  }, []);

  const current = card4StepById(step);
  const next = nextCard4Step(step);
  const gstCurrent = card4GstStepById(gstStep);
  const gstNext = nextCard4GstStep(gstStep);
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
    "service-categories": evaluateGstStepStatus("service-categories", categoriesReady),
    "service-types": evaluateGstStepStatus("service-types", categoriesReady),
    "service-pricing": evaluateGstStepStatus("service-pricing", categoriesReady),
    "department-assignment": evaluateGstStepStatus("department-assignment", categoriesReady),
    "sla-rules": evaluateGstStepStatus("sla-rules", categoriesReady),
    "service-availability": evaluateGstStepStatus("service-availability", categoriesReady),
  };
  const gprCompleted = card4CompletedCount(stepStatuses);
  const gstCompleted = card4GstCompletedCount(gstStatuses);
  const completedCount =
    mainSection === "guest-service-types"
      ? gstCompleted
      : mainSection === "notifications"
        ? 0
        : gprCompleted;
  const allGprComplete =
    profileTypesConfigured &&
    requiredFieldsConfigured &&
    identityDocumentsConfigured &&
    preferencesReady &&
    companyReady;
  const cardStatus: PropertySetupCardStatus =
    allGprComplete && categoriesReady
      ? "complete"
      : profileTypesConfigured ||
          requiredFieldsConfigured ||
          identityDocumentsConfigured ||
          preferencesReady ||
          companyReady ||
          categoriesReady
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
    if (gstNext) setGstStep(gstNext);
    else goHub();
  }

  function goContinue() {
    if (mainSection === "notifications") {
      goHub();
      return;
    }
    if (mainSection === "guest-service-types") {
      if (gstStep === "service-categories") {
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
  const gstLive = gstStep === "service-categories";
  const liveStep =
    mainSection === "profile-rules"
      ? gprLive
      : mainSection === "guest-service-types"
        ? gstLive
        : false;
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
        ? "Notifications & Communication"
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
        ? [
            {
              id: "notifications",
              number: 1,
              title: "Notifications & Communication",
              status: "not_started" as const,
            },
          ]
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
            ? "notifications"
            : step
      }
      onSelectStep={(id) => {
        if (mainSection === "guest-service-types") setGstStep(id as Card4GstStepId);
        else if (mainSection === "profile-rules") setStep(id as Card4StepId);
      }}
      progressPct={
        mainSection === "guest-service-types"
          ? Math.round((gstCompleted / CARD4_GST_STEPS.length) * 100)
          : mainSection === "notifications"
            ? 0
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
        mainSection === "guest-service-types" && gstStep === "service-categories" ? (
          <Card4ServiceCategoriesGuide
            count={serviceCategoriesQuery.data?.categories.length ?? 0}
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
        <div
          className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8"
          data-testid="card4-placeholder-notifications"
        >
          <h2 className="font-display text-2xl text-[#251605]">Notifications & Communication</h2>
          <p className="mt-2 text-sm text-muted-foreground">{CARD4_NOTIFY_SUBTITLE}</p>
        </div>
      ) : mainSection === "guest-service-types" ? (
        gstStep === "service-categories" ? (
          <PmsCard4ServiceCategories
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
