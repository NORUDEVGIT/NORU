import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingSiteForms } from "@/core/components/admin/marketing-site-forms";

export const Route = createFileRoute("/admin/marketing/site")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage title="Site chrome" description="Footer, contact, FAQ, and optional promo banners.">
        <MarketingSiteForms />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
