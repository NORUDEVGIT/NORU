import { redirect } from "@tanstack/react-router";
import { requireAdminSession } from "@/core/components/admin/marketing-admin-gate";

type RetiredTarget = "/admin/marketing/header" | "/admin/marketing/hero" | "/admin/marketing/legacy";

export function retiredMarketingTo(to: RetiredTarget) {
  return async () => {
    await requireAdminSession();
    throw redirect({ to });
  };
}
