/**
 * Server domain logic for Travel Agency Creation Step 3: Commission & Rates.
 * Handles:
 *  - Config loading (room types, rate plans, categories, currencies, existing setup)
 *  - Strict server-side validation (rate plan to room type binding, duplicate rule prevention, Net Rate constraints)
 *  - Relational persistence of commission plans, commission rules, rate defaults, and Net Rate agreements
 *  - Conditional cleanup between Commissionable and Net Rate modes
 */

import { isMissingSchemaError } from "./pms-set2-structure.ts";
import { uuidFirstSegment } from "./guest-profile-listing.ts";

export type Step3CommercialModel = "commissionable" | "net_rate";
export type Step3CommissionScope = "all" | "room_type" | "rate_plan";
export type Step3CommissionType = "percent" | "fixed";
export type Step3NetPricingMethod = "rate_plan" | "rate_plan_discount" | "contracted_rates";

export type CommissionRuleInput = {
  id?: string;
  scopeType: Step3CommissionScope;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
  commissionType: Step3CommissionType;
  commissionValue: number;
};

export type AgencyRateDefaultInput = {
  roomTypeId: string;
  ratePlanId: string;
};

export type ContractedRateInput = {
  roomTypeId: string;
  amount: number;
};

export type TravelAgencyCommissionRatesPayload = {
  restaurantId: string;
  agencyId: string;
  commercialModel: Step3CommercialModel;

  // Commissionable fields
  commissionCurrency?: string | null;
  commissionEffectiveOn?: string | null;
  commissionExpiresOn?: string | null;
  commissionNotes?: string | null;
  commissionRules?: CommissionRuleInput[];
  agencyRateDefaults?: AgencyRateDefaultInput[];

  // Net Rate fields
  netPricingMethod?: Step3NetPricingMethod | null;
  netRoomTypeId?: string | null;
  netRatePlanId?: string | null;
  netDiscountType?: "percent" | "fixed" | null;
  netDiscountValue?: number | null;
  netCurrencyCode?: string | null;
  netValidFrom?: string | null;
  netValidUntil?: string | null;
  contractedRates?: ContractedRateInput[];

  // General commercial remarks
  commercialNotes?: string | null;
};

