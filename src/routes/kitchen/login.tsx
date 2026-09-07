import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy compatibility route — restaurant users sign in at /restaurant/login. */
export const Route = createFileRoute("/kitchen/login")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({
      to: "/restaurant/login",
      search: { redirect: "/restaurant/restaurant-management/kitchen" },
      replace: true,
    });
  },
  component: () => null,
});
