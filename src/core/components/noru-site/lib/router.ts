import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Tiny hash router for the public marketing site (`/#product/pms`, `/#resources/contact`).
 * It lives entirely inside the home route, so no new TanStack routes are needed.
 */
export type PageId = "home" | "product" | "solutions" | "pricing" | "resources";

export interface Route {
  page: PageId;
  anchor?: string | undefined;
  detail?: string | undefined;
}

const PAGES: readonly PageId[] = ["home", "product", "solutions", "pricing", "resources"];

export function parseHash(hash: string): Route {
  const [rawPage = "", anchor, detail] = hash.replace(/^#/, "").split("/");
  const page = PAGES.find((p) => p === rawPage) ?? "home";
  return { page, anchor: anchor || undefined, detail: detail || undefined };
}

export function hrefFor(page: PageId, anchor?: string, detail?: string): string {
  if (page === "home") return "#";
  const path = `#${page}${anchor ? `/${anchor}` : ""}`;
  return detail ? `${path}/${detail}` : path;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

/** The server renders the home page (empty hash); the browser then switches to the real hash. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return parseHash(hash);
}

export function useNavigate(): (page: PageId, anchor?: string, detail?: string) => void {
  return useCallback((page: PageId, anchor?: string, detail?: string) => {
    const next = hrefFor(page, anchor, detail);
    const target = next === "#" ? "" : next;
    if (window.location.hash === target) {
      window.scrollTo(0, 0);
      return;
    }
    window.location.hash = target;
  }, []);
}

export function useScrollToTop(route: Route): void {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, route.anchor, route.detail]);
}

export const DEMO_EVENT = "noru:demo";

let demoMarkedAt = 0;

export function markDemoRequest(): void {
  demoMarkedAt = Date.now();
}

export function isDemoRequestNavigation(): boolean {
  return Date.now() - demoMarkedAt < 1000;
}

/** "Request Demo" opens the contact form and resets it, even if it is already open. */
export function useRequestDemo(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    markDemoRequest();
    navigate("resources", "contact");
    window.dispatchEvent(new Event(DEMO_EVENT));
  }, [navigate]);
}
