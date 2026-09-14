import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility path from Reservations. Canonical Guest Profile is /restaurant/pms/guests/$guestId.
 */
export const Route = createFileRoute("/restaurant/pms/reservations/guests/$guestId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/restaurant/pms/guests/$guestId",
      params: { guestId: params.guestId },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      { name: "description", content: "Guest profiles now live in the NORU PMS Guest Profile module." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
