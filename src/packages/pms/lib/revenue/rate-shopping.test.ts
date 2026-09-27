import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { foundationRevenueViews, implementedRevenueViews, REVENUE_UI_SCREEN_MAP } from "../rate-revenue-workspace.ts";
import {
  assessCompetitorRateComparability,
  composeCompetitorSetupWorkspace,
  competitorSetupStatus,
  normalizeCurrencyCode,
  normalizeExternalId,
  normalizeProviderId,
  RATE_SHOPPING_EMPTY_COPY,
  RATE_SHOPPING_HEADER_HELPER,
  RATE_SHOPPING_LIVE_COLLECTION_NOTE,
  RATE_SHOPPING_LIVE_PROVIDER,
  RATE_SHOPPING_OBSERVATION_IMMUTABLE,
  validateCompetitorName,
  type CompetitorComparabilityInput,
  type HotelCompetitor,
} from "./rate-shopping.ts";
import {
  createCompetitorProviderMapping,
  createCompetitorRoomMapping,
  createHotelCompetitor,
  getCompetitorSetupWorkspace,
  insertRateShoppingObservationBatch,
  listHotelCompetitors,
  startRateShoppingFetchRun,
  updateHotelCompetitor,
} from "./rate-shopping.server.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const drizzle = readRel("../../../../../drizzle/migrations/0108_pms_rate_shopping_foundation.sql");
const supabase = readRel("../../../../../supabase/migrations/0108_pms_rate_shopping_foundation.sql");
const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");

const PROPERTY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROOM_STD = "11111111-1111-4111-8111-111111111111";
const ROOM_DLX = "22222222-2222-4222-8222-222222222222";

function now() {
  return "2026-09-26T08:00:00.000Z";
}

function createMemoryDb() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    hotel_competitors: [],
    hotel_competitor_provider_mappings: [],
    hotel_competitor_room_mappings: [],
    hotel_rate_shopping_fetch_runs: [],
    hotel_competitor_rate_observations: [],
    room_types: [
      { id: ROOM_STD, restaurant_id: PROPERTY_A, name: "Standard", active: true },
      { id: ROOM_DLX, restaurant_id: PROPERTY_A, name: "Deluxe", active: true },
    ],
  };

  function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let mode: "select" | "insert" | "update" = "select";
    let payload: unknown = null;
    let wantSingle = false;
    let wantMaybe = false;

    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      insert(value: unknown) {
        mode = "insert";
        payload = value;
        return api;
      },
      update(value: unknown) {
        mode = "update";
        payload = value;
        return api;
      },
      delete() {
        if (table === "hotel_competitor_rate_observations") {
          return Promise.reject(new Error(RATE_SHOPPING_OBSERVATION_IMMUTABLE));
        }
        return Promise.reject(new Error("DELETE_NOT_SUPPORTED"));
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      order() {
        return api;
      },
      single() {
        wantSingle = true;
        return execute();
      },
      maybeSingle() {
        wantMaybe = true;
        return execute();
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return execute().then(resolve, reject);
      },
    };

    async function execute() {
      try {
        if (mode === "insert") {
          if (table === "hotel_competitor_rate_observations" && filters.length) {
            throw new Error("OBSERVATION_INSERT_MUST_NOT_FILTER");
          }
          const rows = Array.isArray(payload) ? payload : [payload];
          const inserted = rows.map((row) => {
            const next = {
              ...(row as Record<string, unknown>),
              id: crypto.randomUUID(),
              created_at: now(),
              updated_at: now(),
              started_at: (row as Record<string, unknown>).started_at ?? now(),
              mapping_status: (row as Record<string, unknown>).mapping_status ?? "manual",
            };
            if (table === "hotel_competitor_provider_mappings") {
              const dup = tables[table]!.some(
                (existing) =>
                  existing.competitor_id === next.competitor_id && existing.provider === next.provider,
              );
              if (dup) throw new Error("duplicate key value violates unique constraint");
            }
            if (table === "hotel_competitor_room_mappings") {
              const dup = tables[table]!.some(
                (existing) =>
                  existing.competitor_id === next.competitor_id &&
                  existing.provider === next.provider &&
                  existing.our_room_type_id === next.our_room_type_id &&
                  existing.external_room_id === next.external_room_id,
              );
              if (dup) throw new Error("duplicate key value violates unique constraint");
            }
            tables[table]!.push(next);
            return next;
          });
          return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
        }
        if (mode === "update") {
          if (table === "hotel_competitor_rate_observations") {
            throw new Error(RATE_SHOPPING_OBSERVATION_IMMUTABLE);
          }
          const idx = tables[table]!.findIndex((row) => matches(row, filters));
          if (idx < 0) return { data: wantMaybe ? null : undefined, error: idx < 0 && wantSingle ? { message: "not found" } : null };
          tables[table]![idx] = {
            ...tables[table]![idx],
            ...(payload as Record<string, unknown>),
            updated_at: now(),
          };
          return { data: tables[table]![idx], error: null };
        }
        const found = tables[table]!.filter((row) => matches(row, filters));
        if (wantSingle || wantMaybe) {
          return { data: found[0] ?? null, error: wantSingle && !found[0] ? { message: "not found" } : null };
        }
        return { data: found, error: null };
      } catch (error) {
        if (error instanceof Error && error.message === RATE_SHOPPING_OBSERVATION_IMMUTABLE) throw error;
        return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
      }
    }

    return api;
  }

  return { from, tables };
}

