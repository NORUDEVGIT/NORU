import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { rowOnBusinessDate } from "./cashiering-control.ts";
import {
  fiscalSeverity,
  reconcileNightAuditFinancials,
  type NightAuditFinancialFacts,
} from "./night-audit-financial.ts";
import { PMS_PERMISSIONS, permissionRisk } from "./pms-permissions.ts";
import {
  BUSINESS_DATE_UNRESOLVED,
  strictPropertyBusinessDate,
} from "./reservation-workspace/business-date.ts";
import {
  STAFF_ACCESS_MODULES,
  STAFF_ACCESS_TEMPLATES,
  applyModulePreset,
  templatePermissionCodes,
} from "./staff-access.ts";
import { DEFAULT_TIMEZONE, timezoneForCountry } from "../../../shared/lib/property-time.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql0208 = read("../../../../supabase/migrations/0208_business_date_attribution.sql");
const sql0209 = read("../../../../supabase/migrations/0209_night_audit_persistent_fiscal_override.sql");
const drizzle0208 = read("../../../../drizzle/migrations/0208_business_date_attribution.sql");
const drizzle0209 = read("../../../../drizzle/migrations/0209_night_audit_persistent_fiscal_override.sql");
const nightAuditFns = read("./nightaudit.functions.ts");
const financialServer = read("./night-audit-financial.server.ts");
const cashieringFns = read("./cashiering.functions.ts");
const controlFns = read("./cashiering-control.functions.ts");
const registration = read("../../../core/lib/restaurant.functions.ts");
const parts = read("../components/nightaudit/end-of-day-parts.tsx");

const STAMPED_TABLES = [
  "folio_transactions",
  "hotel_cashier_shifts",
  "hotel_drawer_movements",
  "guest_folio_invoices",
  "financial_account_invoices",
  "invoice_credit_notes",
  "guest_payment_invoice_allocations",
  "guest_deposit_invoice_allocations",
  "folio_deposit_allocations",
  "financial_account_payment_allocations",
  "withholding_certificates",
  "fiscal_registrations",
];

const DATE = "2026-10-21";
const TZ = "Africa/Addis_Ababa";

function facts(patch: Partial<NightAuditFinancialFacts> = {}): NightAuditFinancialFacts {
  return {
    businessDate: DATE,
    timezone: TZ,
    checkedAt: "2026-10-21T20:00:00.000Z",
    folios: [],
    transactions: [],
    missingFolios: [],
    invoices: [],
    sources: [],
    allocations: [],
    accounts: [],
    transfers: [],
    drawers: [],
    integrationEnabled: true,
    fiscalDocuments: [],
    taxLines: [],
    ...patch,
  };
}

function document(patch: Partial<NightAuditFinancialFacts["fiscalDocuments"][number]> = {}) {
  return {
    id: "doc-1",
    number: "DOC-1",
    documentType: "INV",
    sourceType: "guest_invoice",
    issuedAt: "2026-10-19T08:00:00.000Z",
    status: "FAILED",
    externalReference: null,
    mode: "CREDIT",
    ...patch,
  };
}

const WAIVER = {
  overrideId: "ovr-1",
  reason: "Authority outage; registering manually",
  reasonCategory: "provider_outage",
  overriddenByMembershipId: "m-1",
  overriddenAt: "2026-10-19T21:00:00.000Z",
};

