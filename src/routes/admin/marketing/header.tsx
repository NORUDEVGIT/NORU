import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingHeaderForm } from "@/core/components/admin/marketing-header-form";

export const Route = createFileRoute("/admin/marketing/header")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Header & Navigation"
        description="Brand, stored navigation, Sign In protection, and the Request Demo button. Product and solution menus follow those landing sections."
      >
        <MarketingHeaderForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
