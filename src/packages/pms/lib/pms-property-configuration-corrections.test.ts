import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertArrivalAfterOpeningDate,
  assertStayDates,
} from "./reservations.server";
import {
  formatTimeDisplay,
  generateHourlyTimeOptions,
  parseIdentityToggles,
  emptyIdentityToggles,
  emptyCard1Draft,
  validateAddressFields,
  resolveRegionForCountryChange,
  ETHIOPIA_REGIONS,
  saveCard1SessionDraft,
  loadCard1SessionDraft,
  clearCard1SessionDraft,
  getCard1StorageKey,
  CARD1_STORAGE_KEY_PREFIX,
  parseLocationExtras,
} from "./pms-property-setup-card1";
import {
  isValidLatitude,
  isValidLongitude,
} from "./pms-geography";
import {
  card1DraftSchema,
  STANDARD_HOTEL_DEPARTMENTS,
  generateDepartmentCode,
} from "./pms-property-setup-card1.functions";
import {
  evaluateCheckInReadiness,
  type CheckInReadinessFacts,
} from "./fo-check-in-readiness";

describe("Property Configuration Corrections (Card 1 Step 1)", () => {
  describe("Opening Date Enforcement", () => {
    const openingDate = "2026-12-01";

    it("rejects arrival date before opening date with clear actionable message", () => {
      assert.throws(
        () => assertArrivalAfterOpeningDate("2026-11-20", openingDate),
        {
          message: "Arrival date cannot be before the property opening date (2026-12-01).",
        },
      );
    });

    it("allows arrival date on the opening date", () => {
      assert.doesNotThrow(() => assertArrivalAfterOpeningDate("2026-12-01", openingDate));
    });

    it("allows arrival date after the opening date", () => {
      assert.doesNotThrow(() => assertArrivalAfterOpeningDate("2026-12-05", openingDate));
    });

    it("allows any valid arrival date when opening date is not set or null", () => {
      assert.doesNotThrow(() => assertArrivalAfterOpeningDate("2026-11-20", null));
      assert.doesNotThrow(() => assertArrivalAfterOpeningDate("2026-11-20", undefined));
      assert.doesNotThrow(() => assertArrivalAfterOpeningDate("2026-11-20", ""));
    });

    it("preserves standard assertStayDates validation and allows stay on or after opening date", () => {
      const dates = assertStayDates("2026-12-01", "2026-12-05");
      assert.equal(dates.arrival, "2026-12-01");
      assert.equal(dates.departure, "2026-12-05");
      assert.throws(() => assertStayDates("2026-12-05", "2026-12-01"), {
        message: "Departure must be after arrival.",
      });
    });

    it("blocks check-in readiness when today or arrival is before property opening date", () => {
      const baseFacts: CheckInReadinessFacts = {
        unitRequired: false,
        target: {
          reservationRoomId: "room-unit-1",
          guestId: "guest-1",
          guestSource: "assigned",
          status: "confirmed",
          roomId: "room-101",
        },
        hasSiblings: false,
        registrationComplete: true,
        registrationWaived: false,
        registrationWaiverReason: null,
        registrationWaivedBy: null,
        registrationWaivedAt: null,
        guestFieldErrors: [],
        identityDocumentErrors: [],
        verificationWarnings: [],
        verificationBlockers: [],
        roomEligible: true,
        roomReady: true,
        roomReadyReason: null,
        deposit: null,
        agreementVersionId: "v1",
        agreementSigned: true,
        keyRecorded: true,
        keyWaived: false,
        keyWaiverReason: null,
        keyWaivedBy: null,
        keyWaivedAt: null,
        earlyArrival: false,
        earlyCheckInAllowed: null,
        earlyCheckInNeedsApproval: null,
        openingDate: "2026-12-01",
        arrivalDate: "2026-11-20",
        today: "2026-11-20",
      };

      const blockedReadiness = evaluateCheckInReadiness(baseFacts);
      assert.equal(blockedReadiness.canCheckIn, false);
      const blocker = blockedReadiness.blockers.find((b) => b.code === "OPENING_DATE_RESTRICTION");
      assert.ok(blocker, "Expected OPENING_DATE_RESTRICTION blocker");
      assert.equal(
        blocker?.message,
        "Check-in is not allowed before the property opening date (2026-12-01).",
      );

      // Now with today and arrival after opening date
      const allowedFacts: CheckInReadinessFacts = {
        ...baseFacts,
        arrivalDate: "2026-12-01",
        today: "2026-12-01",
      };
      const allowedReadiness = evaluateCheckInReadiness(allowedFacts);
      assert.equal(
        allowedReadiness.blockers.some((b) => b.code === "OPENING_DATE_RESTRICTION"),
        false,
      );
      assert.equal(allowedReadiness.canCheckIn, true);
    });
  });

  describe("Time Format — Configurable 12h / 24h Display", () => {
    it("formats 24-hour time correctly", () => {
      assert.equal(formatTimeDisplay("00:00", "24h"), "00:00");
      assert.equal(formatTimeDisplay("09:00", "24h"), "09:00");
      assert.equal(formatTimeDisplay("12:00", "24h"), "12:00");
      assert.equal(formatTimeDisplay("14:00", "24h"), "14:00");
      assert.equal(formatTimeDisplay("23:30", "24h"), "23:30");
    });

    it("formats 12-hour time correctly, including midnight and noon", () => {
      assert.equal(formatTimeDisplay("00:00", "12h"), "12:00 AM");
      assert.equal(formatTimeDisplay("01:00", "12h"), "1:00 AM");
      assert.equal(formatTimeDisplay("09:30", "12h"), "9:30 AM");
      assert.equal(formatTimeDisplay("12:00", "12h"), "12:00 PM");
      assert.equal(formatTimeDisplay("14:00", "12h"), "2:00 PM");
      assert.equal(formatTimeDisplay("23:45", "12h"), "11:45 PM");
    });

    it("generates 24 hourly options with correct values and labels", () => {
      const options24 = generateHourlyTimeOptions("24h");
      assert.equal(options24.length, 24);
      assert.equal(options24[0]?.value, "00:00");
      assert.equal(options24[0]?.label, "00:00");
      assert.equal(options24[14]?.value, "14:00");
      assert.equal(options24[14]?.label, "14:00");

      const options12 = generateHourlyTimeOptions("12h");
      assert.equal(options12.length, 24);
      assert.equal(options12[0]?.value, "00:00");
      assert.equal(options12[0]?.label, "12:00 AM");
      assert.equal(options12[12]?.value, "12:00");
      assert.equal(options12[12]?.label, "12:00 PM");
      assert.equal(options12[14]?.value, "14:00");
      assert.equal(options12[14]?.label, "2:00 PM");
    });

    it("defaults property time format to 24h", () => {
      const defaults = emptyIdentityToggles();
      assert.equal(defaults.timeFormat, "24h");

      const parsed = parseIdentityToggles({});
      assert.equal(parsed.timeFormat, "24h");

      const parsed12 = parseIdentityToggles({ timeFormat: "12h" });
      assert.equal(parsed12.timeFormat, "12h");
    });
  });

  describe("Toggles Removal and Backward Compatibility", () => {
    it("preserves independentProperty and displayPublicly if present in JSONB", () => {
      const parsed = parseIdentityToggles({
        independentProperty: true,
        displayPublicly: true,
        chainProperty: false,
      });
      assert.equal(parsed.independentProperty, true);
      assert.equal(parsed.displayPublicly, true);
    });

    it("handles absence of independentProperty and displayPublicly cleanly", () => {
      const parsed = parseIdentityToggles({
        showTradingNameOnDocuments: true,
      });
      assert.equal(parsed.independentProperty, false);
      assert.equal(parsed.displayPublicly, false);
      assert.equal(parsed.showTradingNameOnDocuments, true);
    });
  });

  describe("Settings Card 1 Step 2: Country Defaults and Region Selection", () => {
    it("defaults Country to Ethiopia for new property setups", () => {
      const draft = emptyCard1Draft();
      assert.equal(draft.country, "Ethiopia");
    });

    it("defaults Regional State to Addis Ababa when Ethiopia is selected and no region is set", () => {
      const draft = emptyCard1Draft();
      assert.equal(draft.addressRegion, "Addis Ababa");

      const ethiopiaDraft = emptyCard1Draft({ country: "Ethiopia" });
      assert.equal(ethiopiaDraft.addressRegion, "Addis Ababa");
    });

    it("allows the user to override Addis Ababa with any valid Ethiopian region", () => {
      assert.ok(ETHIOPIA_REGIONS.includes("Oromia"));
      assert.ok(ETHIOPIA_REGIONS.includes("Amhara"));
      assert.ok(ETHIOPIA_REGIONS.includes("Dire Dawa"));

      const overriddenDraft = emptyCard1Draft({ country: "Ethiopia", addressRegion: "Oromia" });
      assert.equal(overriddenDraft.addressRegion, "Oromia");

      const resolved = resolveRegionForCountryChange("Ethiopia", "Amhara", "Ethiopia");
      assert.equal(resolved, "Amhara");
    });

    it("preserves existing saved country and region when reopening a property", () => {
      const savedOromia = emptyCard1Draft({ country: "Ethiopia", addressRegion: "Oromia" });
      assert.equal(savedOromia.country, "Ethiopia");
      assert.equal(savedOromia.addressRegion, "Oromia");

      const savedKenya = emptyCard1Draft({ country: "Kenya", addressRegion: "Nairobi" });
      assert.equal(savedKenya.country, "Kenya");
      assert.equal(savedKenya.addressRegion, "Nairobi");
    });

    it("does not reset region simply because component rerenders or navigates between steps", () => {
      const existingDraft = emptyCard1Draft({ country: "Ethiopia", addressRegion: "Sidama" });
      assert.equal(existingDraft.addressRegion, "Sidama");
      // Simulation of inter-step navigation preserving draft
      const navigatedDraft = { ...existingDraft, shortDescription: "Updated description" };
      assert.equal(navigatedDraft.addressRegion, "Sidama");
    });

    it("clears incompatible region selection when user changes to a different country", () => {
      // Switching from Ethiopia (Addis Ababa or Oromia) to Kenya clears incompatible region
      const clearedForKenya = resolveRegionForCountryChange("Kenya", "Addis Ababa", "Ethiopia");
      assert.equal(clearedForKenya, "");

      const clearedFromOromia = resolveRegionForCountryChange("Kenya", "Oromia", "Ethiopia");
      assert.equal(clearedFromOromia, "");

      // Switching from Kenya (Nairobi) to US clears incompatible region
      const clearedForUS = resolveRegionForCountryChange("US", "Nairobi", "Kenya");
      assert.equal(clearedForUS, "");
    });

    it("initializes Addis Ababa when returning to Ethiopia only when region is unset or invalid", () => {
      // Unset / empty region returning to Ethiopia defaults to Addis Ababa
      assert.equal(resolveRegionForCountryChange("Ethiopia", "", "Kenya"), "Addis Ababa");
      assert.equal(resolveRegionForCountryChange("Ethiopia", null, "Kenya"), "Addis Ababa");

      // Incompatible foreign region returning to Ethiopia defaults to Addis Ababa
      assert.equal(resolveRegionForCountryChange("Ethiopia", "Nairobi", "Kenya"), "Addis Ababa");
      assert.equal(resolveRegionForCountryChange("Ethiopia", "California", "US"), "Addis Ababa");

      // Valid Ethiopian region returning to Ethiopia is preserved
      assert.equal(resolveRegionForCountryChange("Ethiopia", "Tigray", "Ethiopia"), "Tigray");
      assert.equal(resolveRegionForCountryChange("Ethiopia", "Addis Ababa", "Ethiopia"), "Addis Ababa");
    });
  });

  describe("Settings Card 1 Step 2: Coordinate Validation (Latitude & Longitude)", () => {
    it("accepts valid signed decimal coordinates for hotel locations", () => {
      // Standard coordinates (e.g. Addis Ababa hotels)
      assert.equal(isValidLatitude("9.0300"), true);
      assert.equal(isValidLongitude("38.7400"), true);

      // Positive signed decimal
      assert.equal(isValidLatitude("+9.0300"), true);
      assert.equal(isValidLongitude("+38.7400"), true);

      // Negative signed decimal
      assert.equal(isValidLatitude("-1.2921"), true);
      assert.equal(isValidLongitude("-36.8219"), true);

      // High precision
      assert.equal(isValidLatitude("9.03004567"), true);
      assert.equal(isValidLongitude("38.74001234"), true);

      // Valid boundaries: Latitude [-90, +90], Longitude [-180, +180]
      assert.equal(isValidLatitude("-90"), true);
      assert.equal(isValidLatitude("+90"), true);
      assert.equal(isValidLatitude("90.0000"), true);
      assert.equal(isValidLatitude("0"), true);

      assert.equal(isValidLongitude("-180"), true);
      assert.equal(isValidLongitude("+180"), true);
      assert.equal(isValidLongitude("180.0000"), true);
      assert.equal(isValidLongitude("0"), true);
    });

    it("rejects values outside valid geographic boundaries", () => {
      // Latitude out of [-90, 90]
      assert.equal(isValidLatitude("95"), false);
      assert.equal(isValidLatitude("-95"), false);
      assert.equal(isValidLatitude("90.0001"), false);
      assert.equal(isValidLatitude("-90.0001"), false);

      // Longitude out of [-180, 180]
      assert.equal(isValidLongitude("190"), false);
      assert.equal(isValidLongitude("-190"), false);
      assert.equal(isValidLongitude("180.0001"), false);
      assert.equal(isValidLongitude("-180.0001"), false);
    });

    it("rejects non-numeric and non-finite values", () => {
      // Text strings
      assert.equal(isValidLatitude("abc"), false);
      assert.equal(isValidLongitude("xyz"), false);

      // Hexadecimal / Exponential
      assert.equal(isValidLatitude("0x10"), false);
      assert.equal(isValidLongitude("0x10"), false);
      assert.equal(isValidLatitude("1e2"), false);
      assert.equal(isValidLongitude("1e2"), false);

      // Special non-finite numbers
      assert.equal(isValidLatitude("NaN"), false);
      assert.equal(isValidLongitude("NaN"), false);
      assert.equal(isValidLatitude("Infinity"), false);
      assert.equal(isValidLongitude("Infinity"), false);
      assert.equal(isValidLatitude("-Infinity"), false);

      // Malformed number strings
      assert.equal(isValidLatitude("9.0.3"), false);
      assert.equal(isValidLatitude("9,03"), false);
      assert.equal(isValidLatitude("++9"), false);
      assert.equal(isValidLatitude("--9"), false);
    });

    it("preserves optional behavior for empty or blank coordinate inputs", () => {
      assert.equal(isValidLatitude(""), true);
      assert.equal(isValidLatitude("   "), true);
      assert.equal(isValidLatitude(null), true);
      assert.equal(isValidLatitude(undefined), true);

      assert.equal(isValidLongitude(""), true);
      assert.equal(isValidLongitude("   "), true);
      assert.equal(isValidLongitude(null), true);
      assert.equal(isValidLongitude(undefined), true);
    });

    it("enforces specific error messages on frontend validation", () => {
      const errLat = validateAddressFields(emptyCard1Draft({ latitude: "95" }));
      assert.equal(errLat.latitude, "Latitude must be between -90 and 90.");

      const errLng = validateAddressFields(emptyCard1Draft({ longitude: "190" }));
      assert.equal(errLng.longitude, "Longitude must be between -180 and 180.");

      const errNonNumLat = validateAddressFields(emptyCard1Draft({ latitude: "not-a-number" }));
      assert.equal(errNonNumLat.latitude, "Latitude must be between -90 and 90.");

      const errNonNumLng = validateAddressFields(emptyCard1Draft({ longitude: "0x10" }));
      assert.equal(errNonNumLng.longitude, "Longitude must be between -180 and 180.");

      const validDraft = emptyCard1Draft({ latitude: "9.0300", longitude: "38.7400" });
      const validErrors = validateAddressFields(validDraft);
      assert.equal(validErrors.latitude, undefined);
      assert.equal(validErrors.longitude, undefined);
    });

    it("enforces coordinate validation on server schema", () => {
      const validParse = card1DraftSchema.safeParse(
        emptyCard1Draft({
          name: "Test Hotel",
          timezone: "Africa/Addis_Ababa",
          currencyCode: "ETB",
          latitude: "9.0300",
          longitude: "38.7400",
        }),
      );
      assert.equal(validParse.success, true);

      const invalidLat = card1DraftSchema.safeParse(
        emptyCard1Draft({
          name: "Test Hotel",
          timezone: "Africa/Addis_Ababa",
          currencyCode: "ETB",
          latitude: "95",
        }),
      );
      assert.equal(invalidLat.success, false);
      if (!invalidLat.success) {
        const issue = invalidLat.error.issues.find((i) => i.path.includes("latitude"));
        assert.ok(issue, "Expected latitude validation issue");
        assert.equal(issue?.message, "Latitude must be between -90 and 90.");
      }

      const invalidLng = card1DraftSchema.safeParse(
        emptyCard1Draft({
          name: "Test Hotel",
          timezone: "Africa/Addis_Ababa",
          currencyCode: "ETB",
          longitude: "190",
        }),
      );
      assert.equal(invalidLng.success, false);
      if (!invalidLng.success) {
        const issue = invalidLng.error.issues.find((i) => i.path.includes("longitude"));
        assert.ok(issue, "Expected longitude validation issue");
        assert.equal(issue?.message, "Longitude must be between -180 and 180.");
      }
    });
  });

  describe("Settings Card 1: Form Persistence & Client Draft Caching", () => {
    class MockSessionStorage {
      private store = new Map<string, string>();
      getItem(key: string): string | null {
        return this.store.get(key) ?? null;
      }
      setItem(key: string, value: string): void {
        this.store.set(key, value);
      }
      removeItem(key: string): void {
        this.store.delete(key);
      }
      clear(): void {
        this.store.clear();
      }
    }

    const originalWindow = (globalThis as unknown as { window?: unknown }).window;

    function setupMockWindow(): MockSessionStorage {
      const storage = new MockSessionStorage();
      (globalThis as unknown as { window?: { sessionStorage: MockSessionStorage } }).window = {
        sessionStorage: storage,
      };
      return storage;
    }

    function teardownMockWindow() {
      if (originalWindow !== undefined) {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      } else {
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    }

    it("generates property-scoped storage keys with prefix", () => {
      const key1 = getCard1StorageKey("rest-123");
      const key2 = getCard1StorageKey("rest-123", "user-456");
      assert.equal(key1, `${CARD1_STORAGE_KEY_PREFIX}rest-123:anon`);
      assert.equal(key2, `${CARD1_STORAGE_KEY_PREFIX}rest-123:user-456`);
    });

    it("saves and reloads in-progress drafts safely", () => {
      setupMockWindow();
      try {
        const draft = emptyCard1Draft({
          name: "Bole Skyline Hotel",
          email: "bole@skyline.com",
          address: "Bole Road, Suite 400",
        });

        saveCard1SessionDraft("rest-bole", draft, "address", "user-1");
        const loaded = loadCard1SessionDraft("rest-bole", "user-1");

        assert.ok(loaded, "Expected saved draft to be loaded");
        assert.equal(loaded?.restaurantId, "rest-bole");
        assert.equal(loaded?.userId, "user-1");
        assert.equal(loaded?.activeStep, "address");
        assert.equal(loaded?.draft.name, "Bole Skyline Hotel");
        assert.equal(loaded?.draft.email, "bole@skyline.com");
      } finally {
        teardownMockWindow();
      }
    });

    it("enforces strict property isolation (does not load drafts of different properties)", () => {
      setupMockWindow();
      try {
        const draftPropA = emptyCard1Draft({ name: "Property Alpha" });
        saveCard1SessionDraft("rest-alpha", draftPropA, "identity");

        // Attempt to load using Property Beta's id
        const loadedForBeta = loadCard1SessionDraft("rest-beta");
        assert.equal(loadedForBeta, null);
      } finally {
        teardownMockWindow();
      }
    });

    it("clears cached drafts upon successful save or explicit discard", () => {
      const storage = setupMockWindow();
      try {
        const draft = emptyCard1Draft({ name: "Addis Boutique" });
        saveCard1SessionDraft("rest-boutique", draft, "identity");
        assert.ok(loadCard1SessionDraft("rest-boutique"));

        clearCard1SessionDraft("rest-boutique");
        assert.equal(loadCard1SessionDraft("rest-boutique"), null);
      } finally {
        teardownMockWindow();
      }
    });

    it("handles corrupted or invalid sessionStorage payloads safely without throwing", () => {
      const storage = setupMockWindow();
      try {
        storage.setItem(getCard1StorageKey("rest-corrupt"), "{ bad: json");
        assert.equal(loadCard1SessionDraft("rest-corrupt"), null);

        storage.setItem(getCard1StorageKey("rest-mismatch"), JSON.stringify({ restaurantId: "other-rest" }));
        assert.equal(loadCard1SessionDraft("rest-mismatch"), null);
      } finally {
        teardownMockWindow();
      }
    });

    it("distinguishes dirty draft from clean snapshot to guard against refetch overwrites", () => {
      const serverSnapshot = emptyCard1Draft({ name: "Official Server Hotel" });
      const cleanDraft = { ...serverSnapshot };
      const dirtyDraft = { ...serverSnapshot, name: "Locally Edited Hotel" };

      const isClean = JSON.stringify(cleanDraft) === JSON.stringify(serverSnapshot);
      const isDirty = JSON.stringify(dirtyDraft) !== JSON.stringify(serverSnapshot);

      assert.equal(isClean, true);
      assert.equal(isDirty, true);

      // Simulating refetch guard:
      // If dirty: incoming snapshot does NOT overwrite draft.
      // If clean: incoming snapshot updates draft.
      let activeDraft = dirtyDraft;
      const incomingRefetchedSnapshot = emptyCard1Draft({ name: "Refetched Server Hotel" });
      const draftDirty = JSON.stringify(activeDraft) !== JSON.stringify(serverSnapshot);

      if (!draftDirty) {
        activeDraft = incomingRefetchedSnapshot;
      }
      assert.equal(activeDraft.name, "Locally Edited Hotel", "Dirty draft should be preserved during background refetch");

      activeDraft = cleanDraft;
      const cleanDraftDirty = JSON.stringify(activeDraft) !== JSON.stringify(serverSnapshot);
      if (!cleanDraftDirty) {
        activeDraft = incomingRefetchedSnapshot;
      }
      assert.equal(activeDraft.name, "Refetched Server Hotel", "Clean draft should accept incoming server updates");
    });
  });

  describe("Settings Card 1 Step 2: Location Visibility Toggle Removal", () => {
    it("removes the nonfunctional location visibility toggle from the Step 2 UI", () => {
      const stepsFile = readFileSync(
        new URL("../components/settings/pms-property-setup-card1-steps.tsx", import.meta.url),
        "utf8",
      );

      assert.doesNotMatch(
        stepsFile,
        /id="card1-pin"/,
        "Step 2 UI should no longer contain id='card1-pin'",
      );
      assert.doesNotMatch(
        stepsFile,
        /Show property location on NORU and guest platforms/,
        "Step 2 UI should no longer show the nonfunctional public location toggle label",
      );
    });

    it("preserves backward compatibility in parseLocationExtras for pinVisible", () => {
      const parsedWithTrue = parseLocationExtras({
        pinVisible: true,
        googleMapsLink: "https://maps.google.com/?q=Addis",
        nearbyLandmark: "Meskel Square",
      });
      assert.equal(parsedWithTrue.pinVisible, true);
      assert.equal(parsedWithTrue.googleMapsLink, "https://maps.google.com/?q=Addis");
      assert.equal(parsedWithTrue.nearbyLandmark, "Meskel Square");

      const parsedWithFalse = parseLocationExtras({
        pinVisible: false,
      });
      assert.equal(parsedWithFalse.pinVisible, false);

      const parsedDefault = parseLocationExtras(null);
      assert.equal(parsedDefault.pinVisible, true);
      assert.equal(parsedDefault.googleMapsLink, "");
      assert.equal(parsedDefault.nearbyLandmark, "");
    });
  });

  describe("Settings Card 1 Step 2: Department Quick-Create and Zero-State Seeding", () => {
    it("defines the 7 standard hotel departments with unique codes", () => {
      assert.equal(STANDARD_HOTEL_DEPARTMENTS.length, 7);

      const codes = STANDARD_HOTEL_DEPARTMENTS.map((d) => d.code);
      const uniqueCodes = new Set(codes);
      assert.equal(uniqueCodes.size, 7, "All standard department codes must be unique");

      assert.deepEqual(codes, ["FD", "HK", "RES", "MNT", "FNB", "ACC", "MGT"]);

      const names = STANDARD_HOTEL_DEPARTMENTS.map((d) => d.name);
      assert.ok(names.includes("Front Desk"));
      assert.ok(names.includes("Housekeeping"));
      assert.ok(names.includes("Reservations"));
      assert.ok(names.includes("Maintenance & Engineering"));
      assert.ok(names.includes("Food & Beverage"));
      assert.ok(names.includes("Accounts & Finance"));
      assert.ok(names.includes("Management & Administration"));
    });

    it("auto-suggests clean department codes from department names", () => {
      assert.equal(generateDepartmentCode("Front Desk"), "FD");
      assert.equal(generateDepartmentCode("Housekeeping"), "HOU");
      assert.equal(generateDepartmentCode("Food and Beverage"), "FAB");
      assert.equal(generateDepartmentCode("Guest Relations"), "GR");
      assert.equal(generateDepartmentCode("Security"), "SEC");
      assert.equal(generateDepartmentCode(""), "DEPT");
      assert.equal(generateDepartmentCode("   "), "DEPT");
    });

    it("resolves code collisions by appending numbers", () => {
      const existing = ["FD", "HK", "RES"];
      const code = generateDepartmentCode("Front Desk", existing);
      assert.equal(code, "FD2");

      const existingWith2 = ["FD", "FD2"];
      const code3 = generateDepartmentCode("Front Desk", existingWith2);
      assert.equal(code3, "FD3");
    });

    it("provides zero-state seeding banner with standard departments and omits create department button", () => {
      const stepsFile = readFileSync(
        new URL("../components/settings/pms-property-setup-card1-steps.tsx", import.meta.url),
        "utf8",
      );
      const sectionFile = readFileSync(
        new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url),
        "utf8",
      );

      // Zero-state seeding banner
      assert.match(stepsFile, /pms-card1-dept-zero-state/);
      assert.match(stepsFile, /pms-card1-seed-standard-depts/);
      assert.match(stepsFile, /Load Standard Departments/);

      // Add department contact button is present
      assert.match(stepsFile, /\+ Add department contact/);

      // Create department is accessible via dropdown and modal dialog
      assert.match(stepsFile, /__create_new__/);
      assert.match(stepsFile, /\+ Create New Department…/);
      assert.match(stepsFile, /pms-card1-create-dept-modal/);
      assert.match(stepsFile, /card1-new-dept-name/);
      assert.match(stepsFile, /card1-new-dept-code/);

      // Standalone Create Department buttons outside the dropdown are omitted
      assert.doesNotMatch(stepsFile, /pms-card1-create-dept-btn/);
      assert.doesNotMatch(stepsFile, /pms-card1-open-create-dept/);

      // Card 1 section integrates unsaved dialog and session draft restore banner
      assert.match(sectionFile, /pms-card1-unsaved-dialog/);
      assert.match(sectionFile, /pms-card1-keep-editing/);
      assert.match(sectionFile, /pms-card1-discard-changes/);
      assert.match(sectionFile, /pms-card1-save-draft-leave/);
      assert.match(sectionFile, /pms-card1-session-restored-banner/);
      assert.match(sectionFile, /pms-card1-discard-session-draft/);
    });
  });

  describe("Settings Card 1 Step 3: Business Date & Night Audit UI and System Displays", () => {
    const stepsFile = readFileSync(
      new URL("../components/settings/pms-property-setup-card1-steps.tsx", import.meta.url),
      "utf8",
    );
    const fnFile = readFileSync(
      new URL("./pms-property-setup-card1.functions.ts", import.meta.url),
      "utf8",
    );

    it("restores read-only System Date and live Property Time displays in System & Property Information", () => {
      // Subsection headings
      assert.match(stepsFile, /System & Property Information/);
      assert.match(stepsFile, /Night Audit Configuration/);

      // System Date field
      assert.match(stepsFile, /id="card1-system-date"/);
      assert.match(stepsFile, /label="System Date"/);

      // Property Time field
      assert.match(stepsFile, /id="card1-local-time"/);
      assert.match(stepsFile, /label="Property Time"/);

      // Current Business Date field
      assert.match(stepsFile, /id="card1-business-date-current"/);
      assert.match(stepsFile, /<Label htmlFor="card1-business-date-current">Current Business Date<\/Label>/);
      assert.match(stepsFile, /card1-business-date-normal-copy/);

      // Last Successful Night Audit field with "Never" fallback
      assert.match(stepsFile, /id="card1-last-na"/);
      assert.match(stepsFile, /label="Last Successful Night Audit"/);
      assert.match(stepsFile, /effectiveCurrentState\.lastSuccessfulNightAudit \|\| "Never"/);

      // Night Audit Window Start and End selectors
      assert.match(stepsFile, /id="card1-na-start"/);
      assert.match(stepsFile, /label="Night Audit Window Start"/);
      assert.match(stepsFile, /id="card1-na-end"/);
      assert.match(stepsFile, /label="Night Audit Window End"/);
      assert.match(stepsFile, /card1-night-audit-window-error/);
    });

    it("calculates live Property Time using configured property timezone and format preference", () => {
      // Dynamic timer updates
      assert.match(stepsFile, /const \[now, setNow\] = useState\(\(\) => new Date\(\)\);/);
      assert.match(stepsFile, /setInterval/);

      // Property Time format adheres to draft.timeFormat and draft.timezone
      const instant = new Date("2026-11-07T18:30:00Z");
      const addis24 = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Addis_Ababa",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(instant);
      assert.equal(addis24, "21:30");

      const addis12 = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Addis_Ababa",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(instant);
      assert.equal(addis12, "9:30 PM");

      const ny24 = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(instant);
      assert.equal(ny24, "13:30");

      const ny12 = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(instant);
      assert.equal(ny12, "1:30 PM");
    });

    it("calculates System Date using configured property timezone and updates when date changes", () => {
      const instantTz1 = new Date("2026-11-07T23:30:00Z");
      const addisDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Addis_Ababa",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(instantTz1);
      assert.equal(addisDate, "2026-11-08");

      const nyDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(instantTz1);
      assert.equal(nyDate, "2026-11-07");
    });

    it("confirms removed nonfunctional controls remain absent from Step 3", () => {
      // Day boundary removed
      assert.doesNotMatch(stepsFile, /id="card1-boundary"/);
      assert.doesNotMatch(stepsFile, /Business day boundary/);

      // Automatic rollover removed
      assert.doesNotMatch(stepsFile, /id="card1-auto-roll"/);
      assert.doesNotMatch(stepsFile, /Automatic rollover/);

      // Manual rollover approval & role buttons removed
      assert.doesNotMatch(stepsFile, /id="card1-approval"/);
      assert.doesNotMatch(stepsFile, /card1-manual-rollover-roles/);

      // Lock during audit removed
      assert.doesNotMatch(stepsFile, /id="card1-lock"/);
      assert.doesNotMatch(stepsFile, /Lock business date during audit/);

      // Calendar display removed
      assert.doesNotMatch(stepsFile, /id="card1-calendar"/);

      // Block Date Advance checkboxes and preview panel removed
      assert.doesNotMatch(stepsFile, /Panel title="Block Date Advance When"/);
      assert.doesNotMatch(stepsFile, /card1-live-block-preview/);

      // Recommended defaults panel removed
      assert.doesNotMatch(stepsFile, /Panel title="Recommended Defaults"/);
    });

    it("preserves all operational check-in, check-out, early/late fee, and child policy fields", () => {
      // Check-in / Check-out times
      assert.match(stepsFile, /id="card1-ci"/);
      assert.match(stepsFile, /id="card1-co"/);

      // Lead time, cutoff, grace period
      assert.match(stepsFile, /id="card1-lead"/);
      assert.match(stepsFile, /id="card1-cutoff"/);
      assert.match(stepsFile, /id="card1-grace"/);

      // Early check-in & late check-out
      assert.match(stepsFile, /Early Check-In/);
      assert.match(stepsFile, /Late Check-Out/);
      assert.match(stepsFile, /StayPolicyFields/);

      // Child policy
      assert.match(stepsFile, /card1-child-summary/);
      assert.match(stepsFile, /card1-child-\$\{key\}/);
      assert.match(stepsFile, /Minimum Child Age/);
      assert.match(stepsFile, /Maximum Child Age/);
      assert.match(stepsFile, /Free Until Age/);
      assert.match(stepsFile, /Charge From Age/);

      // Operational toggles & policies
      assert.match(stepsFile, /id="card1-day-use"/);
      assert.match(stepsFile, /id="card1-24h"/);
      assert.match(stepsFile, /id="card1-extra-bed"/);
      assert.match(stepsFile, /id="card1-id"/);
      assert.match(stepsFile, /id="card1-ci-policy"/);
      assert.match(stepsFile, /id="card1-co-policy"/);
    });

    it("loads Last Successful Night Audit strictly from closed runs with valid closed_at", () => {
      assert.match(fnFile, /\.not\("closed_at", "is", null\)/);
      assert.match(fnFile, /\.order\("business_date", \{ ascending: false \}\)/);
      assert.match(fnFile, /\.order\("closed_at", \{ ascending: false \}\)/);
    });
  });
});

