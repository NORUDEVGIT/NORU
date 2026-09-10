import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingPricingForm } from "@/core/components/admin/marketing-pricing-form";

export const Route = createFileRoute("/admin/marketing/pricing")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage title="Pricing" description="Display-only pricing copy. Not a billed price list.">
        <MarketingPricingForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
