import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Package,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";

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
import { Textarea } from "@/shared/components/ui/textarea";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  appliedPackageDescription,
  appliedPackagesTotal,
  buildAvailablePackageCards,
  chargeTypeLabel,
  emptyPackageFilters,
  filterAvailablePackages,
  PACKAGE_BIND_GAP_COPY,
  PACKAGE_NOTES_GAP_COPY,
  PACKAGE_NOTES_MAX,
  uniquePackageFilterOptions,
  type PackageFilters,
} from "@/packages/pms/lib/reservation-detail-packages";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import {
  getReservationCommercialAttribution,
  listEligiblePackageActivations,
} from "@/packages/pms/lib/revenue/commercial-package.functions";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";
const ALL = "__all";

export function ReservationDetailPackagesTab({
  restaurantId,
  reservation,
  canManage,
  money,
  coverUrl,
  onBackToRates,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToRates: () => void;
}) {
  const fetchCatalogue = useServerFn(getMealsCard3);
  const fetchEligible = useServerFn(listEligiblePackageActivations);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const [filters, setFilters] = useState<PackageFilters>(emptyPackageFilters);
  const [notes, setNotes] = useState("");
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const currency = reservation.currency?.trim() || "ETB";
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);

  const catalogueQuery = useQuery({
    queryKey: ["meals-card3", restaurantId, "reservation-detail-packages"],
    queryFn: () => fetchCatalogue({ data: { restaurantId } }),
    retry: false,
  });
  const eligibleQuery = useQuery({
    queryKey: [
      "eligible-packages",
      restaurantId,
      reservation.ratePlanId,
      reservation.roomTypeId,
      reservation.arrivalDate,
      reservation.departureDate,
    ],
    queryFn: () =>
      fetchEligible({
        data: {
          restaurantId,
          ratePlanId: reservation.ratePlanId!,
          roomTypeId: reservation.roomTypeId,
          arrivalDate: reservation.arrivalDate,
          departureDate: reservation.departureDate,
          reservationId: reservation.id,
        },
      }),
    enabled: Boolean(reservation.ratePlanId),
    retry: false,
  });
  const commercialQuery = useQuery({
    queryKey: ["reservation-commercial", restaurantId, reservation.id, "packages"],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId: reservation.id,
          roomSubtotal: reservation.roomSubtotal,
        },
      }),
    retry: false,
  });

  const catalogue = catalogueQuery.data?.snapshot.packages ?? [];
  const components = catalogueQuery.data?.snapshot.components ?? [];
  const applied = commercialQuery.data?.packages ?? [];
  const cards = buildAvailablePackageCards({
    catalogue,
    components,
    eligible: eligibleQuery.data ?? [],
    roomTypeId: reservation.roomTypeId,
    ratePlanId: reservation.ratePlanId,
  });
  const options = uniquePackageFilterOptions(cards);
  const visible = filterAvailablePackages(cards, filters);
  const appliedTotal = appliedPackagesTotal(applied);

  function refuseBind() {
    toast.message(PACKAGE_BIND_GAP_COPY);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-packages">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <h2 className="font-display text-base text-[#251605]">Packages for this Reservation</h2>
            <p className="text-xs text-muted-foreground">
              Add or manage packages and special offers to enhance the guest stay.
            </p>
          </section>
          <AppliedPackagesCard
            applied={applied}
            catalogue={catalogue}
            money={money}
            currency={currency}
            arrival={reservation.arrivalDate}
            departure={reservation.departureDate}
            total={appliedTotal}
            editable={editable}
            onAdd={refuseBind}
            onEdit={refuseBind}
            onRemove={refuseBind}
          />
          <AvailablePackagesCard
            cards={visible}
            filters={filters}
            options={options}
            money={money}
            currency={currency}
            editable={editable}
            onFilters={setFilters}
            onAdd={refuseBind}
          />
          <PackageNotesCard value={notes} editable={editable} onChange={setNotes} />
        </div>
        <PackagesSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
          packagesTotal={appliedTotal}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToRates}>
          Back to Rates
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable}
            onClick={() => toast.message(PACKAGE_NOTES_GAP_COPY)}
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNotes("");
              setFilters(emptyPackageFilters());
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppliedPackagesCard({
  applied,
  catalogue,
  money,
  currency,
  arrival,
  departure,
  total,
  editable,
  onAdd,
  onEdit,
  onRemove,
}: {
  applied: Array<{
    id: string;
    packageId: string;
    packageName: string;
    packageCode: string;
    chargeBasis: string;
    quantity: number;
    unitAmount: number;
    appliedAmount: number;
    components: Array<{ componentType?: string }>;
  }>;
  catalogue: Parameters<typeof appliedPackageDescription>[1];
  money: (value: number) => string;
  currency: string;
  arrival: string;
  departure: string;
  total: number;
  editable: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="applied-packages"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Applied Packages</h2>
        <Button type="button" size="sm" disabled={!editable} onClick={onAdd}>
          <Plus className="mr-1 size-3.5" />
          Add Package
        </Button>
      </div>
      {applied.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="applied-packages-empty"
        >
          No packages attached to this reservation.
          <p className="mt-1 text-xs">{PACKAGE_BIND_GAP_COPY}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Package Name</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">Charge Type</th>
                <th className="py-2 pr-2 text-right">Price ({currency})</th>
                <th className="py-2 pr-2 text-right">Quantity</th>
                <th className="py-2 pr-2 text-right">Total ({currency})</th>
                <th className="py-2 pr-2">Stay Dates</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {applied.map((row, index) => (
                <tr key={row.id} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2">{index + 1}</td>
                  <td className="py-2 pr-2">{reviewDash(row.packageName)}</td>
                  <td className="py-2 pr-2">
                    {reviewDash(appliedPackageDescription(row, catalogue))}
                  </td>
                  <td className="py-2 pr-2">{reviewDash(chargeTypeLabel(row.chargeBasis))}</td>
                  <td className="py-2 pr-2 text-right">{money(row.unitAmount)}</td>
                  <td className="py-2 pr-2 text-right">{row.quantity}</td>
                  <td className="py-2 pr-2 text-right">{money(row.appliedAmount)}</td>
                  <td className="py-2 pr-2">
                    {formatStayDate(arrival)} – {formatStayDate(departure)}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!editable}
                        onClick={onEdit}
                        aria-label="Edit package"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!editable}
                        onClick={onRemove}
                        aria-label="Remove package"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-2" colSpan={6}>
                  Total
                </td>
                <td className="py-2 pr-2 text-right">{money(total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
  onFilters,
  onAdd,
}: {
  cards: ReturnType<typeof filterAvailablePackages>;
  filters: PackageFilters;
  options: ReturnType<typeof uniquePackageFilterOptions>;
  money: (value: number) => string;
  currency: string;
  editable: boolean;
  onFilters: (next: PackageFilters) => void;
  onAdd: () => void;
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
        Select from available packages for this property.
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
      {cards.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="available-packages-empty">
          No active packages match this stay.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.id}
              className="rounded-xl border border-[#EEE6D8] bg-[#FFFcf7] p-3"
            >
              <div className="mb-2 flex h-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
                <Package className="size-7" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-[#251605]">{card.name}</p>
                <span className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold text-[#765719]">
                  {card.category}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {reviewDash(card.description)}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-[#251605]">
                {card.components.length === 0 ? (
                  <li className="text-muted-foreground">{DETAIL_DASH}</li>
                ) : (
                  card.components.slice(0, 3).map((item) => <li key={item}>• {item}</li>)
                )}
              </ul>
              <div className="mt-3 flex items-end justify-between gap-2">
                <p className="text-sm font-medium text-[#251605]">
                  {card.price == null ? DETAIL_DASH : `${money(card.price)}`}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    {currency} / {card.chargeType === DETAIL_DASH ? "package" : card.chargeType.toLowerCase()}
                  </span>
                </p>
                <Button type="button" size="sm" variant="outline" disabled={!editable} onClick={onAdd}>
                  Add Package
                </Button>
              </div>
            </article>
          ))}
        </div>
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

function PackageNotesCard({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="package-notes"
    >
      <h2 className="font-display text-base text-[#251605]">Package Notes</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Internal notes about packages for this reservation (visible to hotel staff only).
      </p>
      <Textarea
        id="package-tab-notes"
        maxLength={PACKAGE_NOTES_MAX}
        disabled={!editable}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, PACKAGE_NOTES_MAX))}
        placeholder="Add package notes here…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {value.length}/{PACKAGE_NOTES_MAX}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{PACKAGE_NOTES_GAP_COPY}</p>
    </section>
  );
}

function PackagesSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
  packagesTotal,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  packagesTotal: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);

  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-packages-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock icon={<CalendarDays className="size-3.5 text-[#B8954F]" />} title="Stay Information">
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock icon={<BedDouble className="size-3.5 text-[#B8954F]" />} title="Room Information">
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p>Packages {money(packagesTotal)}</p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<CreditCard className="size-3.5 text-[#B8954F]" />} title="Guarantee & Deposit">
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