export type Step3RoomTypeOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Step3RatePlanOption = {
  id: string;
  code: string;
  name: string;
  roomTypeId: string;
  roomTypeName: string;
  rateCategoryId: string | null;
  rateCategoryName: string | null;
  currency: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type Step3RateCategoryOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type Step3CurrencyOption = {
  code: string;
  isBase: boolean;
};

export type TravelAgencyCommissionRatesConfig = {
  roomTypes: Step3RoomTypeOption[];
  ratePlans: Step3RatePlanOption[];
  rateCategories: Step3RateCategoryOption[];
  currencies: Step3CurrencyOption[];
  baseCurrency: string;
  currentCommissionPlan?: {
    id: string;
    commissionType: Step3CommissionType;
    rateValue: number;
    currency: string;
    effectiveOn: string;
    expiresOn: string | null;
    notes: string | null;
  } | null;
  commissionRules?: Array<{
    id: string;
    scopeType: Step3CommissionScope;
    roomTypeId: string | null;
    ratePlanId: string | null;
    commissionType: Step3CommissionType;
    commissionValue: number;
  }>;
  agencyRateDefaults?: Array<{
    roomTypeId: string;
    ratePlanId: string;
  }>;
  existingAgreement?: {
    id: string;
    pricingMethod: Step3NetPricingMethod;
    ratePlanId: string | null;
    discountType: "percent" | "fixed" | null;
    discountValue: number | null;
    validFrom: string;
    validTo: string;
    currencyCode: string;
    contractedRates: Array<{
      roomTypeId: string;
      amount: number;
    }>;
  } | null;
};

/**
 * Validates the complete Step 3 submission payload.
 * Throws an Error with a human-readable message if any validation invariant fails.
 */
export function validateTravelAgencyCommissionRates(
  payload: TravelAgencyCommissionRatesPayload,
  context: {
    roomTypes: Step3RoomTypeOption[];
    ratePlans: Step3RatePlanOption[];
  },
): void {
  const { roomTypes, ratePlans } = context;
  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt]));
  const ratePlanMap = new Map(ratePlans.map((rp) => [rp.id, rp]));

  if (payload.commercialModel === "commissionable") {
    // Currency required
    if (!payload.commissionCurrency || !/^[A-Z]{3}$/.test(payload.commissionCurrency.trim())) {
      throw new Error("A valid 3-letter Commission Currency is required for Commissionable model.");
    }

    // Effective dates
    if (!payload.commissionEffectiveOn) {
      throw new Error("Commission Effective From date is required.");
    }
    if (
      payload.commissionExpiresOn &&
      payload.commissionExpiresOn < payload.commissionEffectiveOn
    ) {
      throw new Error("Commission Expires On date cannot be earlier than Effective From date.");
    }

    // Commission Rules validation
    const rules = payload.commissionRules ?? [];
    let allRuleCount = 0;
    const seenRoomTypes = new Set<string>();
    const seenRatePlans = new Set<string>();

    for (const rule of rules) {
      // Commission value check
      if (typeof rule.commissionValue !== "number" || Number.isNaN(rule.commissionValue) || rule.commissionValue < 0) {
        throw new Error("Commission value must be a positive number or zero.");
      }
      if (rule.commissionType === "percent" && rule.commissionValue > 100) {
        throw new Error("Commission percentage cannot exceed 100%.");
      }

      // Scope specific validations
      if (rule.scopeType === "all") {
        allRuleCount++;
        if (allRuleCount > 1) {
          throw new Error("Only one 'Apply to All' commission rule is allowed per commission plan.");
        }
      } else if (rule.scopeType === "room_type") {
        if (!rule.roomTypeId) {
          throw new Error("Room Type is required for a Room Type commission rule.");
        }
        if (!roomTypeMap.has(rule.roomTypeId)) {
          throw new Error("Selected Room Type does not exist in property setup.");
        }
        if (seenRoomTypes.has(rule.roomTypeId)) {
          throw new Error("Duplicate commission rule for Room Type: " + (roomTypeMap.get(rule.roomTypeId)?.name || rule.roomTypeId));
        }
        seenRoomTypes.add(rule.roomTypeId);
      } else if (rule.scopeType === "rate_plan") {
        if (!rule.ratePlanId) {
          throw new Error("Rate Plan is required for a Rate Plan commission rule.");
        }
        const rp = ratePlanMap.get(rule.ratePlanId);
        if (!rp) {
          throw new Error("Selected Rate Plan does not exist in property setup.");
        }
        // Enforce ratePlan.room_type_id === selectedRoomTypeId
        if (rule.roomTypeId && rp.roomTypeId !== rule.roomTypeId) {
          throw new Error(`Rate Plan '${rp.name}' does not belong to the selected Room Type.`);
        }
        if (seenRatePlans.has(rule.ratePlanId)) {
          throw new Error("Duplicate commission rule for Rate Plan: " + rp.name);
        }
        seenRatePlans.add(rule.ratePlanId);
      } else {
        throw new Error(`Unsupported commission rule scope: ${rule.scopeType}`);
      }
    }

    // Agency Rate Defaults validation
    const defaults = payload.agencyRateDefaults ?? [];
    const seenDefaultRooms = new Set<string>();

    for (const def of defaults) {
      if (!def.roomTypeId) {
        throw new Error("Room Type is required for an Agency Rate Default.");
      }
      if (!roomTypeMap.has(def.roomTypeId)) {
        throw new Error("Selected Room Type for rate default does not exist.");
      }
      if (seenDefaultRooms.has(def.roomTypeId)) {
        throw new Error("Duplicate default Rate Plan configured for the same Room Type.");
      }
      seenDefaultRooms.add(def.roomTypeId);

      if (!def.ratePlanId) {
        throw new Error("Default Rate Plan must be selected for Room Type: " + (roomTypeMap.get(def.roomTypeId)?.name || def.roomTypeId));
      }
      const rp = ratePlanMap.get(def.ratePlanId);
      if (!rp) {
        throw new Error("Selected default Rate Plan does not exist.");
      }
      // Critical invariant: Rate Plan must belong to the Room Type
      if (rp.roomTypeId !== def.roomTypeId) {
        throw new Error(`Default Rate Plan '${rp.name}' does not belong to Room Type '${roomTypeMap.get(def.roomTypeId)?.name}'.`);
      }
    }
  } else if (payload.commercialModel === "net_rate") {
    // Net Rate Model validations
    if (!payload.netPricingMethod) {
      throw new Error("Pricing Method is required when commercial model is Net Rate.");
    }
    if (!payload.netValidFrom) {
      throw new Error("Net Rate Valid From date is required.");
    }
    if (!payload.netValidUntil) {
      throw new Error("Net Rate Valid Until date is required.");
    }
    if (payload.netValidUntil < payload.netValidFrom) {
      throw new Error("Net Rate Valid Until date cannot be earlier than Valid From date.");
    }
    if (!payload.netCurrencyCode || !/^[A-Z]{3}$/.test(payload.netCurrencyCode.trim())) {
      throw new Error("A valid 3-letter Settlement Currency is required for Net Rate pricing.");
    }

    if (payload.netPricingMethod === "rate_plan") {
      if (!payload.netRoomTypeId) {
        throw new Error("Room Type is required for Net Rate pricing method.");
      }
      if (!payload.netRatePlanId) {
        throw new Error("Rate Plan is required for Net Rate pricing method.");
      }
      const rp = ratePlanMap.get(payload.netRatePlanId);
      if (!rp || rp.roomTypeId !== payload.netRoomTypeId) {
        throw new Error("Selected Net Rate Plan does not belong to the selected Room Type.");
      }
    } else if (payload.netPricingMethod === "rate_plan_discount") {
      if (!payload.netRoomTypeId) {
        throw new Error("Room Type is required for discount pricing method.");
      }
      if (!payload.netRatePlanId) {
        throw new Error("Base Rate Plan is required for discount pricing method.");
      }
      const rp = ratePlanMap.get(payload.netRatePlanId);
      if (!rp || rp.roomTypeId !== payload.netRoomTypeId) {
        throw new Error("Selected Base Rate Plan does not belong to the selected Room Type.");
      }
      if (!payload.netDiscountType || !["percent", "fixed"].includes(payload.netDiscountType)) {
        throw new Error("Discount Type (Percentage or Fixed) is required.");
      }
      if (
        typeof payload.netDiscountValue !== "number" ||
        Number.isNaN(payload.netDiscountValue) ||
        payload.netDiscountValue < 0
      ) {
        throw new Error("Discount value must be a positive number or zero.");
      }
      if (payload.netDiscountType === "percent" && payload.netDiscountValue > 100) {
        throw new Error("Discount percentage cannot exceed 100%.");
      }
    } else if (payload.netPricingMethod === "contracted_rates") {
      const contracted = payload.contractedRates ?? [];
      if (contracted.length === 0) {
        throw new Error("At least one Room Type contracted rate must be specified.");
      }
      const seenContractRooms = new Set<string>();
      for (const item of contracted) {
        if (!item.roomTypeId || !roomTypeMap.has(item.roomTypeId)) {
          throw new Error("Valid Room Type is required for each contracted rate row.");
        }
        if (seenContractRooms.has(item.roomTypeId)) {
          throw new Error("Duplicate contracted rate row for Room Type: " + (roomTypeMap.get(item.roomTypeId)?.name || item.roomTypeId));
        }
        seenContractRooms.add(item.roomTypeId);
        if (typeof item.amount !== "number" || Number.isNaN(item.amount) || item.amount < 0) {
          throw new Error("Contracted rate amount must be a positive number or zero.");
        }
      }
    } else {
      throw new Error(`Unsupported net pricing method: ${payload.netPricingMethod}`);
    }
  } else {
    throw new Error(`Unsupported commercial model: ${payload.commercialModel}`);
  }
}

