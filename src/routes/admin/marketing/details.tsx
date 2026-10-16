import { createFileRoute } from "@tanstack/react-router";
import {
  MarketingAdminLayout,
  MarketingPage,
} from "@/core/components/admin/marketing-admin-layout";
import {
  marketingAdminHead,
  requireAdminSession,
} from "@/core/components/admin/marketing-admin-gate";
import { SiteDetailsForm } from "@/core/components/admin/marketing-noru-site-forms";

export const Route = createFileRoute("/admin/marketing/details")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Hero and footer"
        description="Tagline, Amharic line, and footer contact details. The hero animation itself stays in code."
      >
        <SiteDetailsForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
