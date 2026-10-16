import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Tiny hash router for the public marketing site (`/#product/pms`, `/#resources/contact`).
 * It lives entirely inside the home route, so no new TanStack routes are needed.
 */
export type PageId = "home" | "product" | "solutions" | "pricing" | "resources";

export interface Route {
  page: PageId;
  anchor?: string | undefined;
}

const PAGES: readonly PageId[] = ["home", "product", "solutions", "pricing", "resources"];

export function parseHash(hash: string): Route {
  const [rawPage = "", anchor] = hash.replace(/^#/, "").split("/");
  const page = PAGES.find((p) => p === rawPage) ?? "home";
  return { page, anchor: anchor || undefined };
}

export function hrefFor(page: PageId, anchor?: string): string {
  if (page === "home") return "#";
  return `#${page}${anchor ? `/${anchor}` : ""}`;
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

export function useNavigate(): (page: PageId, anchor?: string) => void {
  return useCallback((page: PageId, anchor?: string) => {
    const next = hrefFor(page, anchor);
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
  }, [route.page, route.anchor]);
}

export const DEMO_EVENT = "noru:demo";

/** "Request Demo" opens the contact form and resets it, even if it is already open. */
export function useRequestDemo(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    navigate("resources", "contact");
    window.dispatchEvent(new Event(DEMO_EVENT));
  }, [navigate]);
}
