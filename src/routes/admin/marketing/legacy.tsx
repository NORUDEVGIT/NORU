import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingLegacyForm } from "@/core/components/admin/marketing-legacy-form";

export const Route = createFileRoute("/admin/marketing/legacy")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Advanced / Legacy"
        description="Older MarketingContent fields kept for compatibility. They are not the current public landing editor."
      >
        <MarketingLegacyForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
