import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReservationServiceCharges } from "@/packages/pms/lib/reservation-service-charges.functions";
import { serviceLineFigures } from "@/packages/pms/lib/reservation-service-lines";
import { useServiceChargeRules } from "@/packages/pms/lib/use-service-charge-rules";

export function reservationServiceChargesKey(restaurantId: string, reservationId: string) {
  return ["reservation-service-charges", restaurantId, reservationId] as const;
}

/** Priced reservation services with taxed figures; pendingTotal excludes lines already on the folio. */
export function useReservationServiceCharges(
  restaurantId: string,
  reservationId: string | null | undefined,
  enabled = true,
) {
  const fetchCharges = useServerFn(listReservationServiceCharges);
  const rules = useServiceChargeRules(restaurantId, enabled);
  const query = useQuery({
    queryKey: reservationServiceChargesKey(restaurantId, reservationId ?? ""),
    queryFn: () => fetchCharges({ data: { restaurantId, reservationId: reservationId! } }),
    enabled: enabled && Boolean(reservationId),
    retry: false,
  });
  const lines = useMemo(
    () =>
      (query.data ?? []).map((charge) => ({
        charge,
        figures: serviceLineFigures(
          {
            pricingUnit: charge.pricingUnit,
            unitAmount: charge.unitAmount,
            quantity: charge.quantity,
            departmentId: charge.departmentId,
          },
          rules.data,
        ),
      })),
    [query.data, rules.data],
  );
  const pendingTotal = useMemo(
    () =>
      Math.round(
        lines.reduce(
          (sum, row) => sum + (row.charge.folioTransactionId ? 0 : (row.figures.total ?? 0)),
          0,
        ) * 100,
      ) / 100,
    [lines],
  );
  const total = useMemo(
    () => Math.round(lines.reduce((sum, row) => sum + (row.figures.total ?? 0), 0) * 100) / 100,
    [lines],
  );
  return { query, rules, lines, pendingTotal, total };
}
