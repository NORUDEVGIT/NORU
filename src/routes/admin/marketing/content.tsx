import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingContentForms } from "@/core/components/admin/marketing-content-forms";

export const Route = createFileRoute("/admin/marketing/content")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Social proof & content"
        description="Partners, testimonials, case studies, and blog. Empty is correct until you have real entries."
      >
        <MarketingContentForms />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