function comparableBase(): CompetitorComparabilityInput {
  return {
    stayDate: "2026-10-01",
    ourStayDate: "2026-10-01",
    roomMapped: true,
    occupancyAdults: 2,
    occupancyChildren: 0,
    ourOccupancyAdults: 2,
    ourOccupancyChildren: 0,
    currency: "usd",
    ourCurrency: "USD",
    taxBasis: "inclusive",
    ourTaxBasis: "inclusive",
  };
}

function competitor(partial: Partial<HotelCompetitor> = {}): HotelCompetitor {
  return {
    id: "c1",
    restaurantId: PROPERTY_A,
    name: "Harbor Inn",
    active: true,
    locationLabel: "Waterfront",
    notes: null,
    createdAt: now(),
    updatedAt: now(),
    ...partial,
  };
}

describe("P6-STEP-01 — schema foundation", () => {
  it("keeps 0108 SQL identical across drizzle and supabase", () => {
    assert.equal(drizzle, supabase);
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0108_pms_rate_shopping_foundation.sql"));
    assert.ok(!migrations.includes("0108_pms_competitor_rate_mappings.sql"));
  });

  it("creates the five foundation tables and no rate-plan mapping table", () => {
    assert.match(supabase, /CREATE TABLE public\.hotel_competitors/);
    assert.match(supabase, /CREATE TABLE public\.hotel_competitor_provider_mappings/);
    assert.match(supabase, /CREATE TABLE public\.hotel_competitor_room_mappings/);
    assert.match(supabase, /CREATE TABLE public\.hotel_rate_shopping_fetch_runs/);
    assert.match(supabase, /CREATE TABLE public\.hotel_competitor_rate_observations/);
    assert.doesNotMatch(supabase, /CREATE TABLE public\.hotel_competitor_rate_mappings/);
    assert.doesNotMatch(supabase, /INSERT INTO public\.hotel_competitors/);
    assert.doesNotMatch(supabase, /booking_com|expedia|agoda/i);
  });

  it("enables RLS and manager-read / service-write policy", () => {
    assert.match(supabase, /ENABLE ROW LEVEL SECURITY/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_competitors TO authenticated/);
    assert.match(supabase, /GRANT SELECT ON public\.hotel_competitor_rate_observations TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_competitors TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT INSERT ON public\.hotel_competitor_rate_observations TO authenticated/);
    assert.doesNotMatch(supabase, /GRANT UPDATE ON public\.hotel_competitor_rate_observations TO authenticated/);
    assert.match(supabase, /GRANT ALL ON public\.hotel_competitor_rate_observations TO service_role/);
    assert.match(supabase, /has_restaurant_role\(restaurant_id, 'owner'\)/);
    assert.match(supabase, /has_restaurant_role\(restaurant_id, 'manager'\)/);
  });

  it("blocks observation UPDATE and DELETE", () => {
    assert.match(supabase, /RAISE EXCEPTION 'RATE_SHOPPING_OBSERVATION_IMMUTABLE'/);
    assert.equal(RATE_SHOPPING_OBSERVATION_IMMUTABLE, "RATE_SHOPPING_OBSERVATION_IMMUTABLE");
    assert.match(supabase, /BEFORE UPDATE OR DELETE ON public\.hotel_competitor_rate_observations/);
  });

  it("does not change pricing contracts or reuse outbound distribution mappings", () => {
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.hotel_reservations/);
    assert.doesNotMatch(supabase, /room_subtotal|nightly_rate_snapshot/);
    assert.doesNotMatch(supabase, /CREATE TABLE public\.distribution_|pms_integrations/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.hotel_reservations/);
    assert.doesNotMatch(supabase, /ALTER TABLE public\.hotel_promotion_activations/);
  });
});

