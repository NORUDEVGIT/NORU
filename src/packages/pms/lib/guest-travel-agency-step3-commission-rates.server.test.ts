import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateTravelAgencyCommissionRates,
  type Step3RoomTypeOption,
  type Step3RatePlanOption,
  type TravelAgencyCommissionRatesPayload,
} from "./guest-travel-agency-step3-commission-rates.server.ts";

describe("Travel Agency Step 3 Server Validation", () => {
  const roomTypes: Step3RoomTypeOption[] = [
    { id: "rt-std", code: "STD", name: "Standard Room", active: true },
    { id: "rt-dlx", code: "DLX", name: "Deluxe Room", active: true },
  ];

  const ratePlans: Step3RatePlanOption[] = [
    {
      id: "rp-bar-std",
      code: "BAR-STD",
      name: "BAR Standard",
      roomTypeId: "rt-std",
      roomTypeName: "Standard Room",
      rateCategoryId: "cat-bar",
      rateCategoryName: "BAR",
      currency: "ETB",
      active: true,
      validFrom: null,
      validTo: null,
    },
    {
      id: "rp-bar-dlx",
      code: "BAR-DLX",
      name: "BAR Deluxe",
      roomTypeId: "rt-dlx",
      roomTypeName: "Deluxe Room",
      rateCategoryId: "cat-bar",
      rateCategoryName: "BAR",
      currency: "ETB",
      active: true,
      validFrom: null,
      validTo: null,
    },
    {
      id: "rp-corp-dlx",
      code: "CORP-DLX",
      name: "Corporate Deluxe",
      roomTypeId: "rt-dlx",
      roomTypeName: "Deluxe Room",
      rateCategoryId: "cat-corp",
      rateCategoryName: "Corporate",
      currency: "ETB",
      active: true,
      validFrom: null,
      validTo: null,
    },
  ];

  const context = { roomTypes, ratePlans };

  describe("Commissionable Model Validation", () => {
    const baseCommissionablePayload: TravelAgencyCommissionRatesPayload = {
      restaurantId: "rest-1",
      agencyId: "agency-1",
      commercialModel: "commissionable",
      commissionCurrency: "ETB",
      commissionEffectiveOn: "2026-01-01",
      commissionExpiresOn: "2026-12-31",
      commissionRules: [
        {
          scopeType: "all",
          commissionType: "percent",
          commissionValue: 10,
        },
      ],
      agencyRateDefaults: [
        {
          roomTypeId: "rt-std",
          ratePlanId: "rp-bar-std",
        },
      ],
    };

    it("accepts a valid commissionable payload", () => {
      assert.doesNotThrow(() => {
        validateTravelAgencyCommissionRates(baseCommissionablePayload, context);
      });
    });

    it("rejects missing or invalid currency", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            { ...baseCommissionablePayload, commissionCurrency: "" },
            context,
          );
        },
        /Commission Currency is required/,
      );
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            { ...baseCommissionablePayload, commissionCurrency: "TOOLONG" },
            context,
          );
        },
        /Commission Currency is required/,
      );
    });

    it("rejects expiresOn earlier than effectiveOn", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              commissionEffectiveOn: "2026-06-01",
              commissionExpiresOn: "2026-05-01",
            },
            context,
          );
        },
        /Commission Expires On date cannot be earlier/,
      );
    });

    it("rejects multiple 'all' rules", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              commissionRules: [
                { scopeType: "all", commissionType: "percent", commissionValue: 10 },
                { scopeType: "all", commissionType: "percent", commissionValue: 15 },
              ],
            },
            context,
          );
        },
        /Only one 'Apply to All' commission rule is allowed/,
      );
    });

    it("rejects duplicate room_type rules", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              commissionRules: [
                { scopeType: "room_type", roomTypeId: "rt-dlx", commissionType: "percent", commissionValue: 20 },
                { scopeType: "room_type", roomTypeId: "rt-dlx", commissionType: "percent", commissionValue: 25 },
              ],
            },
            context,
          );
        },
        /Duplicate commission rule for Room Type/,
      );
    });

    it("rejects rate_plan rule when rate plan does not match room type", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              commissionRules: [
                {
                  scopeType: "rate_plan",
                  roomTypeId: "rt-std", // mismatch! rp-corp-dlx belongs to rt-dlx
                  ratePlanId: "rp-corp-dlx",
                  commissionType: "percent",
                  commissionValue: 15,
                },
              ],
            },
            context,
          );
        },
        /does not belong to the selected Room Type/,
      );
    });

    it("rejects commission percentage over 100", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              commissionRules: [
                { scopeType: "all", commissionType: "percent", commissionValue: 110 },
              ],
            },
            context,
          );
        },
        /Commission percentage cannot exceed 100%/,
      );
    });

    it("rejects duplicate room type in agency rate defaults", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              agencyRateDefaults: [
                { roomTypeId: "rt-std", ratePlanId: "rp-bar-std" },
                { roomTypeId: "rt-std", ratePlanId: "rp-bar-std" },
              ],
            },
            context,
          );
        },
        /Duplicate default Rate Plan configured for the same Room Type/,
      );
    });

    it("rejects rate default when rate plan does not belong to the room type", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              ...baseCommissionablePayload,
              agencyRateDefaults: [
                { roomTypeId: "rt-std", ratePlanId: "rp-corp-dlx" }, // mismatch!
              ],
            },
            context,
          );
        },
        /Default Rate Plan .* does not belong to Room Type/,
      );
    });
  });

  describe("Net Rate Model Validation", () => {
    it("rejects missing pricing method", () => {
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              restaurantId: "rest-1",
              agencyId: "agency-1",
              commercialModel: "net_rate",
              netValidFrom: "2026-01-01",
              netValidUntil: "2026-12-31",
              netCurrencyCode: "ETB",
            },
            context,
          );
        },
        /Pricing Method is required/,
      );
    });

    it("validates Method A (rate_plan) correctly", () => {
      // Valid
      assert.doesNotThrow(() => {
        validateTravelAgencyCommissionRates(
          {
            restaurantId: "rest-1",
            agencyId: "agency-1",
            commercialModel: "net_rate",
            netPricingMethod: "rate_plan",
            netRoomTypeId: "rt-dlx",
            netRatePlanId: "rp-corp-dlx",
            netValidFrom: "2026-01-01",
            netValidUntil: "2026-12-31",
            netCurrencyCode: "ETB",
          },
          context,
        );
      });

      // Mismatch
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              restaurantId: "rest-1",
              agencyId: "agency-1",
              commercialModel: "net_rate",
              netPricingMethod: "rate_plan",
              netRoomTypeId: "rt-std", // mismatch! rp-corp-dlx is dlx
              netRatePlanId: "rp-corp-dlx",
              netValidFrom: "2026-01-01",
              netValidUntil: "2026-12-31",
              netCurrencyCode: "ETB",
            },
            context,
          );
        },
        /Selected Net Rate Plan does not belong to the selected Room Type/,
      );
    });

    it("validates Method B (rate_plan_discount) correctly", () => {
      // Valid
      assert.doesNotThrow(() => {
        validateTravelAgencyCommissionRates(
          {
            restaurantId: "rest-1",
            agencyId: "agency-1",
            commercialModel: "net_rate",
            netPricingMethod: "rate_plan_discount",
            netRoomTypeId: "rt-dlx",
            netRatePlanId: "rp-bar-dlx",
            netDiscountType: "percent",
            netDiscountValue: 15,
            netValidFrom: "2026-01-01",
            netValidUntil: "2026-12-31",
            netCurrencyCode: "ETB",
          },
          context,
        );
      });

      // Discount > 100%
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              restaurantId: "rest-1",
              agencyId: "agency-1",
              commercialModel: "net_rate",
              netPricingMethod: "rate_plan_discount",
              netRoomTypeId: "rt-dlx",
              netRatePlanId: "rp-bar-dlx",
              netDiscountType: "percent",
              netDiscountValue: 105,
              netValidFrom: "2026-01-01",
              netValidUntil: "2026-12-31",
              netCurrencyCode: "ETB",
            },
            context,
          );
        },
        /Discount percentage cannot exceed 100%/,
      );
    });

    it("validates Method C (contracted_rates) correctly", () => {
      // Valid
      assert.doesNotThrow(() => {
        validateTravelAgencyCommissionRates(
          {
            restaurantId: "rest-1",
            agencyId: "agency-1",
            commercialModel: "net_rate",
            netPricingMethod: "contracted_rates",
            netValidFrom: "2026-01-01",
            netValidUntil: "2026-12-31",
            netCurrencyCode: "ETB",
            contractedRates: [
              { roomTypeId: "rt-std", amount: 1200 },
              { roomTypeId: "rt-dlx", amount: 1800 },
            ],
          },
          context,
        );
      });

      // Empty rows
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              restaurantId: "rest-1",
              agencyId: "agency-1",
              commercialModel: "net_rate",
              netPricingMethod: "contracted_rates",
              netValidFrom: "2026-01-01",
              netValidUntil: "2026-12-31",
              netCurrencyCode: "ETB",
              contractedRates: [],
            },
            context,
          );
        },
        /At least one Room Type contracted rate must be specified/,
      );

      // Duplicate Room Type
      assert.throws(
        () => {
          validateTravelAgencyCommissionRates(
            {
              restaurantId: "rest-1",
              agencyId: "agency-1",
              commercialModel: "net_rate",
              netPricingMethod: "contracted_rates",
              netValidFrom: "2026-01-01",
              netValidUntil: "2026-12-31",
              netCurrencyCode: "ETB",
              contractedRates: [
                { roomTypeId: "rt-std", amount: 1200 },
                { roomTypeId: "rt-std", amount: 1400 },
              ],
            },
            context,
          );
        },
        /Duplicate contracted rate row for Room Type/,
      );
    });
  });
});
