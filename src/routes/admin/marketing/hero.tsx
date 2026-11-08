import { createFileRoute } from "@tanstack/react-router";
import { MarketingAdminLayout, MarketingPage } from "@/core/components/admin/marketing-admin-layout";
import { marketingAdminHead, requireAdminSession } from "@/core/components/admin/marketing-admin-gate";
import { MarketingHeroAnimationForm } from "@/core/components/admin/marketing-hero-animation-form";

export const Route = createFileRoute("/admin/marketing/hero")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage
        title="Hero & Animation"
        description="Greeting copy and the MKT-LP01 animation contract. The Three.js scene stays in application code."
      >
        <MarketingHeroAnimationForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
