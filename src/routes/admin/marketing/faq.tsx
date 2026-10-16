import { createFileRoute } from "@tanstack/react-router";
import {
  MarketingAdminLayout,
  MarketingPage,
} from "@/core/components/admin/marketing-admin-layout";
import {
  marketingAdminHead,
  requireAdminSession,
} from "@/core/components/admin/marketing-admin-gate";
import { SiteFaqForm } from "@/core/components/admin/marketing-noru-site-forms";

export const Route = createFileRoute("/admin/marketing/faq")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="FAQ"
        description="Homepage questions. Inactive items stay in the draft and are omitted from the public page."
      >
        <SiteFaqForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