describe("P6-STEP-01 — normalization and comparability", () => {
  it("normalizes provider, external id, and currency conservatively", () => {
    assert.equal(normalizeProviderId(" AioSell "), "aiosell");
    assert.equal(normalizeProviderId("Generic OTA"), "Generic OTA");
    assert.equal(normalizeExternalId("  ext-1  "), "ext-1");
    assert.equal(normalizeCurrencyCode("usd"), "USD");
    assert.equal(normalizeCurrencyCode("US"), null);
    assert.equal(normalizeCurrencyCode(" dollar "), null);
    assert.equal(validateCompetitorName("  Harbor  "), "Harbor");
    assert.throws(() => validateCompetitorName("  "), /COMPETITOR_NAME_REQUIRED/);
  });

  it("returns comparable only when stay, room, occupancy, currency, and tax match", () => {
    assert.deepEqual(assessCompetitorRateComparability(comparableBase()), {
      comparable: true,
      reasons: [],
    });
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), roomMapped: false }).reasons, [
      "room_unmapped",
    ]);
    assert.deepEqual(
      assessCompetitorRateComparability({ ...comparableBase(), occupancyAdults: null }).reasons,
      ["occupancy_unknown"],
    );
    assert.deepEqual(
      assessCompetitorRateComparability({ ...comparableBase(), occupancyAdults: 1 }).reasons,
      ["occupancy_mismatch"],
    );
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), currency: "EUR" }).reasons, [
      "currency_mismatch",
    ]);
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), taxBasis: "unknown" }).reasons, [
      "tax_basis_unknown",
    ]);
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), taxBasis: "exclusive" }).reasons, [
      "tax_basis_mismatch",
    ]);
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), stayDate: "2026-10-02" }).reasons, [
      "stay_date_mismatch",
    ]);
    assert.deepEqual(assessCompetitorRateComparability({ ...comparableBase(), currency: "xx" }).reasons, [
      "currency_unknown",
    ]);
  });

  it("computes honest setup readiness without Ready for Shopping", () => {
    assert.equal(
      competitorSetupStatus({ activeProviderMappings: 0, mappedRoomTypeIds: [], propertyRoomTypeIds: [ROOM_STD] }),
      "no_provider_mapping",
    );
    assert.equal(
      competitorSetupStatus({ activeProviderMappings: 1, mappedRoomTypeIds: [], propertyRoomTypeIds: [ROOM_STD] }),
      "no_room_mapping",
    );
    assert.equal(
      competitorSetupStatus({
        activeProviderMappings: 1,
        mappedRoomTypeIds: [ROOM_STD],
        propertyRoomTypeIds: [ROOM_STD, ROOM_DLX],
      }),
      "partially_mapped",
    );
    assert.equal(
      competitorSetupStatus({
        activeProviderMappings: 1,
        mappedRoomTypeIds: [ROOM_STD, ROOM_DLX],
        propertyRoomTypeIds: [ROOM_STD, ROOM_DLX],
      }),
      "mapped",
    );
    const workspace = composeCompetitorSetupWorkspace({
      competitors: [competitor()],
      providerMappings: [],
      roomMappings: [],
      roomTypes: [{ id: ROOM_STD, name: "Standard", active: true }],
    });
    assert.equal(workspace.liveRateCollectionAvailable, false);
    assert.equal(workspace.liveRateCollectionNote, RATE_SHOPPING_LIVE_COLLECTION_NOTE);
    assert.equal(workspace.competitors[0]?.setupLabel, "No Provider Mapping");
    assert.equal(RATE_SHOPPING_LIVE_PROVIDER, false);
  });
});

