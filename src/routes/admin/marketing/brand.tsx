import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingBrandForm } from "@/core/components/admin/marketing-brand-form";

export const Route = createFileRoute("/admin/marketing/brand")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage title="Brand & hero" description="Logo, SEO, hero copy, and allowlisted calls to action.">
        <MarketingBrandForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
