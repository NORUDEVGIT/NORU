import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import {
  CARD1_PMS_NAV,
  propertySetupStatusLabel,
  type PropertySetupCardStatus,
} from "@/packages/pms/lib/pms-property-setup-card1";
import {
  CARD3_DOMAIN_PLACEHOLDER,
  CARD3_DOMAINS,
  CARD3_PROGRESS_DETAIL,
  CARD3_PROGRESS_LABEL,
  CARD3_SIDEBAR_OUT,
  CARD3_SUBTITLE,
  CARD3_WORKSPACE_TITLE,
  type Card3DomainId,
} from "@/packages/pms/lib/pms-property-setup-card3";
import {
  Card3DomainIcon,
  PmsPropertySetupCard3Workspace,
} from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { PmsPropertySetupCard3Currency } from "@/packages/pms/components/settings/pms-property-setup-card3-currency";
import { PmsPropertySetupCard3Taxes } from "@/packages/pms/components/settings/pms-property-setup-card3-taxes";
import { PmsPropertySetupCard3Rates } from "@/packages/pms/components/settings/pms-property-setup-card3-rates";
import { PmsPropertySetupCard3Meals } from "@/packages/pms/components/settings/pms-property-setup-card3-meals";
import { PmsPropertySetupCard3Payments } from "@/packages/pms/components/settings/pms-property-setup-card3-payments";
import { PmsPropertySetupCard3Billing } from "@/packages/pms/components/settings/pms-property-setup-card3-billing";
import { PmsPropertySetupCard3Corporate } from "@/packages/pms/components/settings/pms-property-setup-card3-corporate";
import { getCurrencyCard3 } from "@/packages/pms/lib/currency-card3.functions";
import { getTaxesCard3 } from "@/packages/pms/lib/taxes-card3.functions";
import { getRatesCard3 } from "@/packages/pms/lib/rates-card3.functions";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { getPaymentsCard3 } from "@/packages/pms/lib/payments-card3.functions";
import { getBillingCard3 } from "@/packages/pms/lib/billing-card3.functions";
import { getCorporateCard3 } from "@/packages/pms/lib/corporate-card3.functions";

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
  const readinessLoading =
    currencyQuery.isLoading ||
    taxesQuery.isLoading ||
    ratesQuery.isLoading ||
    mealsQuery.isLoading ||
    paymentsQuery.isLoading ||
    billingQuery.isLoading ||
    corporateQuery.isLoading;
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
  const completeCount = [
    currencyStatus,
    taxesStatus,
    ratesStatus,
    mealsStatus,
    paymentsStatus,
    billingStatus,
    corporateStatus,
  ].filter((status) => status === "complete").length;
  const progressPct = Math.round((completeCount / CARD3_DOMAINS.length) * 100);
  const progressLabel = readinessLoading
    ? "Loading"
    : completeCount === 0
      ? CARD3_PROGRESS_LABEL
      : "In Progress";
  const progressDetail = readinessLoading
    ? "Checking configuration readiness…"
    : completeCount === 0
      ? CARD3_PROGRESS_DETAIL
      : `${completeCount} of 8 domains configured`;

  function goBackToHub() {
    window.location.hash = "";
    window.history.replaceState(null, "", SET1_HUB_HREF);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <section
      className="min-h-[calc(100dvh-3.75rem)] bg-[#f7f4ef]"
      data-testid="pms-card3-workspace"
      data-card-fullscreen="true"
    >
      <div className="sr-only">{CARD3_SIDEBAR_OUT}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid="pms-card3-top-nav"
        aria-label="PMS"
      >
        {CARD1_PMS_NAV.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2 focus-visible:ring-offset-[#251605]",
              item.id === "settings"
                ? "bg-[#C89933] text-[#251605]"
                : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="px-4 py-5 sm:px-6" data-testid="pms-card3-fullscreen">
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl text-[#251605]">{CARD3_WORKSPACE_TITLE}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{CARD3_SUBTITLE}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={goBackToHub}
                className="focus-visible:ring-[#C89933]"
              >
                Back to Property Setup
              </Button>
            </div>

            <section
              className="rounded-2xl border border-[#E6D7B8] bg-white p-5 shadow-sm"
              aria-labelledby="card3-progress-heading"
              data-testid="pms-card3-progress"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="card3-progress-heading" className="font-display text-lg text-[#251605]">
                  Configuration Progress
                </h2>
                <span className="rounded-full border border-[#CCCCCC] bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {progressLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{progressDetail}</p>
              <div
                className={cn(
                  "mt-3 h-2 overflow-hidden rounded-full bg-[#EFE8DC]",
                  readinessLoading && "animate-pulse",
                )}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={readinessLoading ? undefined : progressPct}
                aria-valuetext={
                  readinessLoading
                    ? "Loading configuration readiness"
                    : `${progressPct}% ${progressLabel}`
                }
              >
                <div
                  className="h-full rounded-full bg-[#C89933]"
                  style={{ width: readinessLoading ? "35%" : `${progressPct}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-[#251605]">
                {readinessLoading ? "Loading…" : `${progressPct}% · ${progressLabel}`}
              </p>
            </section>

            <div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              data-testid="pms-card3-domain-grid"
            >
              {CARD3_DOMAINS.map((item) => {
                const status: PropertySetupCardStatus =
                  item.id === "currency-financial-settings"
                    ? currencyStatus
                    : item.id === "taxes-fees"
                      ? taxesStatus
                      : item.id === "rates-pricing"
                        ? ratesStatus
                        : item.id === "meal-plans-packages"
                          ? mealsStatus
                          : item.id === "payments-deposits"
                            ? paymentsStatus
                            : item.id === "billing-invoicing"
                              ? billingStatus
                              : item.id === "corporate-contract-rates"
                                ? corporateStatus
                                : "not_started";
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
                    <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.description}</p>
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
      </div>
    </section>
  );
}
