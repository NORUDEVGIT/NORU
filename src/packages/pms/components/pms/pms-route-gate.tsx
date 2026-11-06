import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import type { PmsPermissionCode } from "@/packages/pms/lib/pms-permissions";
import { getFirstAccessiblePmsRoute } from "@/packages/pms/lib/pms-client-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";

/**
 * Direct URL protection. Loading does not redirect.
 * A denied module shows the no-access panel. PMS Home may send the caller
 * to the first module they can open instead of leaving them on a blank page.
 */
export function PmsRouteGate({
  restaurantId,
  allow,
  allowAny,
  fallback = "denied",
  children,
}: {
  restaurantId: string;
  allow?: PmsPermissionCode;
  allowAny?: readonly PmsPermissionCode[];
  fallback?: "denied" | "first-module";
  children: ReactNode;
}) {
  const access = usePmsPermissions(restaurantId);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const allowed = access.isLoading || access.isError
    ? false
    : allowAny
      ? access.canAny(allowAny)
      : allow
        ? access.can(allow)
        : false;
  const next =
    !access.isLoading && !access.isError && !allowed && fallback === "first-module"
      ? getFirstAccessiblePmsRoute(
          { isOwner: access.isOwner, codes: access.permissions },
          pathname,
        )
      : null;

  useEffect(() => {
    if (!next || next === pathname) return;
    void navigate({ to: next, replace: true });
  }, [navigate, next, pathname]);

  if (access.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Checking access…</p>;
  }
  if (access.isError) {
    return (
      <PmsAccessDenied
        title="Access could not be checked"
        message="Permission data did not load. Refresh the page. Nothing on this screen was opened."
      />
    );
  }
  if (!allowed) {
    if (next && next !== pathname) {
      return <p className="p-6 text-sm text-muted-foreground">Opening a module you can use…</p>;
    }
    return <PmsAccessDenied />;
  }
  return children;
}

export function PmsAccessDenied({
  title = "You don't have access to this module",
  message = "Your permissions don't include this screen. Ask a colleague with Staff & Access to grant it.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="p-6" data-testid="pms-access-denied">
      <div className="max-w-lg rounded-2xl border border-[#E6E1D8] bg-white p-6">
        <h1 className="font-display text-xl text-[#251605]">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
