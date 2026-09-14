import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility path. Canonical Guest Profile directory is /restaurant/pms/guests.
 */
export const Route = createFileRoute("/restaurant/guests/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: "/restaurant/pms/guests",
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Redirecting — NORU PMS" },
      {
        name: "description",
        content: "Guest profiles now live in the NORU PMS Guest Profile module.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => null,
});