describe("canonical business date resolver", () => {
  it("uses the persisted business date over the calendar", () => {
    const result = strictPropertyBusinessDate({ business_date: "2026-10-19", timezone: TZ });
    assert.equal(result.businessDate, "2026-10-19");
    assert.equal(result.persistedBusinessDate, "2026-10-19");
  });

  it("falls back to the property-local date only with a valid zone", () => {
    const result = strictPropertyBusinessDate({ business_date: null, timezone: TZ });
    assert.match(result.businessDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(result.persistedBusinessDate, null);
  });

  it("fails instead of guessing when the date cannot be resolved", () => {
    assert.throws(() => strictPropertyBusinessDate(null), new RegExp(BUSINESS_DATE_UNRESOLVED));
    assert.throws(
      () => strictPropertyBusinessDate({ business_date: null, timezone: "Not/AZone" }),
      new RegExp(BUSINESS_DATE_UNRESOLVED),
    );
    assert.throws(
      () => strictPropertyBusinessDate({ business_date: null, timezone: null }),
      new RegExp(BUSINESS_DATE_UNRESOLVED),
    );
  });

  it("the server helper and SQL resolver share the failure code and lock", () => {
    const helper = read("./business-date.server.ts");
    assert.match(helper, /export async function resolveCurrentPropertyBusinessDate/);
    assert.match(helper, /strictPropertyBusinessDate/);
    assert.match(sql0208, /FOR SHARE/);
    assert.match(sql0208, /RAISE EXCEPTION 'BUSINESS_DATE_UNRESOLVED'/);
  });
});

describe("daily totals by business date", () => {
  it("a stamped row belongs to its stamped day, even when posted after midnight", () => {
    const afterMidnight = { businessDate: "2026-10-21", postedAt: "2026-10-21T22:30:00.000Z" };
    assert.equal(rowOnBusinessDate(afterMidnight, "2026-10-21", TZ), true);
    assert.equal(rowOnBusinessDate(afterMidnight, "2026-10-22", TZ), false);
  });

  it("an unstamped row falls back to its property-local calendar day", () => {
    const row = { businessDate: null, postedAt: "2026-10-21T08:00:00.000Z" };
    assert.equal(rowOnBusinessDate(row, "2026-10-21", TZ), true);
  });

  it("dashboard and activity queries filter on business_date equality", () => {
    assert.match(cashieringFns, /\.eq\("business_date", businessDate\)/);
    assert.match(controlFns, /\.eq\("business_date", viewedBusinessDate\)/);
    assert.doesNotMatch(controlFns, /propertyDayBounds/);
  });
});

describe("business_date schema (0208)", () => {
  it("ships identical dual-lane SQL", () => {
    assert.equal(drizzle0208, sql0208);
    assert.equal(drizzle0209, sql0209);
  });

  it("adds a nullable, documented, indexed business_date to every financial table", () => {
    for (const table of STAMPED_TABLES) {
      assert.match(
        sql0208,
        new RegExp(`ALTER TABLE public\\.${table}\\s+ADD COLUMN IF NOT EXISTS business_date date`),
        table,
      );
      assert.match(sql0208, new RegExp(`${table}_business_date_idx`), table);
      assert.match(sql0208, new RegExp(`'${table}'`), `${table} trigger loop`);
    }
    assert.match(sql0208, /COMMENT ON COLUMN public\.folio_transactions\.business_date/);
    assert.doesNotMatch(sql0208, /business_date date NOT NULL/);
    assert.match(sql0208, /fiscal_registrations_source_lookup_idx/);
  });

  it("stamps server-side and overwrites any client value", () => {
    assert.match(sql0208, /NEW\.business_date := public\.current_property_business_date\(NEW\.restaurant_id\)/);
    assert.match(sql0208, /NEW\.business_date := COALESCE\(_shift_date, _current\)/);
    assert.match(sql0208, /CREATE TRIGGER folio_transactions_business_date_stamp/);
    assert.match(sql0208, /CREATE TRIGGER hotel_drawer_movements_business_date_stamp/);
    assert.match(sql0208, /CREATE TRIGGER fiscal_registrations_business_date_stamp/);
    assert.match(sql0208, /public\.fiscal_source_business_date\(/);
    assert.doesNotMatch(sql0208, /GRANT EXECUTE ON FUNCTION public\.\w+\([^)]*\) TO (anon|authenticated)/);
  });

  it("makes a stamped business_date immutable", () => {
    assert.match(sql0208, /CREATE OR REPLACE FUNCTION public\.business_date_immutable\(\)/);
    assert.match(sql0208, /RAISE EXCEPTION 'BUSINESS_DATE_IMMUTABLE'/);
    assert.match(sql0208, /BEFORE UPDATE ON public\.%I FOR EACH ROW EXECUTE FUNCTION public\.business_date_immutable/);
  });

  it("re-enables every trigger it disables for the backfill", () => {
    const disabled = sql0208.match(/DISABLE TRIGGER USER/g)?.length ?? 0;
    const enabled = sql0208.match(/ENABLE TRIGGER USER/g)?.length ?? 0;
    assert.ok(disabled > 0);
    assert.equal(sql0208.match(/(?<!DIS)ENABLE TRIGGER USER/g)?.length, disabled);
    assert.ok(enabled >= disabled);
  });

  it("does not touch reservations, housekeeping, or delete history", () => {
    assert.doesNotMatch(sql0208, /ALTER TABLE public\.(reservations|housekeeping_tasks|room_checks)/);
    assert.doesNotMatch(sql0208 + sql0209, /\bDELETE FROM\b|\bDROP TABLE\b|\bTRUNCATE\b/);
  });
});

describe("persistent fiscal override (0209)", () => {
  it("adds scope, exact source, and revocation without deleting rows", () => {
    assert.match(sql0209, /scope text NOT NULL DEFAULT 'run_only'/);
    assert.match(sql0209, /scope IN \('run_only', 'persistent'\)/);
    assert.match(sql0209, /revoked_at/);
    assert.match(sql0209, /revocation_reason/);
    assert.match(sql0209, /night_audit_fiscal_overrides_active_persistent_source_idx/);
    assert.match(sql0209, /\(restaurant_id, source_type, source_id\)/);
  });

  it("guards authorization fields and allows revocation once", () => {
    assert.match(sql0209, /CREATE TRIGGER night_audit_fiscal_overrides_guard/);
    assert.match(sql0209, /RAISE EXCEPTION 'FISCAL_OVERRIDE_IMMUTABLE'/);
  });

  it("close_business_date honours only active overrides for the exact source", () => {
    const close = sql0209.slice(sql0209.indexOf("CREATE OR REPLACE FUNCTION public.close_business_date"));
    assert.match(close, /o\.revoked_at IS NULL/);
    assert.match(close, /p\.scope = 'persistent'/);
    assert.match(close, /p\.source_type = e\.reference_type/);
    assert.match(close, /p\.source_id = e\.reference_id/);
    assert.match(close, /p\.revoked_at IS NULL/);
    assert.match(close, /FOR UPDATE/);
  });

  it("seeds a CRITICAL permission that no template or Full preset grants", () => {
    const code = PMS_PERMISSIONS.NIGHT_AUDIT_FISCAL_OVERRIDE_PERSISTENT;
    assert.equal(code, "night_audit.fiscal.override_persistent");
    assert.equal(permissionRisk(code), "CRITICAL");
    assert.match(sql0209, /'night_audit\.fiscal\.override_persistent'/);
    assert.match(sql0209, /'override_persistent'/);
    for (const template of STAFF_ACCESS_TEMPLATES) {
      assert.equal(templatePermissionCodes(template.id).includes(code), false, template.id);
    }
    for (const module of STAFF_ACCESS_MODULES) {
      assert.equal(applyModulePreset([], module, "full").has(code), false, module.id);
    }
  });

  it("server requires the permission, the confirmation, and takes the source from the stored exception", () => {
    const authorize = nightAuditFns.slice(
      nightAuditFns.indexOf("export const authorizeFiscalCloseOverride"),
      nightAuditFns.indexOf("export const revokePersistentFiscalOverride"),
    );
    assert.match(authorize, /NIGHT_AUDIT_FISCAL_OVERRIDE_PERSISTENT/);
    assert.match(authorize, /confirmPersistent/);
    assert.match(authorize, /reference_type/);
    assert.match(authorize, /reference_id/);
    const validator = authorize.slice(authorize.indexOf(".validator"), authorize.indexOf(".handler"));
    assert.doesNotMatch(validator, /sourceId|sourceType|revokedAt|businessDate|business_date/);
    assert.match(validator, /reasonCategory: z\.enum/);
  });

  it("revocation is a permissioned, audited update of active persistent rows", () => {
    const revoke = nightAuditFns.slice(nightAuditFns.indexOf("export const revokePersistentFiscalOverride"));
    assert.match(revoke, /NIGHT_AUDIT_FISCAL_OVERRIDE_PERSISTENT/);
    assert.match(revoke, /night_audit_fiscal_override_revoked/);
    assert.match(revoke, /\.is\("revoked_at", null\)/);
    assert.doesNotMatch(revoke, /\.delete\(/);
  });

  it("auto-revokes when the source resolves and never invalidates persistent rows per run", () => {
    assert.match(nightAuditFns, /revokeResolvedPersistentOverrides\(admin, restaurantId\)/);
    assert.match(nightAuditFns, /\.eq\("scope", "run_only"\)/);
  });

  it("the dialog offers both scopes, a required category, and the exact confirmation", () => {
    assert.match(parts, /This End of Day only/);
    assert.match(parts, /All future End of Days/);
    assert.match(parts, /I understand this fiscal issue will remain unresolved\./);
    assert.match(parts, /Confirm Persistent Override/);
    assert.match(parts, /Revoke persistent override/);
  });
});

describe("fiscal reconciliation semantics", () => {
  it("PENDING is information; failure states block; unknown states block", () => {
    assert.equal(fiscalSeverity("PENDING"), "info");
    assert.equal(fiscalSeverity("REGISTERED"), "info");
    for (const status of ["FAILED", "CANCEL_PENDING", "NOT_REGISTERED", "BLOCKED", "SOMETHING_NEW"]) {
      assert.equal(fiscalSeverity(status), "blocking", status);
    }
  });

  it("an unwaived older failure still blocks today", () => {
    const result = reconcileNightAuditFinancials(facts({ fiscalDocuments: [document()] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_failed" && row.severity === "blocking"), true);
  });

  it("a persistently waived failure is information with the reason and override id", () => {
    const result = reconcileNightAuditFinancials(
      facts({ fiscalDocuments: [document({ waiver: WAIVER })] }),
    );
    const waived = result.issues.find((row) => row.code === "fiscal_waived");
    assert.ok(waived);
    assert.equal(waived.severity, "info");
    assert.equal(waived.fiscalOverrideId, "ovr-1");
    assert.match(waived.description ?? "", /Authority outage/);
    assert.equal(result.issues.some((row) => row.severity === "blocking"), false);
  });

  it("a waiver never covers an unknown status", () => {
    const result = reconcileNightAuditFinancials(
      facts({ fiscalDocuments: [document({ status: "SOMETHING_NEW", waiver: WAIVER })] }),
    );
    assert.equal(result.issues.some((row) => row.severity === "blocking"), true);
  });

  it("the loader carries forward unregistered sources and reads business_date stamps", () => {
    assert.match(financialServer, /business_date/);
    assert.match(financialServer, /waiverBySource/);
    assert.match(financialServer, /fiscalStartDay/);
    assert.match(financialServer, /registeredKeys/);
  });
});

describe("new property timezone", () => {
  it("derives the initial zone from the country and only at registration", () => {
    assert.equal(timezoneForCountry("Ethiopia"), "Africa/Addis_Ababa");
    assert.equal(timezoneForCountry(" ET "), "Africa/Addis_Ababa");
    assert.equal(timezoneForCountry("Atlantis"), DEFAULT_TIMEZONE);
    assert.equal(timezoneForCountry(null), DEFAULT_TIMEZONE);
    assert.match(registration, /timezone: timezoneForCountry\(data\.country\)/);
    assert.doesNotMatch(sql0208 + sql0209, /UPDATE public\.restaurants[^;]*timezone/);
  });
});
