/**
 * P6-STEP-01 — Competitor setup loaders and trusted ingestion helpers.
 * Rate Manager writes go through functions.ts. Observation/fetch-run writes
 * are internal only — no public UI action.
 */

import {
  blankToNull,
  composeCompetitorSetupWorkspace,
  isCompetitorAvailabilityStatus,
  isCompetitorTaxBasis,
  isRateShoppingFetchRunStatus,
  normalizeCurrencyCode,
  normalizeExternalId,
  normalizeProviderId,
  validateCompetitorName,
  type CompetitorProviderMapping,
  type CompetitorRateObservation,
  type CompetitorRoomMapping,
  type CompetitorSetupWorkspace,
  type CompetitorTaxBasis,
  type CreateCompetitorProviderMappingInput,
  type CreateCompetitorRoomMappingInput,
  type CreateHotelCompetitorInput,
  type HotelCompetitor,
  type RateShoppingFetchRun,
  type RateShoppingFetchRunStatus,
  type RateShoppingRoomType,
  type UpdateCompetitorProviderMappingInput,
  type UpdateCompetitorRoomMappingInput,
  type UpdateHotelCompetitorInput,
} from "./rate-shopping.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

function throwDb(error: { message?: string } | null) {
  if (error) throw new Error(error.message || "RATE_SHOPPING_QUERY_FAILED");
}

