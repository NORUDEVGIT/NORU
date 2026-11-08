import { createFileRoute } from "@tanstack/react-router";
import { retiredMarketingTo } from "@/core/components/admin/marketing-retired-redirect";

export const Route = createFileRoute("/admin/marketing/nav")({
  ssr: false,
  beforeLoad: retiredMarketingTo("/admin/marketing/header"),
});
