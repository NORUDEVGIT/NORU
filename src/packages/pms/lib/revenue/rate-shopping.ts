/**
 * P6-STEP-01 — Rate shopping domain.
 *
 * Provider-independent competitor setup and observation types.
 * No live provider. No FX. No ranking. No rate-plan comparability claim.
 * Observation writes stay on the trusted server path.
 */

export const RATE_SHOPPING_OBSERVATION_IMMUTABLE = "RATE_SHOPPING_OBSERVATION_IMMUTABLE";
export const RATE_SHOPPING_LIVE_PROVIDER = false;
export const RATE_SHOPPING_LIVE_COLLECTION_NOTE =
  "Live rate collection requires a connected provider.";
export const RATE_SHOPPING_PROVIDER_HELPER =
  "This mapping identifies the competitor in a future rate-shopping provider.";
export const RATE_SHOPPING_ROOM_HELPER =
  "Room mappings define which competitor room should be compared with each NORU room type.";
export const RATE_SHOPPING_ROOM_REQUIRES_PROVIDER = "Add a provider property mapping first.";
export const RATE_SHOPPING_EMPTY_COPY = "No competitors configured.";
export const RATE_SHOPPING_EMPTY_HELPER =
  "Add competitors now. Live rate data will become available after a rate-shopping provider is connected.";
export const RATE_SHOPPING_HEADER_HELPER =
  "Live competitor rates require a connected rate-shopping provider.";

export const RATE_SHOPPING_FETCH_RUN_STATUSES = ["running", "success", "partial", "failed"] as const;
export const COMPETITOR_AVAILABILITY_STATUSES = [
  "available",
  "sold_out",
  "not_returned",
  "unmapped",
  "unknown",
] as const;
export const COMPETITOR_TAX_BASES = ["inclusive", "exclusive", "unknown"] as const;
export const COMPETITOR_SETUP_STATUSES = [
  "no_provider_mapping",
  "no_room_mapping",
  "partially_mapped",
  "mapped",
] as const;

export type RateShoppingFetchRunStatus = (typeof RATE_SHOPPING_FETCH_RUN_STATUSES)[number];
export type CompetitorAvailabilityStatus = (typeof COMPETITOR_AVAILABILITY_STATUSES)[number];
export type CompetitorTaxBasis = (typeof COMPETITOR_TAX_BASES)[number];
export type CompetitorSetupStatus = (typeof COMPETITOR_SETUP_STATUSES)[number];
export type CompetitorRoomMappingStatus = "manual";

