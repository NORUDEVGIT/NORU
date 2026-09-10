import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingNavForm } from "@/core/components/admin/marketing-nav-form";

export const Route = createFileRoute("/admin/marketing/nav")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Navigation"
        description="Allowlisted public routes only. Sign In, Sign Up, and Register stay on the site."
      >
        <MarketingNavForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
