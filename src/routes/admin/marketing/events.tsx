import { createFileRoute } from "@tanstack/react-router";
import {
  MarketingAdminLayout,
  MarketingPage,
} from "@/core/components/admin/marketing-admin-layout";
import {
  marketingAdminHead,
  requireAdminSession,
} from "@/core/components/admin/marketing-admin-gate";
import { SiteEventsForm } from "@/core/components/admin/marketing-noru-site-forms";

export const Route = createFileRoute("/admin/marketing/events")({
  ssr: false,
  beforeLoad: requireAdminSession,
  head: marketingAdminHead,
  component: () => (
    <MarketingAdminLayout>
      <MarketingPage title="Events" description="Events We Attend. Title, date label, location, and note. This is not a full blog.">
        <SiteEventsForm />
      </MarketingPage>
    </MarketingAdminLayout>
  ),
});
