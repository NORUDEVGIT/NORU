import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingCtaForm } from "@/core/components/admin/marketing-cta-form";

export const Route = createFileRoute("/admin/marketing/cta")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Final CTA"
        description="The Request Demo band at the bottom of the landing page. Empty fields keep the current public copy until you edit them."
      >
        <MarketingCtaForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