describe("P6-STEP-01 — competitor CRUD, mappings, and tenant isolation", () => {
  it("creates, edits, deactivates, and reactivates a competitor", async () => {
    const db = createMemoryDb();
    const created = await createHotelCompetitor(db, {
      restaurantId: PROPERTY_A,
      name: " Harbor Inn ",
      locationLabel: "Waterfront",
    });
    assert.equal(created.name, "Harbor Inn");
    assert.equal(created.active, true);
    const edited = await updateHotelCompetitor(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      name: "Harbor House",
    });
    assert.equal(edited.name, "Harbor House");
    const off = await updateHotelCompetitor(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      active: false,
    });
    assert.equal(off.active, false);
    const on = await updateHotelCompetitor(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      active: true,
    });
    assert.equal(on.active, true);
  });

  it("prevents cross-property competitor reads and writes", async () => {
    const db = createMemoryDb();
    const created = await createHotelCompetitor(db, { restaurantId: PROPERTY_A, name: "Harbor Inn" });
    const other = await listHotelCompetitors(db, PROPERTY_B);
    assert.equal(other.length, 0);
    await assert.rejects(
      () => updateHotelCompetitor(db, { restaurantId: PROPERTY_B, competitorId: created.id, name: "X" }),
      /COMPETITOR_NOT_FOUND/,
    );
  });

  it("creates provider and room mappings and rejects duplicates and missing provider", async () => {
    const db = createMemoryDb();
    const created = await createHotelCompetitor(db, { restaurantId: PROPERTY_A, name: "Harbor Inn" });
    await assert.rejects(
      () =>
        createCompetitorRoomMapping(db, {
          restaurantId: PROPERTY_A,
          competitorId: created.id,
          provider: "shop",
          ourRoomTypeId: ROOM_STD,
          externalRoomId: "ext-std",
        }),
      /ROOM_MAPPING_REQUIRES_PROVIDER/,
    );
    const provider = await createCompetitorProviderMapping(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      provider: "Shop",
      externalPropertyId: " prop-1 ",
    });
    assert.equal(provider.provider, "shop");
    assert.equal(provider.externalPropertyId, "prop-1");
    await assert.rejects(
      () =>
        createCompetitorProviderMapping(db, {
          restaurantId: PROPERTY_A,
          competitorId: created.id,
          provider: "shop",
          externalPropertyId: "prop-2",
        }),
      /already exists|duplicate key/i,
    );
    const room = await createCompetitorRoomMapping(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      provider: "shop",
      ourRoomTypeId: ROOM_STD,
      externalRoomId: "ext-std",
    });
    assert.equal(room.mappingStatus, "manual");
    const variant = await createCompetitorRoomMapping(db, {
      restaurantId: PROPERTY_A,
      competitorId: created.id,
      provider: "shop",
      ourRoomTypeId: ROOM_STD,
      externalRoomId: "ext-std-sea",
    });
    assert.equal(variant.externalRoomId, "ext-std-sea");
    await assert.rejects(
      () =>
        createCompetitorRoomMapping(db, {
          restaurantId: PROPERTY_A,
          competitorId: created.id,
          provider: "shop",
          ourRoomTypeId: ROOM_STD,
          externalRoomId: "ext-std",
        }),
      /already exists|duplicate key/i,
    );
    await assert.rejects(
      () =>
        createCompetitorRoomMapping(db, {
          restaurantId: PROPERTY_B,
          competitorId: created.id,
          provider: "shop",
          ourRoomTypeId: ROOM_STD,
          externalRoomId: "ext-other",
        }),
      /COMPETITOR_NOT_FOUND/,
    );
  });

  it("appends observations and rejects observation mutation", async () => {
    const db = createMemoryDb();
    const created = await createHotelCompetitor(db, { restaurantId: PROPERTY_A, name: "Harbor Inn" });
    const run = await startRateShoppingFetchRun(db, {
      restaurantId: PROPERTY_A,
      provider: "shop",
      requestedStayFrom: "2026-10-01",
      requestedStayTo: "2026-10-03",
    });
    const first = await insertRateShoppingObservationBatch(db, {
      restaurantId: PROPERTY_A,
      fetchRunId: run.id,
      observations: [
        {
          competitorId: created.id,
          provider: "shop",
          providerPropertyId: "prop-1",
          stayDate: "2026-10-01",
          currency: "usd",
          rateAmount: 120,
          occupancyAdults: 2,
          occupancyChildren: 0,
        },
      ],
    });
    assert.equal(first.length, 1);
    assert.equal(first[0]?.currency, "USD");
    const second = await insertRateShoppingObservationBatch(db, {
      restaurantId: PROPERTY_A,
      fetchRunId: run.id,
      observations: [
        {
          competitorId: created.id,
          provider: "shop",
          providerPropertyId: "prop-1",
          stayDate: "2026-10-02",
          currency: "USD",
          rateAmount: 130,
        },
      ],
    });
    assert.equal(second.length, 1);
    await assert.rejects(
      () =>
        db
          .from("hotel_competitor_rate_observations")
          .update({ rate_amount: 1 })
          .eq("id", first[0]!.id)
          .single(),
      /RATE_SHOPPING_OBSERVATION_IMMUTABLE/,
    );
    await assert.rejects(
      () => db.from("hotel_competitor_rate_observations").delete(),
      /RATE_SHOPPING_OBSERVATION_IMMUTABLE/,
    );
    const workspace = await getCompetitorSetupWorkspace(db, PROPERTY_A);
    assert.equal(workspace.competitors.length, 1);
    assert.equal(workspace.liveRateCollectionAvailable, false);
    assert.ok(!("observations" in workspace));
  });
});

