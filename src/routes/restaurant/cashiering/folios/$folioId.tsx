import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy folio URL. The canonical page is /restaurant/pms/cashiering/folios/$folioId. */
export const Route = createFileRoute("/restaurant/cashiering/folios/$folioId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/restaurant/pms/cashiering/folios/$folioId",
      params: { folioId: params.folioId },
      replace: true,
    });
  },
  head: () => ({
    meta: [{ title: "Redirecting — NORU PMS" }, { name: "robots", content: "noindex" }],
  }),
  component: () => null,
});
