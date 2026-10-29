import { useEffect, useState } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import {
  GROUP_PACKAGE_NOTE,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { packageChargeFigures, type RoomChargeRules } from "@/packages/pms/lib/room-charge-guest-total";
import { usePackageChargeRules } from "@/packages/pms/lib/use-package-charge-rules";
import { ReservationPackageMerchandiseGrid } from "@/packages/pms/components/bookings/reservation-package-merchandise";
import {
  appliedPackageAmountDisplay,
  appliedPackageDescription,
  buildUnitPackageCards,
  cataloguePackageById,
  chargeBasisHonestyCopy,
  chargeTypeLabel,
  emptyPackageFilters,
  filterAvailablePackages,
  packageInclusionLabel,
  packageScopeLabel,
  reservationUnitPackageLabel,
  uniquePackageFilterOptions,
  type PackageFilters,
  type UnitPackageManagementRow,
} from "@/packages/pms/lib/reservation-detail-packages";
import { parsePackageChargeBasis } from "@/packages/pms/lib/meals-card3.server";
import { stayRoomUnitId } from "@/packages/pms/lib/reservation-detail-guest";
import { releaseReservationRoomPackage } from "@/packages/pms/lib/reservation-detail-controls.functions";
import {
  applyReservationRoomPackage,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { getReservationUnitPackages } from "@/packages/pms/lib/revenue/commercial-package.functions";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";
const ALL = "__all";

export function ReservationDetailPackagesTab({
  restaurantId,
  reservation,
  canManage,
  money,
  paymentReceived = null,
  paymentRefunded = null,
  guestDeposit = null,
  totalAmount,
  coverUrl,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  coverUrl: string | null;
}) {
  const packageChargeRules = usePackageChargeRules(restaurantId);
  const fetchCatalogue = useServerFn(getMealsCard3);
  const fetchUnitPackages = useServerFn(getReservationUnitPackages);
  const submitApply = useServerFn(applyReservationRoomPackage);
  const submitRelease = useServerFn(releaseReservationRoomPackage);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<PackageFilters>(emptyPackageFilters);
  const [unitId, setUnitId] = useState(stayRoomUnitId(reservation) ?? "");
  useEffect(() => {
    setUnitId((current) =>
      (reservation.rooms ?? []).some((unit) => unit.id === current)
        ? current
        : (stayRoomUnitId(reservation) ?? ""),
    );
  }, [reservation]);
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const currency = reservation.currency?.trim() || "ETB";
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const selectedUnit = (reservation.rooms ?? []).find((unit) => unit.id === unitId) ?? null;

  const catalogueQuery = useQuery({
    queryKey: ["meals-card3", restaurantId, "reservation-detail-packages"],
    queryFn: () => fetchCatalogue({ data: { restaurantId } }),
    retry: false,
  });
  const unitQuery = useQuery({
    queryKey: ["reservation-unit-packages", restaurantId, reservation.id, unitId],
    queryFn: () =>
      fetchUnitPackages({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: unitId,
        },
      }),
    enabled: Boolean(unitId),
    retry: false,
  });

  const catalogue = catalogueQuery.data?.snapshot.packages ?? [];
  const components = catalogueQuery.data?.snapshot.components ?? [];
  const unitRead = unitQuery.data;
  const applied = unitRead?.packages ?? [];
  const cards = buildUnitPackageCards({
    catalogue,
    components,
    eligibility: unitRead?.eligibility ?? [],
    ratePlanId: unitRead?.ratePlanId ?? null,
  });
  const options = uniquePackageFilterOptions(cards);
  const visible = filterAvailablePackages(cards, filters);
  const packageRules = packageChargeRules.data ?? null;
  const guestPackageAmount = (amount: number) => packageChargeFigures(amount, packageRules).total;
  const unitPackageTotal = applied
    .filter((row) => row.scope !== "stay")
    .reduce((sum, row) => sum + guestPackageAmount(row.appliedAmount), 0);
  const stayPackageTotal = applied
    .filter((row) => row.scope === "stay")
    .reduce((sum, row) => sum + guestPackageAmount(row.appliedAmount), 0);
  const unitLabel =
    unitRead?.unitLabel ??
    (selectedUnit
      ? reservationUnitPackageLabel(selectedUnit.unitSequence, selectedUnit.roomNumber)
      : "Room");

  function refreshPackages() {
    void queryClient.invalidateQueries({
      queryKey: ["reservation-unit-packages", restaurantId, reservation.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-commercial", restaurantId, reservation.id],
    });
  }

  const bindPackage = useMutation({
    mutationFn: (activationId: string) => {
      if (!unitId) throw new Error("This stay has no room unit for a package.");
      return submitApply({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: unitId,
          packageActivationId: activationId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Package applied to this room.");
      refreshPackages();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const releasePackage = useMutation({
    mutationFn: (row: UnitPackageManagementRow) => {
      if (!unitId || !row.removeAllowed) {
        throw new Error("That package cannot be removed from this room.");
      }
      return submitRelease({
        data: {
          restaurantId,
          reservationId: reservation.id,
          packageRowId: row.id,
          reservationRoomId: unitId,
          stayScope: row.scope === "stay",
        },
      });
    },
    onSuccess: () => {
      toast.success("Package removed.");
      refreshPackages();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-packages">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Packages for this Reservation</h2>
            <p className="text-xs text-muted-foreground">
              Add or manage packages for the selected room. Stay packages are labeled and apply to
              the whole reservation.
            </p>
            <p className="mt-3 text-sm text-[#251605]" data-testid="packages-selected-unit">
              {unitLabel}
            </p>
            {(reservation.rooms ?? []).length > 1 ? (
              <label className="mt-3 block text-xs text-muted-foreground">
                Room unit
                <select
                  className={`${FIELD} mt-1`}
                  value={unitId}
                  onChange={(event) => setUnitId(event.target.value)}
                >
                  {(reservation.rooms ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {reservationUnitPackageLabel(unit.unitSequence, unit.roomNumber)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {isGroupReservation(reservation) ? (
              <p
                className="mt-2 text-xs text-muted-foreground"
                data-testid="packages-group-eligibility"
              >
                {GROUP_PACKAGE_NOTE}
              </p>
            ) : null}
            {!unitId ? (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="packages-no-unit">
                This stay has no room unit for a package.
              </p>
            ) : null}
          </section>
          <AppliedPackagesCard
            applied={applied}
            catalogue={catalogue}
            ratePlanId={unitRead?.ratePlanId ?? null}
            money={money}
            currency={unitRead?.currency || currency}
            arrival={reservation.arrivalDate}
            departure={reservation.departureDate}
            unitPackageTotal={unitPackageTotal}
            stayPackageTotal={stayPackageTotal}
            loading={unitQuery.isLoading}
            editable={editable}
            packageRules={packageRules}
            onRemove={(row) => releasePackage.mutate(row)}
          />
          <AvailablePackagesCard
            cards={visible}
            filters={filters}
            options={options}
            money={money}
            currency={unitRead?.currency || currency}
            editable={editable}
            loading={Boolean(unitId) && unitQuery.isLoading}
            packageRules={packageRules}
            onFilters={setFilters}
            onAdd={(card) => {
              if (!card.addAllowed || !card.activationId) return;
              bindPackage.mutate(card.activationId);
            }}
          />
        </div>
        <PackagesSummaryRail
          reservation={reservation}
          paymentReceived={paymentReceived}
          paymentRefunded={paymentRefunded}
          guestDeposit={guestDeposit}
          totalAmount={totalAmount}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          packagesTotal={unitPackageTotal + stayPackageTotal}
        />
      </div>
    </div>
  );
}

function AppliedPackagesCard({
  applied,
  catalogue,
  ratePlanId,
  money,
  currency,
  arrival,
  departure,
  unitPackageTotal,
  stayPackageTotal,
  loading,
  editable,
  packageRules,
  onRemove,
}: {
  applied: UnitPackageManagementRow[];
  catalogue: Parameters<typeof appliedPackageDescription>[1];
  ratePlanId: string | null;
  money: (value: number) => string;
  currency: string;
  arrival: string;
  departure: string;
  unitPackageTotal: number;
  stayPackageTotal: number;
  loading: boolean;
  editable: boolean;
  packageRules: RoomChargeRules | null;
  onRemove: (row: UnitPackageManagementRow) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="applied-packages"
    >
      <h2 className="font-display text-base text-[#251605]">Applied Packages</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        This room, plus stay packages labeled for the whole reservation.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading packages…</p>
      ) : applied.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="applied-packages-empty"
        >
          No packages on this room or for the stay.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Package Name</th>
                <th className="py-2 pr-2">Scope</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">Charge Type</th>
                <th className="py-2 pr-2 text-right">Price ({currency})</th>
                <th className="py-2 pr-2 text-right">Quantity</th>
                <th className="py-2 pr-2 text-right">Amount ({currency})</th>
                <th className="py-2 pr-2">Stay Dates</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {applied.map((row, index) => {
                const master = cataloguePackageById(catalogue, row.packageId);
                const configuredBasis = parsePackageChargeBasis(
                  master?.chargeBasis ?? row.chargeBasis,
                );
                const honesty = chargeBasisHonestyCopy(configuredBasis);
                const inclusion = master ? packageInclusionLabel(master, ratePlanId) : null;
                const amount = appliedPackageAmountDisplay({
                  chargeBasis: configuredBasis,
                  unitAmount: row.unitAmount,
                  appliedAmount: row.appliedAmount,
                });
                const figures = packageChargeFigures(amount.amount, packageRules);
                return (
                  <tr key={row.id} className="border-b border-[#F4EEE4]">
                    <td className="py-2 pr-2">{index + 1}</td>
                    <td className="py-2 pr-2">
                      <p>{reviewDash(row.packageName)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {reviewDash(row.packageCode)}
                      </p>
                      {inclusion ? <p className="text-[10px] text-[#5C4A2A]">{inclusion}</p> : null}
                      {row.actorMembershipId ? (
                        <p className="text-[10px] text-muted-foreground">Recorded by staff</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      <p>{packageScopeLabel(row.scope)}</p>
                      {row.scope === "unit" && row.unitLabel ? (
                        <p className="text-[11px] text-muted-foreground">{row.unitLabel}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      {reviewDash(appliedPackageDescription(row, catalogue))}
                      {honesty ? (
                        <p className="mt-0.5 text-[10px] text-amber-900/80">{honesty}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">{reviewDash(chargeTypeLabel(configuredBasis))}</td>
                    <td className="py-2 pr-2 text-right">{money(row.unitAmount)}</td>
                    <td className="py-2 pr-2 text-right">{row.quantity}</td>
                    <td className="py-2 pr-2 text-right">
                      {money(figures.total)}
                      {figures.netAmount !== figures.total ? (
                        <p className="text-[10px] font-normal text-muted-foreground">
                          Net {money(figures.netAmount)}
                        </p>
                      ) : null}
                      {amount.configuredOnly ? (
                        <p className="text-[10px] font-normal text-muted-foreground">Configured</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      {formatStayDate(arrival)} – {formatStayDate(departure)}
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!editable || !row.removeAllowed}
                        onClick={() => onRemove(row)}
                        aria-label={row.scope === "stay" ? "Remove stay package" : "Remove package"}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 space-y-1 text-sm" data-testid="package-commercial-facts">
        <p>Room package snapshot {money(unitPackageTotal)}</p>
        <p>Stay package snapshot {money(stayPackageTotal)}</p>
        <p className="text-[11px] text-muted-foreground">
          These totals include package tax. They stay separate from the room subtotal and from
          posted payments, deposits, refunds, and balance.
        </p>
      </div>
    </section>
  );
}

function AvailablePackagesCard({
  cards,
  filters,
  options,
  money,
  currency,
  editable,
  loading,
  packageRules,
  onFilters,
  onAdd,
}: {
  cards: ReturnType<typeof filterAvailablePackages>;
  filters: PackageFilters;
  options: ReturnType<typeof uniquePackageFilterOptions>;
  money: (value: number) => string;
  currency: string;
  editable: boolean;
  loading: boolean;
  packageRules: RoomChargeRules | null;
  onFilters: (next: PackageFilters) => void;
  onAdd: (card: ReturnType<typeof filterAvailablePackages>[number]) => void;
}) {
  function patch(next: Partial<PackageFilters>) {
    onFilters({ ...filters, ...next });
  }
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="available-packages"
    >
      <h2 className="font-display text-base text-[#251605]">Available Packages</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Eligibility is for the selected room. Add is available only when that room can take the
        package.
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Package Category"
          value={filters.category}
          options={options.categories}
          onChange={(category) => patch({ category })}
        />
        <FilterSelect
          label="Charge Type"
          value={filters.chargeType}
          options={options.chargeTypes}
          onChange={(chargeType) => patch({ chargeType })}
        />
        <FilterSelect
          label="Price Range"
          value={filters.price}
          options={options.prices}
          onChange={(price) => patch({ price })}
        />
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <Input
              className={`${FIELD} pl-7`}
              value={filters.search}
              placeholder="Search packages…"
              onChange={(e) => patch({ search: e.target.value })}
            />
          </div>
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading packages…</p>
      ) : cards.length === 0 ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          data-testid="available-packages-empty"
        >
          No packages are listed for this room.
        </p>
      ) : (
        <ReservationPackageMerchandiseGrid
          cards={cards}
          currency={currency}
          money={money}
          packageRules={packageRules}
          emptyCopy="No packages are listed for this room."
          renderFooter={(card) => (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!editable || card.addAllowed !== true}
              onClick={() => onAdd(card)}
            >
              Add Package
            </Button>
          )}
        />
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
        <SelectTrigger className={FIELD}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All {label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PackagesSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  packagesTotal,
  paymentReceived,
  paymentRefunded,
  guestDeposit,
  totalAmount,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  packagesTotal: number;
  paymentReceived: number | null;
  paymentRefunded: number | null;
  guestDeposit: number | null;
  totalAmount?: number | null;
}) {
  return (
    <ReservationDetailSummary
      testId="reservation-packages-summary"
      reservation={reservation}
      money={money}
      coverUrl={coverUrl}
      nights={nights}
      packagesTotal={packagesTotal}
      paymentReceived={paymentReceived}
      paymentRefunded={paymentRefunded}
      guestDeposit={guestDeposit}
      totalAmount={totalAmount}
    />
  );
}
