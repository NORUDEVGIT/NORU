/**
 * Included-occupancy allocation (Model A — adult priority).
 * Infants do not consume included slots and are never surcharged.
 *
 * Live quoting uses Rate Plan fields only. Room Type Extra Guest Allowed is
 * setup intent and is NOT read by price_hotel_stay.
 */

export type OccupancyAllocation = {
  adultsIncluded: number;
  childrenIncluded: number;
  extraAdults: number;
  extraChildren: number;
};

export function allocateIncludedOccupancy(input: {
  adults: number;
  children: number;
  includedOccupancy: number;
  extraGuestAllowed?: boolean;
}): OccupancyAllocation {
  const adults = Math.max(0, Math.floor(input.adults));
  const children = Math.max(0, Math.floor(input.children));
  const included = Math.max(0, Math.floor(input.includedOccupancy));

  if (input.extraGuestAllowed === false) {
    return {
      adultsIncluded: adults,
      childrenIncluded: children,
      extraAdults: 0,
      extraChildren: 0,
    };
  }

  const adultsIncluded = Math.min(adults, included);
  const remaining = included - adultsIncluded;
  const childrenIncluded = Math.min(children, remaining);
  return {
    adultsIncluded,
    childrenIncluded,
    extraAdults: adults - adultsIncluded,
    extraChildren: children - childrenIncluded,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type OccupancySurchargeInput = {
  adults: number;
  children: number;
  infants?: number;
  includedOccupancy: number | null | undefined;
  extraAdultRate: number | null | undefined;
  extraChildRate: number | null | undefined;
};

export type OccupancySurchargeResult = OccupancyAllocation & {
  adultSurcharge: number;
  childSurcharge: number;
  surcharge: number;
};

/**
 * Canonical extra-person money. NULL included occupancy = not configured (0).
 * NULL extra adult/child rate = that guest type is not configured (0).
 * 0 extra rate = explicitly free.
 */
export function computeOccupancySurcharge(input: OccupancySurchargeInput): OccupancySurchargeResult {
  const included = input.includedOccupancy;
  if (included == null || !Number.isInteger(included) || included < 1) {
    return {
      adultsIncluded: Math.max(0, Math.floor(input.adults)),
      childrenIncluded: Math.max(0, Math.floor(input.children)),
      extraAdults: 0,
      extraChildren: 0,
      adultSurcharge: 0,
      childSurcharge: 0,
      surcharge: 0,
    };
  }

  const allocation = allocateIncludedOccupancy({
    adults: input.adults,
    children: input.children,
    includedOccupancy: included,
  });
  const adultSurcharge =
    input.extraAdultRate == null ? 0 : roundMoney(allocation.extraAdults * input.extraAdultRate);
  const childSurcharge =
    input.extraChildRate == null ? 0 : roundMoney(allocation.extraChildren * input.extraChildRate);
  return {
    ...allocation,
    adultSurcharge,
    childSurcharge,
    surcharge: roundMoney(adultSurcharge + childSurcharge),
  };
}

export function computeFinalNightlyRate(
  effectiveNightRate: number,
  occupancy: OccupancySurchargeInput,
): number {
  const { surcharge } = computeOccupancySurcharge(occupancy);
  return roundMoney(effectiveNightRate + surcharge);
}

export function ratePlanOccupancyValidationError(input: {
  includedOccupancy: number | null | undefined;
  extraAdultRate: number | null | undefined;
  extraChildRate: number | null | undefined;
  maxOccupancy?: number | null | undefined;
}): string | null {
  const included = input.includedOccupancy;
  if (included != null) {
    if (!Number.isInteger(included) || included < 1) {
      return "Included occupancy must be empty or a whole number of 1 or more.";
    }
    if (input.maxOccupancy != null && included > input.maxOccupancy) {
      return "Included occupancy cannot exceed the room type maximum occupancy.";
    }
  }
  if (input.extraAdultRate != null && (!Number.isFinite(input.extraAdultRate) || input.extraAdultRate < 0)) {
    return "Extra adult rate must be empty or 0 or more.";
  }
  if (input.extraChildRate != null && (!Number.isFinite(input.extraChildRate) || input.extraChildRate < 0)) {
    return "Extra child rate must be empty or 0 or more.";
  }
  return null;
}