/**
 * Loads the complete configuration for Step 3.
 */
export async function loadTravelAgencyCommissionRatesConfig(
  db: { from: (table: string) => any },
  restaurantId: string,
  agencyId?: string | null,
): Promise<TravelAgencyCommissionRatesConfig> {
  // 1. Load Room Types
  const roomTypesRes = await db
    .from("room_types")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  const roomTypes: Step3RoomTypeOption[] = (roomTypesRes.data ?? []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    active: row.active == null ? true : Boolean(row.active),
  }));

  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt.name]));

  // 2. Load Rate Categories
  const categoriesRes = await db
    .from("hotel_rate_categories")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  const rateCategories: Step3RateCategoryOption[] = (categoriesRes.data ?? []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    active: row.active == null ? true : Boolean(row.active),
  }));

  const categoryMap = new Map(rateCategories.map((c) => [c.id, c.name]));

  // 3. Load Rate Plans
  const ratePlansRes = await db
    .from("hotel_rate_plans")
    .select("id, code, name, room_type_id, rate_category_id, currency, active, valid_from, valid_to")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  const ratePlans: Step3RatePlanOption[] = (ratePlansRes.data ?? []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    roomTypeId: String(row.room_type_id),
    roomTypeName: roomTypeMap.get(String(row.room_type_id)) || "Unknown Room",
    rateCategoryId: row.rate_category_id ? String(row.rate_category_id) : null,
    rateCategoryName: row.rate_category_id ? categoryMap.get(String(row.rate_category_id)) || null : null,
    currency: String(row.currency || "ETB"),
    active: row.active == null ? true : Boolean(row.active),
    validFrom: row.valid_from ? String(row.valid_from) : null,
    validTo: row.valid_to ? String(row.valid_to) : null,
  }));

  // 4. Load Restaurant Base Currency & Supported Currencies
  const restRes = await db
    .from("restaurants")
    .select("currency_code")
    .eq("id", restaurantId)
    .maybeSingle();

  const baseCurrency = restRes.data?.currency_code || "ETB";
  const currencies: Step3CurrencyOption[] = [
    { code: baseCurrency, isBase: true },
    ...["USD", "EUR", "GBP"]
      .filter((c) => c !== baseCurrency)
      .map((code) => ({ code, isBase: false })),
  ];

  let currentCommissionPlan: TravelAgencyCommissionRatesConfig["currentCommissionPlan"] = null;
  let commissionRules: TravelAgencyCommissionRatesConfig["commissionRules"] = [];
  let agencyRateDefaults: TravelAgencyCommissionRatesConfig["agencyRateDefaults"] = [];
  let existingAgreement: TravelAgencyCommissionRatesConfig["existingAgreement"] = null;

  if (agencyId) {
    // 5. Load Active Commission Plan
    const planRes = await db
      .from("pms_agency_commission_plans")
      .select("id, commission_type, rate_value, currency, effective_on, expires_on, notes, active")
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId)
      .eq("active", true)
      .order("effective_on", { ascending: false })
      .maybeSingle();

    if (planRes.data) {
      currentCommissionPlan = {
        id: String(planRes.data.id),
        commissionType: planRes.data.commission_type,
        rateValue: Number(planRes.data.rate_value),
        currency: String(planRes.data.currency),
        effectiveOn: String(planRes.data.effective_on),
        expiresOn: planRes.data.expires_on ? String(planRes.data.expires_on) : null,
        notes: planRes.data.notes ? String(planRes.data.notes) : null,
      };

      // 6. Load Commission Rules for Plan
      const rulesRes = await db
        .from("pms_agency_commission_rules")
        .select("id, scope_type, room_type_id, rate_plan_id, commission_type, commission_value, active")
        .eq("restaurant_id", restaurantId)
        .eq("commission_plan_id", currentCommissionPlan.id)
        .eq("active", true)
        .order("display_order", { ascending: true });

      if (rulesRes.data) {
        commissionRules = rulesRes.data.map((r: any) => ({
          id: String(r.id),
          scopeType: r.scope_type,
          roomTypeId: r.room_type_id ? String(r.room_type_id) : null,
          ratePlanId: r.rate_plan_id ? String(r.rate_plan_id) : null,
          commissionType: r.commission_type,
          commissionValue: Number(r.commission_value),
        }));
      }
    }

    // 7. Load Agency Rate Defaults
    const defaultsRes = await db
      .from("pms_agency_rate_defaults")
      .select("room_type_id, rate_plan_id")
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId)
      .eq("active", true);

    if (defaultsRes.data) {
      agencyRateDefaults = defaultsRes.data.map((d: any) => ({
        roomTypeId: String(d.room_type_id),
        ratePlanId: String(d.rate_plan_id),
      }));
    }

    // 8. Load Existing Net Rate Agreement
    const agreementRes = await db
      .from("pms_corporate_agreements")
      .select("id, pricing_method, rate_plan_id, discount_type, discount_value, valid_from, valid_to, currency_code, active")
      .eq("restaurant_id", restaurantId)
      .eq("company_id", agencyId)
      .eq("active", true)
      .order("valid_from", { ascending: false })
      .maybeSingle();

    if (agreementRes.data) {
      let contractedRatesList: Array<{ roomTypeId: string; amount: number }> = [];
      if (agreementRes.data.pricing_method === "contracted_rates") {
        const ratesRes = await db
          .from("pms_contract_rates")
          .select("room_type_id, amount")
          .eq("restaurant_id", restaurantId)
          .eq("agreement_id", agreementRes.data.id)
          .eq("active", true);
        if (ratesRes.data) {
          contractedRatesList = ratesRes.data.map((r: any) => ({
            roomTypeId: String(r.room_type_id),
            amount: Number(r.amount),
          }));
        }
      }
      existingAgreement = {
        id: String(agreementRes.data.id),
        pricingMethod: agreementRes.data.pricing_method as Step3NetPricingMethod,
        ratePlanId: agreementRes.data.rate_plan_id ? String(agreementRes.data.rate_plan_id) : null,
        discountType: agreementRes.data.discount_type as any,
        discountValue: agreementRes.data.discount_value != null ? Number(agreementRes.data.discount_value) : null,
        validFrom: String(agreementRes.data.valid_from),
        validTo: String(agreementRes.data.valid_to),
        currencyCode: String(agreementRes.data.currency_code),
        contractedRates: contractedRatesList,
      };
    }
  }

  return {
    roomTypes,
    ratePlans,
    rateCategories,
    currencies,
    baseCurrency,
    currentCommissionPlan,
    commissionRules,
    agencyRateDefaults,
    existingAgreement,
  };
}

