import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy URL kept for backward compatibility.
 * Canonical: /restaurant/pms/front-office?tab=departures
 */
export const Route = createFileRoute("/restaurant/rooms/departures")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: "/restaurant/pms/front-office",
      search: { tab: "departures" },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "This page has moved into the NORU PMS Front Office workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
