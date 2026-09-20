import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { propertySetupRailCounts } from "@/packages/pms/lib/pms-property-setup-ui";
import {
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD3_DOMAIN_PLACEHOLDER,
  CARD3_DOMAINS,
  CARD3_SIDEBAR_OUT,
  CARD3_SUBTITLE,
  type Card3DomainId,
} from "@/packages/pms/lib/pms-property-setup-card3";
import {
  Card3DomainIcon,
  PmsPropertySetupCard3Workspace,
} from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  PropertySetupStatusRail,
  PropertySetupWorkspaceShell,
} from "@/packages/pms/components/settings/setup-kit";
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
  const [activeDomain, setActiveDomain] = useState<Card3DomainId | null>(null);
  const domain = CARD3_DOMAINS.find((row) => row.id === activeDomain) ?? null;
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

  function goBackToHub() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <section
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col bg-[#F7F4EE]"
      data-testid="pms-card3-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD3_SIDEBAR_OUT}</div>
      <div className="min-w-0 flex-1" data-testid="pms-card3-fullscreen">
        <PropertySetupWorkspaceShell
          cardNumber={3}
          status={cardStatus}
          description={CARD3_SUBTITLE}
          sections={railSections}
          complete={counts.complete}
          inProgress={counts.inProgress}
          notStarted={counts.notStarted}
          onBack={domain ? () => setActiveDomain(null) : goBackToHub}
          footerTestId="pms-card3-chrome"
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
          {domain?.id === "currency-financial-settings" ? (
            <PmsPropertySetupCard3Currency
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "taxes-fees" ? (
            <PmsPropertySetupCard3Taxes
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "rates-pricing" ? (
            <PmsPropertySetupCard3Rates
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "meal-plans-packages" ? (
            <PmsPropertySetupCard3Meals
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "payments-deposits" ? (
            <PmsPropertySetupCard3Payments
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "billing-invoicing" ? (
            <PmsPropertySetupCard3Billing
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "corporate-contract-rates" ? (
            <PmsPropertySetupCard3Corporate
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain?.id === "revenue-commercial-rules" ? (
            <PmsPropertySetupCard3Commercial
              restaurantId={restaurantId}
              canEdit={canEdit}
              domain={domain}
              onBack={() => setActiveDomain(null)}
            />
          ) : domain ? (
            <PmsPropertySetupCard3Workspace domain={domain} onBack={() => setActiveDomain(null)}>
              <div
                className="rounded-2xl border border-dashed border-[#CCCCCC] bg-white p-8 text-center"
                data-testid="pms-card3-domain-placeholder"
              >
                <p className="text-sm text-muted-foreground">{CARD3_DOMAIN_PLACEHOLDER}</p>
              </div>
            </PmsPropertySetupCard3Workspace>
          ) : (
            <div className="space-y-6">
              <div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                data-testid="pms-card3-domain-grid"
              >
                {CARD3_DOMAINS.map((item) => {
                  const status = domainStatuses[item.id];
                  return (
                    <article
                      key={item.id}
                      className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"
                      data-testid={`pms-card3-domain-card-${item.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#E6D7B8] bg-[#C89933]/10 text-[#251605]">
                          <Card3DomainIcon icon={item.icon} className="size-5" />
                        </span>
                        <span className="shrink-0 rounded-full border border-[#CCCCCC] bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {readinessLoading ? "Loading" : propertySetupStatusLabel(status)}
                        </span>
                      </div>
                      <h2 className="mt-3 font-display text-lg leading-snug text-[#251605]">
                        {item.title}
                      </h2>
                      <p className="mt-2 flex-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full border-[#C89933] text-[#251605] hover:bg-[#C89933]/10 focus-visible:ring-[#C89933] sm:w-auto"
                        onClick={() => setActiveDomain(item.id)}
                      >
                        Open
                      </Button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </PropertySetupWorkspaceShell>
      </div>
    </section>
  );
}