describe("P6-STEP-01 — access, UI-24, and honest capabilities", () => {
  it("reuses requireRateManager and does not expose observation writes", () => {
    const functions = readRel("./rate-shopping.functions.ts");
    const server = readRel("./rate-shopping.server.ts");
    assert.match(functions, /requireRateManager/);
    assert.match(functions, /export const listHotelCompetitors/);
    assert.match(functions, /export const createHotelCompetitor/);
    assert.match(functions, /export const updateHotelCompetitor/);
    assert.match(functions, /export const listCompetitorProviderMappings/);
    assert.match(functions, /export const createCompetitorProviderMapping/);
    assert.match(functions, /export const listCompetitorRoomMappings/);
    assert.match(functions, /export const getCompetitorSetupWorkspace/);
    assert.doesNotMatch(functions, /insertRateShoppingObservationBatch|startRateShoppingFetchRun/);
    assert.match(server, /export async function insertRateShoppingObservationBatch/);
    assert.match(server, /export async function startRateShoppingFetchRun/);
    assert.doesNotMatch(functions, /canViewRateShopping/);
    assert.doesNotMatch(readRel("./revenue-access.ts"), /canViewRateShopping/);
  });

  it("marks UI-24 implemented and keeps market-intelligence foundation", () => {
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-24")?.view, "competitor-setup");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-22")?.view, "market-intelligence");
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-23")?.view, null);
    assert.equal(REVENUE_UI_SCREEN_MAP.find((row) => row.ui === "UI-25")?.view, null);
    assert.ok(implementedRevenueViews().includes("competitor-setup"));
    assert.ok(foundationRevenueViews().includes("market-intelligence"));
    assert.ok(!implementedRevenueViews().includes("market-intelligence"));
    const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
    assert.match(workspace, /case "competitor-setup"/);
    assert.match(workspace, /<CompetitorSetupView/);
  });

  it("renders setup-only Competitor Setup without fake rate capabilities", () => {
    const view = readRel("../../components/rates/competitor-setup/competitor-setup-view.tsx");
    const drawer = readRel("../../components/rates/competitor-setup/competitor-detail-drawer.tsx");
    const forms = readRel("../../components/rates/competitor-setup/competitor-setup-forms.tsx");
    const ui = [view, drawer, forms].join("\n");
    assert.match(view, /Competitor Setup/);
    assert.match(view, /Configure competitor hotels and mappings for future rate shopping/);
    assert.match(view, /RATE_SHOPPING_HEADER_HELPER/);
    assert.equal(RATE_SHOPPING_HEADER_HELPER, "Live competitor rates require a connected rate-shopping provider.");
    assert.match(view, /Add Competitor/);
    assert.match(view, /RATE_SHOPPING_EMPTY_COPY/);
    assert.equal(RATE_SHOPPING_EMPTY_COPY, "No competitors configured.");
    assert.match(view, /Unmapped Competitors/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Provider Mapping/);
    assert.match(drawer, /Room Mapping/);
    assert.match(drawer, /RATE_SHOPPING_ROOM_REQUIRES_PROVIDER/);
    assert.match(drawer, /Edit Competitor/);
    assert.match(drawer, /Deactivate/);
    assert.doesNotMatch(ui, /Refresh Rates|Shop Rates|Compare Rates|Compare Now/);
    assert.doesNotMatch(ui, /Market Average|Rate Position|Competitor Price|Rate Recommendation/);
    assert.doesNotMatch(ui, /Trend|Fresh\/Stale|Fresh Rates|Market Position/);
    assert.doesNotMatch(drawer, /Latest Rate|Rate History|Market History/);
    assert.doesNotMatch(ui, /aiosell|generic_ota|booking_com|expedia/);
    assert.doesNotMatch(ui, /distribution_/);
  });
});
