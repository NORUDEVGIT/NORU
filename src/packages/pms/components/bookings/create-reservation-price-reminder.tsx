import {
  CalendarDays,
  CheckCircle2,
  ConciergeBell,
  Package,
  Receipt,
  Users,
} from "lucide-react";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { cn } from "@/shared/lib/utils";

export type PriceReminderPackage = {
  name: string;
  price: number | null;
  chargeBasis: string;
};

export type PriceReminderService = {
  name: string;
  /** e.g. "3 nights × $50.00"; null for per-service prices. */
  detail: string | null;
  net: number | null;
  total: number | null;
};

export type CreateReservationPriceReminderProps = {
  money: (value: number) => string;
  ratePlanName: string;
  roomTypeName: string;
  ratePerNight: string;
  datesValid: boolean;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  roomSubtotal: number | null;
  isGroup?: boolean;
  totalRooms?: number;
  packages?: PriceReminderPackage[];
  services?: PriceReminderService[];
  mealPlanLabel?: string | null;
  breakfastIncluded?: boolean;
  paymentReceivedAmount?: string;
  depositRequiredAmount?: number | null;
};

export function CreateReservationPriceReminder({
  money,
  ratePlanName,
  roomTypeName,
  ratePerNight,
  datesValid,
  arrival,
  departure,
  nights,
  adults,
  children,
  infants,
  roomSubtotal,
  isGroup = false,
  totalRooms = 1,
  packages = [],
  services = [],
  mealPlanLabel,
  breakfastIncluded = false,
  paymentReceivedAmount = "",
  depositRequiredAmount = null,
}: CreateReservationPriceReminderProps) {
  const packagesTotal = packages.reduce((sum, pkg) => {
    return sum + (pkg.price != null && Number.isFinite(pkg.price) && pkg.price > 0 ? pkg.price : 0);
  }, 0);
  const servicesTotal = services.reduce((sum, service) => {
    return (
      sum +
      (service.total != null && Number.isFinite(service.total) && service.total > 0
        ? service.total
        : 0)
    );
  }, 0);

  const roomCharges = roomSubtotal != null && Number.isFinite(roomSubtotal) ? roomSubtotal : null;
  const totalExpected =
    roomCharges != null ? Math.round((roomCharges + packagesTotal + servicesTotal) * 100) / 100 : null;

  const parsedPayment = Number(paymentReceivedAmount.trim());
  const paymentAmount = Number.isFinite(parsedPayment) && parsedPayment > 0 ? parsedPayment : 0;
  const remainingBalance =
    totalExpected != null && paymentAmount > 0
      ? Math.max(0, totalExpected - paymentAmount)
      : null;
  const isPaidInFull = totalExpected != null && paymentAmount >= totalExpected && totalExpected > 0;

  const occupantParts: string[] = [];
  if (adults > 0) occupantParts.push(`${adults} ${adults === 1 ? "adult" : "adults"}`);
  if (children > 0) occupantParts.push(`${children} ${children === 1 ? "child" : "children"}`);
  if (infants > 0) occupantParts.push(`${infants} ${infants === 1 ? "infant" : "infants"}`);
  const occupancyLabel = occupantParts.join(", ") || `${adults} adults`;

  const datesLabel =
    datesValid && arrival && departure
      ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}`
      : "Dates not set";

  return (
    <section
      className="h-fit rounded-[6px] border border-[#CCCCCC] bg-white p-4 shadow-none"
      data-testid="create-reservation-price-reminder"
    >
      <div className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
          <Receipt className="size-3.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#251605]">Expected Price Reminder</h2>
          <p className="text-xs text-[#6B5E4E]">
            Selected rate plan, duration, and expected payment for this stay.
          </p>
        </div>
      </div>

      {/* Rate Plan & Room details */}
      <div
        className="mt-3 rounded-[6px] border border-[#E7E0D4] bg-[#FAF8F5] p-3"
        data-testid="reminder-rate-plan-box"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A7A68]">
              Rate Plan & Room
            </span>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <p
                className="text-sm font-semibold text-[#251605]"
                data-testid="reminder-rate-plan-name"
              >
                {ratePlanName || "Standard Rate"}
              </p>
              {breakfastIncluded ? (
                <span
                  className="rounded-full bg-[#EBF3ED] px-2 py-0.5 text-[10px] font-medium text-[#2D5A3C]"
                  data-testid="reminder-breakfast-badge"
                >
                  Breakfast included
                </span>
              ) : mealPlanLabel ? (
                <span
                  className="rounded-full bg-[#F5EFE6] px-2 py-0.5 text-[10px] font-medium text-[#6B5E4E]"
                  data-testid="reminder-meal-badge"
                >
                  {mealPlanLabel}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-[#6B5E4E]" data-testid="reminder-room-type-name">
              {roomTypeName}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#8A7A68]">
              Rate / Night
            </span>
            <p
              className="text-sm font-semibold text-[#251605]"
              data-testid="reminder-nightly-rate-value"
            >
              {ratePerNight}
            </p>
          </div>
        </div>

        {/* Stay & Occupancy quick specs */}
        <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-[#E7E0D4] pt-2 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-1.5 text-[#251605]">
            <CalendarDays className="size-3.5 shrink-0 text-[#C89933]" aria-hidden />
            <span className="truncate" title={datesLabel}>
              {datesLabel}
            </span>
            <span className="shrink-0 text-[#8A7A68]">
              ({nights} {nights === 1 ? "night" : "nights"})
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[#251605]">
            <Users className="size-3.5 shrink-0 text-[#C89933]" aria-hidden />
            <span className="truncate">
              {isGroup && totalRooms > 1 ? `${totalRooms} rooms · ` : ""}
              {occupancyLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Selected Packages & Add-ons */}
      <div className="mt-3 border-t border-[#E7E0D4] pt-3" data-testid="reminder-packages-section">
        {packages.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[#251605]">
                <Package className="size-3.5 text-[#C89933]" aria-hidden />
                Selected Packages ({packages.length})
              </span>
              <span className="font-semibold text-[#251605]">
                {packagesTotal > 0 ? money(packagesTotal) : "—"}
              </span>
            </div>
            <ul className="space-y-1 text-xs" data-testid="reminder-packages-list">
              {packages.map((pkg, index) => (
                <li
                  key={`${pkg.name}-${index}`}
                  className="flex items-center justify-between rounded bg-[#FAF8F5] px-2 py-1 text-[11px] text-[#6B5E4E]"
                  data-testid="reminder-package-item"
                >
                  <span className="truncate pr-2">
                    <span className="font-medium text-[#251605]">{pkg.name}</span>
                    {pkg.chargeBasis ? (
                      <span className="text-[#8A7A68]"> · {pkg.chargeBasis}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium text-[#251605]">
                    {pkg.price != null ? money(pkg.price) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-[#6B5E4E]">
            <span className="flex items-center gap-1.5">
              <Package className="size-3 text-[#A89885]" aria-hidden />
              Packages & Add-ons
            </span>
            <span className="text-[11px] text-[#8A7A68]" data-testid="reminder-packages-empty">
              None selected
            </span>
          </div>
        )}
      </div>

      {services.length > 0 ? (
        <div className="mt-3 border-t border-[#E7E0D4] pt-3" data-testid="reminder-services-section">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[#251605]">
                <ConciergeBell className="size-3.5 text-[#C89933]" aria-hidden />
                Selected Services ({services.length})
              </span>
              <span className="font-semibold text-[#251605]" data-testid="reminder-services-total">
                {servicesTotal > 0 ? money(servicesTotal) : "—"}
              </span>
            </div>
            <ul className="space-y-1 text-xs" data-testid="reminder-services-list">
              {services.map((service, index) => (
                <li
                  key={`${service.name}-${index}`}
                  className="flex items-start justify-between gap-2 rounded bg-[#FAF8F5] px-2 py-1 text-[11px] text-[#6B5E4E]"
                  data-testid="reminder-service-item"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[#251605]">{service.name}</span>
                    {service.detail ? (
                      <span className="block text-[#8A7A68]">{service.detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-[#251605]">
                      {service.total != null ? money(service.total) : "Not priced"}
                    </span>
                    {service.net != null &&
                    service.total != null &&
                    Math.abs(service.total - service.net) >= 0.005 ? (
                      <span className="block text-[10px] text-[#8A7A68]">Net {money(service.net)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Total Expected Price box */}
      <div
        className="mt-3 rounded-[6px] border border-[#DDD4C5] bg-[#FBF6EE] p-3 space-y-2"
        data-testid="reminder-expected-total-box"
      >
        <div className="space-y-1 text-xs text-[#6B5E4E]">
          <div className="flex justify-between">
            <span>
              Room Charges ({nights} {nights === 1 ? "night" : "nights"}
              {isGroup && totalRooms > 1 ? `, ${totalRooms} rooms` : ""})
            </span>
            <span className="font-medium text-[#251605]" data-testid="reminder-room-charges">
              {roomCharges != null ? money(roomCharges) : "—"}
            </span>
          </div>
          {packagesTotal > 0 ? (
            <div className="flex justify-between">
              <span>Selected Packages & Add-ons</span>
              <span className="font-medium text-[#251605]">{money(packagesTotal)}</span>
            </div>
          ) : null}
          {servicesTotal > 0 ? (
            <div className="flex justify-between">
              <span>Selected Services</span>
              <span className="font-medium text-[#251605]">{money(servicesTotal)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-baseline justify-between border-t border-[#E7E0D4] pt-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B5E4E]">
              Expected Total
            </span>
            <p className="text-[10px] text-[#8A7A68]">Total amount expected for this reservation</p>
          </div>
          <span
            className="text-lg font-bold text-[#C89933]"
            data-testid="reminder-expected-total-amount"
          >
            {totalExpected != null ? money(totalExpected) : "—"}
          </span>
        </div>

        {/* Real-time Payment Received & Balance update */}
        {paymentAmount > 0 ? (
          <div
            className="border-t border-dashed border-[#DDD4C5] pt-2 text-xs"
            data-testid="reminder-payment-balance"
          >
            <div className="flex justify-between text-[#6B5E4E]">
              <span>Payment Received:</span>
              <span className="font-medium text-[#251605]" data-testid="reminder-recorded-payment">
                {money(paymentAmount)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between font-medium">
              <span className="text-[#251605]">Remaining Balance:</span>
              {isPaidInFull ? (
                <span
                  className="flex items-center gap-1 font-semibold text-emerald-700"
                  data-testid="reminder-paid-in-full"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Paid in full
                </span>
              ) : remainingBalance != null ? (
                <span
                  className={cn(
                    "font-semibold",
                    remainingBalance > 0 ? "text-[#9B3A3A]" : "text-emerald-700",
                  )}
                  data-testid="reminder-remaining-balance"
                >
                  {money(remainingBalance)}
                </span>
              ) : (
                <span className="text-[#6B5E4E]">—</span>
              )}
            </div>
          </div>
        ) : null}

        {/* Deposit Requirement footnote */}
        {depositRequiredAmount != null && depositRequiredAmount > 0 ? (
          <div
            className="flex items-center justify-between border-t border-[#E7E0D4]/70 pt-1.5 text-[11px] text-[#8A641A]"
            data-testid="reminder-deposit-required"
          >
            <span>Required Deposit Policy:</span>
            <span className="font-semibold">{money(depositRequiredAmount)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
