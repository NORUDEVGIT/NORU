import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingPackagesForm } from "@/core/components/admin/marketing-packages-form";

export const Route = createFileRoute("/admin/marketing/packages")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Marketing packages"
        description="Presentation cards only. This page never calls entitlement APIs or assigns packages to a property."
      >
        <MarketingPackagesForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
