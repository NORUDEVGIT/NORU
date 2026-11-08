import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingFooterForm } from "@/core/components/admin/marketing-footer-form";

export const Route = createFileRoute("/admin/marketing/footer")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Footer"
        description="Contact, social, legal, and copyright. Product and solution columns follow those landing sections."
      >
        <MarketingFooterForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
