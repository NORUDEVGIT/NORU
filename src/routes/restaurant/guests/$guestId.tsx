import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility path. Canonical Guest Profile is /restaurant/pms/guests/$guestId.
 */
export const Route = createFileRoute("/restaurant/guests/$guestId")({
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
      {
        name: "description",
        content: "This guest profile now lives in the NORU PMS Guest Profile module.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
