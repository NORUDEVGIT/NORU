import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy guest profile URL kept for bookmarks and deep links.
 * The canonical address is /restaurant/pms/reservations/guests/$guestId.
 */
export const Route = createFileRoute("/restaurant/guests/$guestId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/restaurant/pms/reservations/guests/$guestId",
      params: { guestId: params.guestId },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "This guest profile has moved into the NORU PMS Reservations workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
