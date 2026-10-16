import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/pms/distribution/aiosell/reservations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAiosellReservationWebhook } =
          await import("@/packages/pms/lib/distribution/aiosell-reservation.server");
        return handleAiosellReservationWebhook(request);
      },
    },
  },
});
