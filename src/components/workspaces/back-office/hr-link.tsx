/**
 * Phase 8G2D — cross-package link from operational staffing screens to the
 * canonical Back Office · Human Resources home.
 *
 * Presentation only. It appears when Back Office is switched on for the
 * property AND the person already holds Human Resources access, so it can
 * never grant or hint at anything they don't already have.
 *
 * Lives in its own module (not `hr-pages.tsx`) so the shared workforce
 * workspace can use it without importing the Back Office pages that render
 * that workspace.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import { usePackageEntitlements } from "@/lib/use-package-entitlements";

export function BackOfficeHrLink({ restaurantId }: { restaurantId: string }) {
  const packages = usePackageEntitlements(restaurantId);
  const fetchModuleAccess = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModuleAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (!packages.has("back_office")) return null;
  if (!access.data?.modules.includes("human_resources")) return null;

  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/restaurant/back-office/hr">Open in Back Office · Human Resources</Link>
    </Button>
  );
}
