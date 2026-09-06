import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy URL kept for backward compatibility.
 * The canonical address is /restaurant/pms/reservations; any query string is preserved.
 */
export const Route = createFileRoute("/restaurant/bookings/reservations")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => search as { tab?: string },
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/restaurant/pms/reservations", search, replace: true });
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
