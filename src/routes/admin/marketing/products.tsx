import { createFileRoute } from "@tanstack/react-router";
import {
  MarketingAdminLayout,
  MarketingPage,
} from "@/core/components/admin/marketing-admin-layout";
import {
  marketingAdminHead,
  requireAdminSession,
} from "@/core/components/admin/marketing-admin-gate";
import { SiteProductsForm } from "@/core/components/admin/marketing-noru-site-forms";

export const Route = createFileRoute("/admin/marketing/products")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Products"
        description="Public product cards and detail pages. These are not package entitlements."
      >
        <SiteProductsForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
