/**
 * AIOS-02 external booking key.
 * Provider may be folded to the internal value `aiosell`.
 * hotelCode, channel, and bookingId are stored as received.
 */
export const DISTRIBUTION_PROVIDER = "aiosell" as const;

export type DistributionProvider = typeof DISTRIBUTION_PROVIDER;

export type ExternalReservationIdentity = {
  restaurantId: string;
  provider: DistributionProvider;
  hotelCode: string;
  channel: string;
  externalBookingId: string;
};

export type ExternalReservationIdentityInput = {
  restaurantId: string;
  provider: string;
  hotelCode: string;
  channel: string;
  externalBookingId: string;
};

export function distributionProvider(provider: string): DistributionProvider {
  if (provider.toLowerCase() !== DISTRIBUTION_PROVIDER) {
    throw new Error("UNKNOWN_DISTRIBUTION_PROVIDER");
  }
  return DISTRIBUTION_PROVIDER;
}

export function externalReservationIdentity(
  input: ExternalReservationIdentityInput,
): ExternalReservationIdentity {
  if (!input.restaurantId) {
    throw new Error("EXTERNAL_RESERVATION_IDENTITY_INCOMPLETE");
  }
  const provider = distributionProvider(input.provider);
  if (input.hotelCode === "" || input.channel === "" || input.externalBookingId === "") {
    throw new Error("EXTERNAL_RESERVATION_IDENTITY_INCOMPLETE");
  }
  return {
    restaurantId: input.restaurantId,
    provider,
    hotelCode: input.hotelCode,
    channel: input.channel,
    externalBookingId: input.externalBookingId,
  };
}
