import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { propertySetupRailCounts } from "@/packages/pms/lib/pms-property-setup-ui";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD3_DOMAINS,
  CARD3_SUBTITLE,
  type Card3DomainId,
} from "@/packages/pms/lib/pms-property-setup-card3";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  PropertySetupStatusRail,
  PropertySetupStepNav,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
import {
  Card3DraftSaveProvider,
  type Card3DraftSave,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import { PmsPropertySetupCard3Currency } from "@/packages/pms/components/settings/pms-property-setup-card3-currency";
import { PmsPropertySetupCard3Taxes } from "@/packages/pms/components/settings/pms-property-setup-card3-taxes";
import { PmsPropertySetupCard3Rates } from "@/packages/pms/components/settings/pms-property-setup-card3-rates";
import { PmsPropertySetupCard3Meals } from "@/packages/pms/components/settings/pms-property-setup-card3-meals";
import { PmsPropertySetupCard3Payments } from "@/packages/pms/components/settings/pms-property-setup-card3-payments";
import { PmsPropertySetupCard3Billing } from "@/packages/pms/components/settings/pms-property-setup-card3-billing";
import { PmsPropertySetupCard3Corporate } from "@/packages/pms/components/settings/pms-property-setup-card3-corporate";
import { PmsPropertySetupCard3Commercial } from "@/packages/pms/components/settings/pms-property-setup-card3-commercial";
import { getCurrencyCard3 } from "@/packages/pms/lib/currency-card3.functions";
import { getTaxesCard3 } from "@/packages/pms/lib/taxes-card3.functions";
import { getRatesCard3 } from "@/packages/pms/lib/rates-card3.functions";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { getPaymentsCard3 } from "@/packages/pms/lib/payments-card3.functions";
import { getBillingCard3 } from "@/packages/pms/lib/billing-card3.functions";
import { getCorporateCard3 } from "@/packages/pms/lib/corporate-card3.functions";
import { getCommercialCard3 } from "@/packages/pms/lib/commercial-card3.functions";

export function PmsPropertySetupCard3Section({
  restaurantId,
  canEdit,
}: {
  restaurantId: string;
  canEdit: boolean;
}) {
  const [activeDomain, setActiveDomain] = useState<Card3DomainId>("currency-financial-settings");
  const [draftSave, setDraftSave] = useState<Card3DraftSave | null>(null);
  const [continuing, setContinuing] = useState(false);
  const registerDraftSave = useCallback((value: Card3DraftSave | null) => {
    setDraftSave(value);
  }, []);
  const domain = CARD3_DOMAINS.find((row) => row.id === activeDomain) ?? CARD3_DOMAINS[0];
  const loadCurrency = useServerFn(getCurrencyCard3);
  const loadTaxes = useServerFn(getTaxesCard3);
  const loadRates = useServerFn(getRatesCard3);
  const loadMeals = useServerFn(getMealsCard3);
  const loadPayments = useServerFn(getPaymentsCard3);
  const loadBilling = useServerFn(getBillingCard3);
  const loadCorporate = useServerFn(getCorporateCard3);
  const loadCommercial = useServerFn(getCommercialCard3);
  const currencyQuery = useQuery({
    queryKey: ["pms-card3-currency", restaurantId],
    queryFn: () => loadCurrency({ data: { restaurantId } }),
  });
  const taxesQuery = useQuery({
    queryKey: ["pms-card3-taxes", restaurantId],
    queryFn: () => loadTaxes({ data: { restaurantId } }),
  });
  const ratesQuery = useQuery({
    queryKey: ["pms-card3-rates", restaurantId],
    queryFn: () => loadRates({ data: { restaurantId } }),
  });
  const mealsQuery = useQuery({
    queryKey: ["pms-card3-meals", restaurantId],
    queryFn: () => loadMeals({ data: { restaurantId } }),
  });
  const paymentsQuery = useQuery({
    queryKey: ["pms-card3-payments", restaurantId],
    queryFn: () => loadPayments({ data: { restaurantId } }),
  });
  const billingQuery = useQuery({
    queryKey: ["pms-card3-billing", restaurantId],
    queryFn: () => loadBilling({ data: { restaurantId } }),
  });
  const corporateQuery = useQuery({
    queryKey: ["pms-card3-corporate", restaurantId],
    queryFn: () => loadCorporate({ data: { restaurantId } }),
  });
  const commercialQuery = useQuery({
    queryKey: ["pms-card3-commercial", restaurantId],
    queryFn: () => loadCommercial({ data: { restaurantId } }),
  });
  const readinessLoading =
    currencyQuery.isLoading ||
    taxesQuery.isLoading ||
    ratesQuery.isLoading ||
    mealsQuery.isLoading ||
    paymentsQuery.isLoading ||
    billingQuery.isLoading ||
    corporateQuery.isLoading ||
    commercialQuery.isLoading;
  const currencyStatus: PropertySetupCardStatus =
    currencyQuery.data?.readiness.status ?? "not_started";
  const taxesStatus: PropertySetupCardStatus = taxesQuery.data?.readiness.status ?? "not_started";
  const ratesStatus: PropertySetupCardStatus = ratesQuery.data?.readiness.status ?? "not_started";
  const mealsStatus: PropertySetupCardStatus = mealsQuery.data?.readiness.status ?? "not_started";
  const paymentsStatus: PropertySetupCardStatus =
    paymentsQuery.data?.readiness.status ?? "not_started";
  const billingStatus: PropertySetupCardStatus =
    billingQuery.data?.readiness.status ?? "not_started";
  const corporateStatus: PropertySetupCardStatus =
    corporateQuery.data?.readiness.status ?? "not_started";
  const commercialStatus: PropertySetupCardStatus =
    commercialQuery.data?.readiness.status ?? "not_started";
  const domainStatuses: Record<Card3DomainId, PropertySetupCardStatus> = {
    "currency-financial-settings": currencyStatus,
    "taxes-fees": taxesStatus,
    "rates-pricing": ratesStatus,
    "meal-plans-packages": mealsStatus,
    "payments-deposits": paymentsStatus,
    "billing-invoicing": billingStatus,
    "corporate-contract-rates": corporateStatus,
    "revenue-commercial-rules": commercialStatus,
  };
  const railSections = CARD3_DOMAINS.map((item) => ({
    id: item.id,
    title: item.title,
    status: domainStatuses[item.id],
  }));
  const counts = propertySetupRailCounts(railSections.map((row) => row.status));
  const completeCount = counts.complete;
  const cardStatus: PropertySetupCardStatus =
    completeCount === CARD3_DOMAINS.length
      ? "complete"
      : completeCount > 0 || counts.inProgress > 0
        ? "in_progress"
        : "not_started";
  const currentIndex = CARD3_DOMAINS.findIndex((row) => row.id === activeDomain);
  const previousDomain = currentIndex > 0 ? CARD3_DOMAINS[currentIndex - 1] : undefined;
  const nextDomain = currentIndex >= 0 ? CARD3_DOMAINS[currentIndex + 1] : undefined;

  function goBackToHub() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function saveAndAdvance() {
    if (draftSave?.dirty) {
      setContinuing(true);
      try {
        await draftSave.save();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
        setContinuing(false);
        return;
      }
      setContinuing(false);
    }
    if (nextDomain) {
      setActiveDomain(nextDomain.id);
      return;
    }
    goBackToHub();
  }

  const domainProps = {
    restaurantId,
    canEdit,
    domain,
    onBack: previousDomain ? () => setActiveDomain(previousDomain.id) : goBackToHub,
  };

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card3-workspace"
      data-card-fullscreen="true"
    >
      <div className="min-w-0 flex-1" data-testid="pms-card3-fullscreen">
        <Card3DraftSaveProvider register={registerDraftSave}>
          <PropertySetupWorkspaceShell
            cardNumber={3}
            status={cardStatus}
            description={CARD3_SUBTITLE}
            sections={railSections}
            complete={counts.complete}
            inProgress={counts.inProgress}
            notStarted={counts.notStarted}
            onBack={previousDomain ? () => setActiveDomain(previousDomain.id) : goBackToHub}
            onSaveDraft={canEdit ? () => void draftSave?.save() : undefined}
            onContinue={() => void saveAndAdvance()}
            saveDraftDisabled={
              !canEdit || !draftSave?.dirty || Boolean(draftSave?.pending) || continuing
            }
            continueDisabled={!canEdit || continuing || Boolean(draftSave?.pending)}
            continuePending={continuing}
            saveDraftPending={Boolean(draftSave?.pending)}
            dirty={Boolean(draftSave?.dirty)}
            footerTestId="pms-card3-chrome"
            footer={canEdit ? undefined : null}
            stepNav={
              <div data-testid="pms-card3-steps">
                <PropertySetupStepNav
                  activeId={activeDomain}
                  onSelect={(id) => setActiveDomain(id as Card3DomainId)}
                  steps={CARD3_DOMAINS.map((item, index) => ({
                    id: item.id,
                    number: index + 1,
                    title: item.title,
                    status: domainStatuses[item.id],
                  }))}
                />
              </div>
            }
            rail={
              <div data-testid="pms-card3-status-rail">
                <PropertySetupStatusRail
                  sections={railSections}
                  complete={counts.complete}
                  inProgress={counts.inProgress}
                  notStarted={counts.notStarted}
                />
              </div>
            }
          >
            {readinessLoading ? (
              <p className="text-sm text-muted-foreground">Loading configuration readiness</p>
            ) : null}
            {domain?.id === "currency-financial-settings" ? (
              <PmsPropertySetupCard3Currency {...domainProps} />
            ) : domain?.id === "taxes-fees" ? (
              <PmsPropertySetupCard3Taxes {...domainProps} />
            ) : domain?.id === "rates-pricing" ? (
              <PmsPropertySetupCard3Rates {...domainProps} />
            ) : domain?.id === "meal-plans-packages" ? (
              <PmsPropertySetupCard3Meals {...domainProps} />
            ) : domain?.id === "payments-deposits" ? (
              <PmsPropertySetupCard3Payments {...domainProps} />
            ) : domain?.id === "billing-invoicing" ? (
              <PmsPropertySetupCard3Billing {...domainProps} />
            ) : domain?.id === "corporate-contract-rates" ? (
              <PmsPropertySetupCard3Corporate {...domainProps} />
            ) : domain?.id === "revenue-commercial-rules" ? (
              <PmsPropertySetupCard3Commercial {...domainProps} />
            ) : (
              <PmsPropertySetupCard3Workspace domain={domain}>
                <p className="text-sm text-muted-foreground">This workspace is unavailable.</p>
              </PmsPropertySetupCard3Workspace>
            )}
          </PropertySetupWorkspaceShell>
        </Card3DraftSaveProvider>
      </div>
    </section>
  );
}
