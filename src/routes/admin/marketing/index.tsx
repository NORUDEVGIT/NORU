import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingOverview } from "@/core/components/admin/marketing-overview";

export const Route = createFileRoute("/admin/marketing/")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Overview"
        description="Draft, validate, and publish the marketing stub. Public landing still uses the seed."
      >
        <MarketingOverview />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
