import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveCashieringTab } from "@/packages/pms/lib/cashiering-shell";

/**
 * Legacy URL kept for backward compatibility.
 * The canonical address is /restaurant/pms/cashiering; the tab query is mapped onto the desk.
 */
export const Route = createFileRoute("/restaurant/cashiering/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {}),
    ...(typeof search["folio"] === "string" ? { folio: search["folio"] as string } : {}),
  }),
  beforeLoad: ({ search }) => {
    const tab = resolveCashieringTab(typeof search.tab === "string" ? search.tab : undefined);
    throw redirect({
      to: "/restaurant/pms/cashiering",
      search: {
        tab,
        ...(typeof search.folio === "string" ? { folio: search.folio } : {}),
      },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "This page has moved into the NORU PMS workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
