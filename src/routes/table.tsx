import { createFileRoute } from "@tanstack/react-router";
import { LegacyOrderRedirect } from "@/components/legacy-order-redirect";

export const Route = createFileRoute("/table")({
  head: () => ({
    meta: [
      { title: "Redirecting — Order to Your Table" },
      { name: "description", content: "This page has moved to your restaurant's ordering pages." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <LegacyOrderRedirect page="table" />,
});