/**
 * Persists Step 3 configuration to database with full conditional cleanup.
 */
export async function executeSaveTravelAgencyCommissionRates(
  db: { from: (table: string) => any },
  payload: TravelAgencyCommissionRatesPayload,
): Promise<{ success: boolean; commissionPlanId?: string; agreementId?: string }> {
  const { restaurantId, agencyId, commercialModel } = payload;

  if (commercialModel === "commissionable") {
    // 1. Conditional cleanup: Inactivate any existing Net Rate agreements for this agency
    await db
      .from("pms_corporate_agreements")
      .update({ active: false, status: "terminated", updated_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("company_id", agencyId);

    // 2. Resolve / Upsert Commission Plan
    const currency = (payload.commissionCurrency || "ETB").trim();
    const effectiveOn = payload.commissionEffectiveOn || new Date().toISOString().slice(0, 10);
    const expiresOn = payload.commissionExpiresOn || null;
    const notes = payload.commissionNotes || null;

    // Use top rule or default to percent 10 for legacy dual-write fields
    const rules = payload.commissionRules ?? [];
    const topRule = rules[0] || { commissionType: "percent", commissionValue: 10 };
    const legacyType = topRule.commissionType;
    const legacyValue = topRule.commissionValue;

    // Deactivate existing active plans for this agency
    await db
      .from("pms_agency_commission_plans")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId);

    // Insert new active commission plan
    const insertedPlan = await db
      .from("pms_agency_commission_plans")
      .insert({
        restaurant_id: restaurantId,
        agency_master_id: agencyId,
        commission_type: legacyType,
        rate_value: legacyValue,
        currency,
        effective_on: effectiveOn,
        expires_on: expiresOn,
        active: true,
        notes,
      })
      .select("id")
      .single();

    if (insertedPlan.error) throw new Error(insertedPlan.error.message);
    const commissionPlanId = insertedPlan.data.id as string;

    // 3. Insert Commission Rules
    if (rules.length > 0) {
      const ruleRows = rules.map((r, index) => ({
        restaurant_id: restaurantId,
        commission_plan_id: commissionPlanId,
        scope_type: r.scopeType,
        room_type_id: r.scopeType !== "all" ? r.roomTypeId || null : null,
        rate_plan_id: r.scopeType === "rate_plan" ? r.ratePlanId || null : null,
        commission_type: r.commissionType,
        commission_value: r.commissionValue,
        active: true,
        display_order: index,
      }));

      const insertedRules = await db.from("pms_agency_commission_rules").insert(ruleRows);
      if (insertedRules.error) throw new Error(insertedRules.error.message);
    }

    // 4. Upsert Agency Rate Defaults
    // Clear old defaults for agency
    await db
      .from("pms_agency_rate_defaults")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId);

    const rateDefaults = payload.agencyRateDefaults ?? [];
    if (rateDefaults.length > 0) {
      const defaultRows = rateDefaults.map((d) => ({
        restaurant_id: restaurantId,
        agency_master_id: agencyId,
        room_type_id: d.roomTypeId,
        rate_plan_id: d.ratePlanId,
        active: true,
      }));
      const insertedDefaults = await db.from("pms_agency_rate_defaults").insert(defaultRows);
      if (insertedDefaults.error) throw new Error(insertedDefaults.error.message);
    }

    // 5. Update legacy fields on guest_account_masters for compatibility
    await db
      .from("guest_account_masters")
      .update({
        commission_type: legacyType,
        commission_label: `${legacyValue}${legacyType === "percent" ? "%" : " " + currency}`,
        commission_currency_note: currency,
        preferred_currency: currency,
        notes: payload.commercialNotes || undefined,
      })
      .eq("restaurant_id", restaurantId)
      .eq("id", agencyId);

    return { success: true, commissionPlanId };
  } else {
    // Net Rate Model
    // 1. Conditional cleanup: Inactivate any existing active Commission Plans and Rules
    await db
      .from("pms_agency_commission_plans")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId);

    // 2. Clear old rate defaults if inappropriate
    await db
      .from("pms_agency_rate_defaults")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("agency_master_id", agencyId);

    // 3. Deactivate old agreements
    await db
      .from("pms_corporate_agreements")
      .update({ active: false, status: "terminated", updated_at: new Date().toISOString() })
      .eq("restaurant_id", restaurantId)
      .eq("company_id", agencyId);

    // 4. Create new Net Rate Agreement
    const pricingMethod = payload.netPricingMethod || "rate_plan";
    const validFrom = payload.netValidFrom || new Date().toISOString().slice(0, 10);
    const validTo = payload.netValidUntil || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const currencyCode = (payload.netCurrencyCode || "ETB").trim();
    const code = `NET_${(uuidFirstSegment(crypto.randomUUID()) ?? "TA").toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 20);

    const agreementPayload: Record<string, any> = {
      restaurant_id: restaurantId,
      company_id: agencyId,
      agency_master_id: agencyId,
      code,
      name: `Net Rate Agreement — ${validFrom}`,
      contract_number: `AGMT-${code}`,
      valid_from: validFrom,
      valid_to: validTo,
      currency_code: currencyCode,
      status: "active",
      pricing_method: pricingMethod,
      active: true,
      description: payload.commercialNotes || "Travel Agency Confidential Wholesale Agreement",
    };

    if (pricingMethod === "rate_plan") {
      agreementPayload.rate_plan_id = payload.netRatePlanId;
    } else if (pricingMethod === "rate_plan_discount") {
      agreementPayload.rate_plan_id = payload.netRatePlanId;
      agreementPayload.discount_type = payload.netDiscountType;
      agreementPayload.discount_value = payload.netDiscountValue;
    }

    const insertedAgmt = await db
      .from("pms_corporate_agreements")
      .insert(agreementPayload)
      .select("id")
      .single();

    if (insertedAgmt.error) throw new Error(insertedAgmt.error.message);
    const agreementId = insertedAgmt.data.id as string;

    // If contracted_rates, insert lines into pms_contract_rates
    if (pricingMethod === "contracted_rates" && payload.contractedRates && payload.contractedRates.length > 0) {
      const rateRows = payload.contractedRates.map((cr) => ({
        restaurant_id: restaurantId,
        agreement_id: agreementId,
        room_type_id: cr.roomTypeId,
        rate_kind: "negotiated",
        amount: cr.amount,
        valid_from: validFrom,
        valid_to: validTo,
        active: true,
      }));
      const insertedRates = await db.from("pms_contract_rates").insert(rateRows);
      if (insertedRates.error) throw new Error(insertedRates.error.message);
    }

    // Update guest_account_masters: disable legacy commission flags
    await db
      .from("guest_account_masters")
      .update({
        commission_type: null,
        commission_label: null,
        preferred_currency: currencyCode,
        notes: payload.commercialNotes || undefined,
      })
      .eq("restaurant_id", restaurantId)
      .eq("id", agencyId);

    return { success: true, agreementId };
  }
}