export type HotelCompetitor = {
  id: string;
  restaurantId: string;
  name: string;
  active: boolean;
  locationLabel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompetitorProviderMapping = {
  id: string;
  restaurantId: string;
  competitorId: string;
  provider: string;
  externalPropertyId: string;
  externalPropertyName: string | null;
  active: boolean;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompetitorRoomMapping = {
  id: string;
  restaurantId: string;
  competitorId: string;
  provider: string;
  ourRoomTypeId: string;
  externalRoomId: string;
  externalRoomName: string | null;
  active: boolean;
  mappingStatus: CompetitorRoomMappingStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RateShoppingFetchRun = {
  id: string;
  restaurantId: string;
  provider: string;
  startedAt: string;
  finishedAt: string | null;
  status: RateShoppingFetchRunStatus;
  requestedStayFrom: string;
  requestedStayTo: string;
  competitorCount: number;
  observationCount: number;
  errorCount: number;
  errorSummary: string | null;
  createdAt: string;
};

export type CompetitorRateObservation = {
  id: string;
  restaurantId: string;
  competitorId: string;
  provider: string;
  providerPropertyId: string;
  fetchRunId: string;
  observedAt: string;
  stayDate: string;
  externalRoomId: string | null;
  externalRoomName: string | null;
  externalRatePlanId: string | null;
  externalRatePlanName: string | null;
  occupancyAdults: number | null;
  occupancyChildren: number | null;
  currency: string | null;
  rateAmount: number | null;
  taxBasis: CompetitorTaxBasis;
  availabilityStatus: CompetitorAvailabilityStatus;
  sourceHash: string | null;
  createdAt: string;
};

export type CreateHotelCompetitorInput = {
  restaurantId: string;
  name: string;
  locationLabel?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type UpdateHotelCompetitorInput = {
  restaurantId: string;
  competitorId: string;
  name?: string;
  locationLabel?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type CreateCompetitorProviderMappingInput = {
  restaurantId: string;
  competitorId: string;
  provider: string;
  externalPropertyId: string;
  externalPropertyName?: string | null;
  active?: boolean;
};

export type UpdateCompetitorProviderMappingInput = {
  restaurantId: string;
  mappingId: string;
  provider?: string;
  externalPropertyId?: string;
  externalPropertyName?: string | null;
  active?: boolean;
};

export type CreateCompetitorRoomMappingInput = {
  restaurantId: string;
  competitorId: string;
  provider: string;
  ourRoomTypeId: string;
  externalRoomId: string;
  externalRoomName?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type UpdateCompetitorRoomMappingInput = {
  restaurantId: string;
  mappingId: string;
  provider?: string;
  ourRoomTypeId?: string;
  externalRoomId?: string;
  externalRoomName?: string | null;
  notes?: string | null;
  active?: boolean;
};

export type RateShoppingRoomType = {
  id: string;
  name: string;
  active: boolean;
};

export type CompetitorSetupRow = HotelCompetitor & {
  setupStatus: CompetitorSetupStatus;
  setupLabel: string;
  listHelper: string;
  activeProviderCount: number;
  activeRoomMappingCount: number;
  mappedRoomTypeCount: number;
  propertyRoomTypeCount: number;
  providerLabels: string[];
};

export type CompetitorSetupCounts = {
  competitors: number;
  activeCompetitors: number;
  providerMapped: number;
  roomMappings: number;
  unmappedCompetitors: number;
};

export type CompetitorSetupWorkspace = {
  competitors: CompetitorSetupRow[];
  providerMappings: CompetitorProviderMapping[];
  roomMappings: CompetitorRoomMapping[];
  roomTypes: RateShoppingRoomType[];
  counts: CompetitorSetupCounts;
  liveRateCollectionAvailable: false;
  liveRateCollectionNote: typeof RATE_SHOPPING_LIVE_COLLECTION_NOTE;
};

export type CompetitorComparabilityReason =
  | "stay_date_mismatch"
  | "room_unmapped"
  | "occupancy_unknown"
  | "occupancy_mismatch"
  | "currency_unknown"
  | "currency_mismatch"
  | "tax_basis_unknown"
  | "tax_basis_mismatch";

export type CompetitorComparabilityResult = {
  comparable: boolean;
  reasons: CompetitorComparabilityReason[];
};

export type CompetitorComparabilityInput = {
  stayDate: string;
  ourStayDate: string;
  roomMapped: boolean;
  occupancyAdults: number | null;
  occupancyChildren: number | null;
  ourOccupancyAdults: number | null;
  ourOccupancyChildren: number | null;
  currency: string | null;
  ourCurrency: string | null;
  taxBasis: CompetitorTaxBasis;
  ourTaxBasis: CompetitorTaxBasis;
};

export const COMPETITOR_SETUP_STATUS_LABELS: Record<CompetitorSetupStatus, string> = {
  no_provider_mapping: "No Provider Mapping",
  no_room_mapping: "No Room Mappings",
  partially_mapped: "Partially Mapped",
  mapped: "Mappings Complete",
};

export const COMPETITOR_SETUP_LIST_HELPERS: Record<CompetitorSetupStatus, string> = {
  no_provider_mapping: "Provider Not Mapped",
  no_room_mapping: "No Room Mappings",
  partially_mapped: "Partially Mapped",
  mapped: "Mapped",
};

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeProviderId(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}

export function normalizeExternalId(value: string): string {
  return value.trim();
}

export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export function isRateShoppingFetchRunStatus(value: string): value is RateShoppingFetchRunStatus {
  return (RATE_SHOPPING_FETCH_RUN_STATUSES as readonly string[]).includes(value);
}

export function isCompetitorAvailabilityStatus(value: string): value is CompetitorAvailabilityStatus {
  return (COMPETITOR_AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

export function isCompetitorTaxBasis(value: string): value is CompetitorTaxBasis {
  return (COMPETITOR_TAX_BASES as readonly string[]).includes(value);
}

export function validateCompetitorName(name: string | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("COMPETITOR_NAME_REQUIRED");
  if (trimmed.length > 160) throw new Error("COMPETITOR_NAME_TOO_LONG");
  return trimmed;
}

export function competitorSetupStatus(input: {
  activeProviderMappings: number;
  mappedRoomTypeIds: readonly string[];
  propertyRoomTypeIds: readonly string[];
}): CompetitorSetupStatus {
  if (input.activeProviderMappings <= 0) return "no_provider_mapping";
  const property = new Set(input.propertyRoomTypeIds);
  const mapped = new Set(input.mappedRoomTypeIds.filter((id) => property.has(id)));
  if (mapped.size === 0) return "no_room_mapping";
  if (property.size > 0 && mapped.size >= property.size) return "mapped";
  return "partially_mapped";
}

export function competitorSetupLabel(status: CompetitorSetupStatus): string {
  return COMPETITOR_SETUP_STATUS_LABELS[status];
}

export function competitorSetupListHelper(status: CompetitorSetupStatus): string {
  return COMPETITOR_SETUP_LIST_HELPERS[status];
}

export function composeCompetitorSetupRow(
  competitor: HotelCompetitor,
  providerMappings: readonly CompetitorProviderMapping[],
  roomMappings: readonly CompetitorRoomMapping[],
  propertyRoomTypeIds: readonly string[],
): CompetitorSetupRow {
  const providers = providerMappings.filter(
    (row) => row.competitorId === competitor.id && row.active,
  );
  const rooms = roomMappings.filter((row) => row.competitorId === competitor.id && row.active);
  const mappedRoomTypeIds = [...new Set(rooms.map((row) => row.ourRoomTypeId))];
  const status = competitorSetupStatus({
    activeProviderMappings: providers.length,
    mappedRoomTypeIds,
    propertyRoomTypeIds,
  });
  return {
    ...competitor,
    setupStatus: status,
    setupLabel: competitorSetupLabel(status),
    listHelper: competitorSetupListHelper(status),
    activeProviderCount: providers.length,
    activeRoomMappingCount: rooms.length,
    mappedRoomTypeCount: mappedRoomTypeIds.filter((id) => propertyRoomTypeIds.includes(id)).length,
    propertyRoomTypeCount: propertyRoomTypeIds.length,
    providerLabels: [...new Set(providers.map((row) => row.provider))],
  };
}

export function composeCompetitorSetupCounts(
  competitors: readonly CompetitorSetupRow[],
  roomMappings: readonly CompetitorRoomMapping[],
): CompetitorSetupCounts {
  return {
    competitors: competitors.length,
    activeCompetitors: competitors.filter((row) => row.active).length,
    providerMapped: competitors.filter((row) => row.activeProviderCount > 0).length,
    roomMappings: roomMappings.filter((row) => row.active).length,
    unmappedCompetitors: competitors.filter((row) => row.activeProviderCount === 0).length,
  };
}

export function composeCompetitorSetupWorkspace(input: {
  competitors: readonly HotelCompetitor[];
  providerMappings: readonly CompetitorProviderMapping[];
  roomMappings: readonly CompetitorRoomMapping[];
  roomTypes: readonly RateShoppingRoomType[];
}): CompetitorSetupWorkspace {
  const propertyRoomTypeIds = input.roomTypes.map((row) => row.id);
  const competitors = input.competitors.map((competitor) =>
    composeCompetitorSetupRow(
      competitor,
      input.providerMappings,
      input.roomMappings,
      propertyRoomTypeIds,
    ),
  );
  return {
    competitors,
    providerMappings: [...input.providerMappings],
    roomMappings: [...input.roomMappings],
    roomTypes: [...input.roomTypes],
    counts: composeCompetitorSetupCounts(competitors, input.roomMappings),
    liveRateCollectionAvailable: false,
    liveRateCollectionNote: RATE_SHOPPING_LIVE_COLLECTION_NOTE,
  };
}

/**
 * V1 basic comparability. Does not claim board, refundability, or rate-plan parity.
 */
export function assessCompetitorRateComparability(
  input: CompetitorComparabilityInput,
): CompetitorComparabilityResult {
  const reasons: CompetitorComparabilityReason[] = [];
  if (input.stayDate !== input.ourStayDate) reasons.push("stay_date_mismatch");
  if (!input.roomMapped) reasons.push("room_unmapped");
  const occupancyUnknown =
    input.occupancyAdults == null ||
    input.occupancyChildren == null ||
    input.ourOccupancyAdults == null ||
    input.ourOccupancyChildren == null;
  if (occupancyUnknown) {
    reasons.push("occupancy_unknown");
  } else if (
    input.occupancyAdults !== input.ourOccupancyAdults ||
    input.occupancyChildren !== input.ourOccupancyChildren
  ) {
    reasons.push("occupancy_mismatch");
  }
  const ourCurrency = normalizeCurrencyCode(input.ourCurrency);
  const theirCurrency = normalizeCurrencyCode(input.currency);
  if (!ourCurrency || !theirCurrency) reasons.push("currency_unknown");
  else if (ourCurrency !== theirCurrency) reasons.push("currency_mismatch");
  if (input.taxBasis === "unknown" || input.ourTaxBasis === "unknown") {
    reasons.push("tax_basis_unknown");
  } else if (input.taxBasis !== input.ourTaxBasis) {
    reasons.push("tax_basis_mismatch");
  }
  return { comparable: reasons.length === 0, reasons };
}

export function occupancyKnownAndEqual(
  leftAdults: number | null,
  leftChildren: number | null,
  rightAdults: number | null,
  rightChildren: number | null,
): boolean {
  if (leftAdults == null || leftChildren == null || rightAdults == null || rightChildren == null) {
    return false;
  }
  return leftAdults === rightAdults && leftChildren === rightChildren;
}
