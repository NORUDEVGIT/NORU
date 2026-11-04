export const PMS_DASHBOARD_PATH = "/restaurant/pms/dashboard";
export const PMS_DEFAULT_WORKSPACE_PATH = "/restaurant/pms/front-office";
export const PMS_IDLE_MS = 10 * 60 * 1000;

const LAST_WORKSPACE_PREFIX = "noru.pms.lastWorkspace.v1.";

export function isPmsWelcomePath(pathname: string): boolean {
  return (
    pathname === PMS_DASHBOARD_PATH ||
    pathname === `${PMS_DASHBOARD_PATH}/` ||
    pathname === "/restaurant/pms" ||
    pathname === "/restaurant/pms/"
  );
}

export function isPmsSurfacePath(pathname: string): boolean {
  return pathname.startsWith("/restaurant/pms") || pathname.startsWith("/restaurant/settings");
}

export function lastWorkspaceStorageKey(restaurantId: string): string {
  return `${LAST_WORKSPACE_PREFIX}${restaurantId}`;
}

export function readLastPmsWorkspace(restaurantId: string): string {
  if (typeof window === "undefined") return PMS_DEFAULT_WORKSPACE_PATH;
  try {
    const stored = window.localStorage.getItem(lastWorkspaceStorageKey(restaurantId))?.trim();
    if (!stored) return PMS_DEFAULT_WORKSPACE_PATH;
    const path = stored.split("?")[0] ?? stored;
    if (!isPmsSurfacePath(path) || isPmsWelcomePath(path)) return PMS_DEFAULT_WORKSPACE_PATH;
    return stored;
  } catch {
    return PMS_DEFAULT_WORKSPACE_PATH;
  }
}

export function writeLastPmsWorkspace(restaurantId: string, href: string): void {
  if (typeof window === "undefined") return;
  const [path = ""] = href.split("?");
  if (!isPmsSurfacePath(path) || isPmsWelcomePath(path)) return;
  try {
    window.localStorage.setItem(lastWorkspaceStorageKey(restaurantId), href);
  } catch {
    /* ignore quota / private mode */
  }
}

export function currentPmsHref(): string {
  if (typeof window === "undefined") return PMS_DEFAULT_WORKSPACE_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function hasBlockingPmsDialog(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ),
  );
}
