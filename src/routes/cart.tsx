import { createFileRoute } from "@tanstack/react-router";
import { LegacyOrderRedirect } from "@/packages/restaurant-management/components/legacy-order-redirect";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Redirecting — Order to Your Table" },
      { name: "description", content: "This page has moved to your restaurant's ordering pages." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LegacyOrderRedirect page="cart" />,
});
