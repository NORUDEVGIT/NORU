import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy reservation detail URL kept for bookmarks and deep links.
 * The canonical address is /restaurant/pms/reservations/$reservationId.
 */
export const Route = createFileRoute("/restaurant/bookings/$reservationId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/restaurant/pms/reservations/$reservationId",
      params: { reservationId: params.reservationId },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "This reservation has moved into the NORU PMS Reservations workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