function mapCompetitor(row: Record<string, unknown>): HotelCompetitor {
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    name: String(row.name),
    active: row.active !== false,
    locationLabel: typeof row.location_label === "string" ? row.location_label : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapProviderMapping(row: Record<string, unknown>): CompetitorProviderMapping {
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    competitorId: String(row.competitor_id),
    provider: String(row.provider),
    externalPropertyId: String(row.external_property_id),
    externalPropertyName:
      typeof row.external_property_name === "string" ? row.external_property_name : null,
    active: row.active !== false,
    lastVerifiedAt: typeof row.last_verified_at === "string" ? row.last_verified_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRoomMapping(row: Record<string, unknown>): CompetitorRoomMapping {
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    competitorId: String(row.competitor_id),
    provider: String(row.provider),
    ourRoomTypeId: String(row.our_room_type_id),
    externalRoomId: String(row.external_room_id),
    externalRoomName: typeof row.external_room_name === "string" ? row.external_room_name : null,
    active: row.active !== false,
    mappingStatus: "manual",
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapFetchRun(row: Record<string, unknown>): RateShoppingFetchRun {
  const status = String(row.status);
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    provider: String(row.provider),
    startedAt: String(row.started_at),
    finishedAt: typeof row.finished_at === "string" ? row.finished_at : null,
    status: isRateShoppingFetchRunStatus(status) ? status : "failed",
    requestedStayFrom: String(row.requested_stay_from),
    requestedStayTo: String(row.requested_stay_to),
    competitorCount: Number(row.competitor_count ?? 0),
    observationCount: Number(row.observation_count ?? 0),
    errorCount: Number(row.error_count ?? 0),
    errorSummary: typeof row.error_summary === "string" ? row.error_summary : null,
    createdAt: String(row.created_at),
  };
}

function mapObservation(row: Record<string, unknown>): CompetitorRateObservation {
  const tax = String(row.tax_basis ?? "unknown");
  const availability = String(row.availability_status ?? "unknown");
  return {
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    competitorId: String(row.competitor_id),
    provider: String(row.provider),
    providerPropertyId: String(row.provider_property_id),
    fetchRunId: String(row.fetch_run_id),
    observedAt: String(row.observed_at),
    stayDate: String(row.stay_date),
    externalRoomId: typeof row.external_room_id === "string" ? row.external_room_id : null,
    externalRoomName: typeof row.external_room_name === "string" ? row.external_room_name : null,
    externalRatePlanId: typeof row.external_rate_plan_id === "string" ? row.external_rate_plan_id : null,
    externalRatePlanName:
      typeof row.external_rate_plan_name === "string" ? row.external_rate_plan_name : null,
    occupancyAdults: row.occupancy_adults == null ? null : Number(row.occupancy_adults),
    occupancyChildren: row.occupancy_children == null ? null : Number(row.occupancy_children),
    currency: normalizeCurrencyCode(typeof row.currency === "string" ? row.currency : null),
    rateAmount: row.rate_amount == null ? null : Number(row.rate_amount),
    taxBasis: isCompetitorTaxBasis(tax) ? tax : "unknown",
    availabilityStatus: isCompetitorAvailabilityStatus(availability) ? availability : "unknown",
    sourceHash: typeof row.source_hash === "string" ? row.source_hash : null,
    createdAt: String(row.created_at),
  };
}

export async function listHotelCompetitors(
  db: DbClient,
  restaurantId: string,
): Promise<HotelCompetitor[]> {
  const result = await db
    .from("hotel_competitors")
    .select(
      "id, restaurant_id, name, active, location_label, notes, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  throwDb(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(mapCompetitor);
}

export async function getHotelCompetitor(
  db: DbClient,
  input: { restaurantId: string; competitorId: string },
): Promise<HotelCompetitor | null> {
  const result = await db
    .from("hotel_competitors")
    .select(
      "id, restaurant_id, name, active, location_label, notes, created_at, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.competitorId)
    .maybeSingle();
  throwDb(result.error);
  return result.data ? mapCompetitor(result.data as Record<string, unknown>) : null;
}

export async function createHotelCompetitor(
  db: DbClient,
  input: CreateHotelCompetitorInput,
): Promise<HotelCompetitor> {
  const name = validateCompetitorName(input.name);
  const result = await db
    .from("hotel_competitors")
    .insert({
      restaurant_id: input.restaurantId,
      name,
      location_label: blankToNull(input.locationLabel),
      notes: blankToNull(input.notes),
      active: input.active !== false,
    })
    .select(
      "id, restaurant_id, name, active, location_label, notes, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapCompetitor(result.data as Record<string, unknown>);
}

export async function updateHotelCompetitor(
  db: DbClient,
  input: UpdateHotelCompetitorInput,
): Promise<HotelCompetitor> {
  const current = await getHotelCompetitor(db, {
    restaurantId: input.restaurantId,
    competitorId: input.competitorId,
  });
  if (!current) throw new Error("COMPETITOR_NOT_FOUND");
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = validateCompetitorName(input.name);
  if (input.locationLabel !== undefined) patch.location_label = blankToNull(input.locationLabel);
  if (input.notes !== undefined) patch.notes = blankToNull(input.notes);
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return current;
  const result = await db
    .from("hotel_competitors")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.competitorId)
    .select(
      "id, restaurant_id, name, active, location_label, notes, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapCompetitor(result.data as Record<string, unknown>);
}

export async function listCompetitorProviderMappings(
  db: DbClient,
  input: { restaurantId: string; competitorId?: string },
): Promise<CompetitorProviderMapping[]> {
  let query = db
    .from("hotel_competitor_provider_mappings")
    .select(
      "id, restaurant_id, competitor_id, provider, external_property_id, external_property_name, active, last_verified_at, created_at, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .order("provider");
  if (input.competitorId) query = query.eq("competitor_id", input.competitorId);
  const result = await query;
  throwDb(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(mapProviderMapping);
}

async function requireCompetitor(
  db: DbClient,
  restaurantId: string,
  competitorId: string,
): Promise<HotelCompetitor> {
  const competitor = await getHotelCompetitor(db, { restaurantId, competitorId });
  if (!competitor) throw new Error("COMPETITOR_NOT_FOUND");
  return competitor;
}

export async function createCompetitorProviderMapping(
  db: DbClient,
  input: CreateCompetitorProviderMappingInput,
): Promise<CompetitorProviderMapping> {
  await requireCompetitor(db, input.restaurantId, input.competitorId);
  const provider = normalizeProviderId(input.provider);
  const externalPropertyId = normalizeExternalId(input.externalPropertyId);
  if (!provider) throw new Error("PROVIDER_REQUIRED");
  if (!externalPropertyId) throw new Error("EXTERNAL_PROPERTY_ID_REQUIRED");
  const result = await db
    .from("hotel_competitor_provider_mappings")
    .insert({
      restaurant_id: input.restaurantId,
      competitor_id: input.competitorId,
      provider,
      external_property_id: externalPropertyId,
      external_property_name: blankToNull(input.externalPropertyName),
      active: input.active !== false,
    })
    .select(
      "id, restaurant_id, competitor_id, provider, external_property_id, external_property_name, active, last_verified_at, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapProviderMapping(result.data as Record<string, unknown>);
}

export async function updateCompetitorProviderMapping(
  db: DbClient,
  input: UpdateCompetitorProviderMappingInput,
): Promise<CompetitorProviderMapping> {
  const current = await db
    .from("hotel_competitor_provider_mappings")
    .select(
      "id, restaurant_id, competitor_id, provider, external_property_id, external_property_name, active, last_verified_at, created_at, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.mappingId)
    .maybeSingle();
  throwDb(current.error);
  if (!current.data) throw new Error("PROVIDER_MAPPING_NOT_FOUND");
  const patch: Record<string, unknown> = {};
  if (input.provider !== undefined) {
    const provider = normalizeProviderId(input.provider);
    if (!provider) throw new Error("PROVIDER_REQUIRED");
    patch.provider = provider;
  }
  if (input.externalPropertyId !== undefined) {
    const externalPropertyId = normalizeExternalId(input.externalPropertyId);
    if (!externalPropertyId) throw new Error("EXTERNAL_PROPERTY_ID_REQUIRED");
    patch.external_property_id = externalPropertyId;
  }
  if (input.externalPropertyName !== undefined) {
    patch.external_property_name = blankToNull(input.externalPropertyName);
  }
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return mapProviderMapping(current.data as Record<string, unknown>);
  const result = await db
    .from("hotel_competitor_provider_mappings")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.mappingId)
    .select(
      "id, restaurant_id, competitor_id, provider, external_property_id, external_property_name, active, last_verified_at, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapProviderMapping(result.data as Record<string, unknown>);
}

export async function listCompetitorRoomMappings(
  db: DbClient,
  input: { restaurantId: string; competitorId?: string },
): Promise<CompetitorRoomMapping[]> {
  let query = db
    .from("hotel_competitor_room_mappings")
    .select(
      "id, restaurant_id, competitor_id, provider, our_room_type_id, external_room_id, external_room_name, active, mapping_status, notes, created_at, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .order("created_at");
  if (input.competitorId) query = query.eq("competitor_id", input.competitorId);
  const result = await query;
  throwDb(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(mapRoomMapping);
}

async function requireProviderIdentity(
  db: DbClient,
  restaurantId: string,
  competitorId: string,
  provider: string,
) {
  const mappings = await listCompetitorProviderMappings(db, { restaurantId, competitorId });
  const match = mappings.find((row) => row.provider === provider && row.active);
  if (!match) throw new Error("ROOM_MAPPING_REQUIRES_PROVIDER");
}

async function requireRoomType(
  db: DbClient,
  restaurantId: string,
  roomTypeId: string,
) {
  const result = await db
    .from("room_types")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("id", roomTypeId)
    .maybeSingle();
  throwDb(result.error);
  if (!result.data) throw new Error("ROOM_TYPE_NOT_FOUND");
}

export async function createCompetitorRoomMapping(
  db: DbClient,
  input: CreateCompetitorRoomMappingInput,
): Promise<CompetitorRoomMapping> {
  await requireCompetitor(db, input.restaurantId, input.competitorId);
  const provider = normalizeProviderId(input.provider);
  const externalRoomId = normalizeExternalId(input.externalRoomId);
  if (!provider) throw new Error("PROVIDER_REQUIRED");
  if (!externalRoomId) throw new Error("EXTERNAL_ROOM_ID_REQUIRED");
  await requireProviderIdentity(db, input.restaurantId, input.competitorId, provider);
  await requireRoomType(db, input.restaurantId, input.ourRoomTypeId);
  const result = await db
    .from("hotel_competitor_room_mappings")
    .insert({
      restaurant_id: input.restaurantId,
      competitor_id: input.competitorId,
      provider,
      our_room_type_id: input.ourRoomTypeId,
      external_room_id: externalRoomId,
      external_room_name: blankToNull(input.externalRoomName),
      notes: blankToNull(input.notes),
      active: input.active !== false,
      mapping_status: "manual",
    })
    .select(
      "id, restaurant_id, competitor_id, provider, our_room_type_id, external_room_id, external_room_name, active, mapping_status, notes, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapRoomMapping(result.data as Record<string, unknown>);
}

export async function updateCompetitorRoomMapping(
  db: DbClient,
  input: UpdateCompetitorRoomMappingInput,
): Promise<CompetitorRoomMapping> {
  const current = await db
    .from("hotel_competitor_room_mappings")
    .select(
      "id, restaurant_id, competitor_id, provider, our_room_type_id, external_room_id, external_room_name, active, mapping_status, notes, created_at, updated_at",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.mappingId)
    .maybeSingle();
  throwDb(current.error);
  if (!current.data) throw new Error("ROOM_MAPPING_NOT_FOUND");
  const mapped = mapRoomMapping(current.data as Record<string, unknown>);
  const nextProvider = input.provider !== undefined ? normalizeProviderId(input.provider) : mapped.provider;
  const nextRoomTypeId = input.ourRoomTypeId ?? mapped.ourRoomTypeId;
  const nextExternalRoomId =
    input.externalRoomId !== undefined ? normalizeExternalId(input.externalRoomId) : mapped.externalRoomId;
  if (!nextProvider) throw new Error("PROVIDER_REQUIRED");
  if (!nextExternalRoomId) throw new Error("EXTERNAL_ROOM_ID_REQUIRED");
  const willBeActive = input.active ?? mapped.active;
  if (willBeActive) {
    await requireProviderIdentity(db, input.restaurantId, mapped.competitorId, nextProvider);
  }
  if (input.ourRoomTypeId) await requireRoomType(db, input.restaurantId, nextRoomTypeId);
  const patch: Record<string, unknown> = {};
  if (input.provider !== undefined) patch.provider = nextProvider;
  if (input.ourRoomTypeId !== undefined) patch.our_room_type_id = nextRoomTypeId;
  if (input.externalRoomId !== undefined) patch.external_room_id = nextExternalRoomId;
  if (input.externalRoomName !== undefined) patch.external_room_name = blankToNull(input.externalRoomName);
  if (input.notes !== undefined) patch.notes = blankToNull(input.notes);
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return mapped;
  const result = await db
    .from("hotel_competitor_room_mappings")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.mappingId)
    .select(
      "id, restaurant_id, competitor_id, provider, our_room_type_id, external_room_id, external_room_name, active, mapping_status, notes, created_at, updated_at",
    )
    .single();
  throwDb(result.error);
  return mapRoomMapping(result.data as Record<string, unknown>);
}

async function loadRoomTypes(db: DbClient, restaurantId: string): Promise<RateShoppingRoomType[]> {
  const result = await db
    .from("room_types")
    .select("id, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  throwDb(result.error);
  return ((result.data ?? []) as Array<{ id: string; name: string | null; active: boolean | null }>).map(
    (row) => ({
      id: row.id,
      name: row.name?.trim() || "Room type",
      active: row.active !== false,
    }),
  );
}

export async function getCompetitorSetupWorkspace(
  db: DbClient,
  restaurantId: string,
): Promise<CompetitorSetupWorkspace> {
  const [competitors, providerMappings, roomMappings, roomTypes] = await Promise.all([
    listHotelCompetitors(db, restaurantId),
    listCompetitorProviderMappings(db, { restaurantId }),
    listCompetitorRoomMappings(db, { restaurantId }),
    loadRoomTypes(db, restaurantId),
  ]);
  return composeCompetitorSetupWorkspace({
    competitors,
    providerMappings,
    roomMappings,
    roomTypes,
  });
}

export type StartRateShoppingFetchRunInput = {
  restaurantId: string;
  provider: string;
  requestedStayFrom: string;
  requestedStayTo: string;
  competitorCount?: number;
};

export async function startRateShoppingFetchRun(
  db: DbClient,
  input: StartRateShoppingFetchRunInput,
): Promise<RateShoppingFetchRun> {
  const provider = normalizeProviderId(input.provider);
  if (!provider) throw new Error("PROVIDER_REQUIRED");
  if (input.requestedStayTo < input.requestedStayFrom) throw new Error("FETCH_RUN_DATES_INVALID");
  const result = await db
    .from("hotel_rate_shopping_fetch_runs")
    .insert({
      restaurant_id: input.restaurantId,
      provider,
      status: "running",
      requested_stay_from: input.requestedStayFrom,
      requested_stay_to: input.requestedStayTo,
      competitor_count: Math.max(0, input.competitorCount ?? 0),
    })
    .select(
      "id, restaurant_id, provider, started_at, finished_at, status, requested_stay_from, requested_stay_to, competitor_count, observation_count, error_count, error_summary, created_at",
    )
    .single();
  throwDb(result.error);
  return mapFetchRun(result.data as Record<string, unknown>);
}

async function finishFetchRun(
  db: DbClient,
  input: {
    restaurantId: string;
    fetchRunId: string;
    status: RateShoppingFetchRunStatus;
    observationCount?: number;
    errorCount?: number;
    errorSummary?: string | null;
  },
): Promise<RateShoppingFetchRun> {
  if (input.status === "running") throw new Error("FETCH_RUN_STATUS_INVALID");
  const result = await db
    .from("hotel_rate_shopping_fetch_runs")
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      observation_count: Math.max(0, input.observationCount ?? 0),
      error_count: Math.max(0, input.errorCount ?? 0),
      error_summary: blankToNull(input.errorSummary),
    })
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.fetchRunId)
    .select(
      "id, restaurant_id, provider, started_at, finished_at, status, requested_stay_from, requested_stay_to, competitor_count, observation_count, error_count, error_summary, created_at",
    )
    .single();
  throwDb(result.error);
  return mapFetchRun(result.data as Record<string, unknown>);
}

export async function completeRateShoppingFetchRun(
  db: DbClient,
  input: {
    restaurantId: string;
    fetchRunId: string;
    status: Extract<RateShoppingFetchRunStatus, "success" | "partial">;
    observationCount: number;
    errorCount?: number;
    errorSummary?: string | null;
  },
): Promise<RateShoppingFetchRun> {
  return finishFetchRun(db, input);
}

export async function failRateShoppingFetchRun(
  db: DbClient,
  input: { restaurantId: string; fetchRunId: string; errorSummary?: string | null; errorCount?: number },
): Promise<RateShoppingFetchRun> {
  return finishFetchRun(db, {
    restaurantId: input.restaurantId,
    fetchRunId: input.fetchRunId,
    status: "failed",
    observationCount: 0,
    errorCount: input.errorCount ?? 1,
    errorSummary: input.errorSummary,
  });
}

export type RateShoppingObservationInsert = {
  competitorId: string;
  provider: string;
  providerPropertyId: string;
  stayDate: string;
  observedAt?: string;
  externalRoomId?: string | null;
  externalRoomName?: string | null;
  externalRatePlanId?: string | null;
  externalRatePlanName?: string | null;
  occupancyAdults?: number | null;
  occupancyChildren?: number | null;
  currency?: string | null;
  rateAmount?: number | null;
  taxBasis?: CompetitorTaxBasis;
  availabilityStatus?: CompetitorRateObservation["availabilityStatus"];
  sourceHash?: string | null;
};

export async function insertRateShoppingObservationBatch(
  db: DbClient,
  input: {
    restaurantId: string;
    fetchRunId: string;
    observations: RateShoppingObservationInsert[];
  },
): Promise<CompetitorRateObservation[]> {
  if (input.observations.length === 0) return [];
  const run = await db
    .from("hotel_rate_shopping_fetch_runs")
    .select("id")
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.fetchRunId)
    .maybeSingle();
  throwDb(run.error);
  if (!run.data) throw new Error("FETCH_RUN_NOT_FOUND");
  const rows = input.observations.map((observation) => {
    const provider = normalizeProviderId(observation.provider);
    const providerPropertyId = normalizeExternalId(observation.providerPropertyId);
    if (!provider) throw new Error("PROVIDER_REQUIRED");
    if (!providerPropertyId) throw new Error("EXTERNAL_PROPERTY_ID_REQUIRED");
    return {
      restaurant_id: input.restaurantId,
      competitor_id: observation.competitorId,
      provider,
      provider_property_id: providerPropertyId,
      fetch_run_id: input.fetchRunId,
      observed_at: observation.observedAt ?? new Date().toISOString(),
      stay_date: observation.stayDate,
      external_room_id: blankToNull(observation.externalRoomId),
      external_room_name: blankToNull(observation.externalRoomName),
      external_rate_plan_id: blankToNull(observation.externalRatePlanId),
      external_rate_plan_name: blankToNull(observation.externalRatePlanName),
      occupancy_adults: observation.occupancyAdults ?? null,
      occupancy_children: observation.occupancyChildren ?? null,
      currency: normalizeCurrencyCode(observation.currency),
      rate_amount: observation.rateAmount ?? null,
      tax_basis: observation.taxBasis ?? "unknown",
      availability_status: observation.availabilityStatus ?? "unknown",
      source_hash: blankToNull(observation.sourceHash),
    };
  });
  const result = await db
    .from("hotel_competitor_rate_observations")
    .insert(rows)
    .select(
      "id, restaurant_id, competitor_id, provider, provider_property_id, fetch_run_id, observed_at, stay_date, external_room_id, external_room_name, external_rate_plan_id, external_rate_plan_name, occupancy_adults, occupancy_children, currency, rate_amount, tax_basis, availability_status, source_hash, created_at",
    );
  throwDb(result.error);
  return ((result.data ?? []) as Record<string, unknown>[]).map(mapObservation);
}
