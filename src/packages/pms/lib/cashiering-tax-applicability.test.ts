import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applicabilityFromBasis, basisForApplicability } from "./taxes-card3.server.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("tax applicability scopes", () => {
  const sql = read("../../../../supabase/migrations/0143_cashiering_tax_applicability.sql");
  const drizzle = read("../../../../drizzle/migrations/0143_cashiering_tax_applicability.sql");
  const ui = read("../components/settings/pms-property-setup-card3-taxes.tsx");
  const fns = read("./taxes-card3.functions.ts");
  const server = read("./taxes-card3.server.ts");

  it("keeps the migration dual-lane and stacks matching scopes", () => {
    assert.equal(sql, drizzle);
    assert.match(
      sql,
      /applicability_scope IN \('all', 'rate_plans', 'services', 'departments', 'folio'\)/,
    );
    assert.match(sql, /WHEN 'room' THEN 'rate_plans'/);
    assert.match(sql, /WHEN 'fnb' THEN 'services'/);
    assert.match(sql, /pms_tax_department_targets/);
    assert.match(sql, /pms_service_charge_department_targets/);
    assert.match(sql, /WHEN _scope = 'all' THEN true/);
    assert.match(sql, /WHEN _scope = 'rate_plans' THEN _charge_source = 'room'/);
    assert.match(sql, /WHEN _scope = 'services' THEN _charge_source = 'service'/);
    assert.match(sql, /WHEN _scope = 'departments' THEN/);
    assert.match(sql, /_charge_source IS DISTINCT FROM 'room'/);
    assert.doesNotMatch(sql, /credit_limit/);
    assert.doesNotMatch(sql, /UPDATE public\.pms_service_charges SET active = false/);
  });

  it("uses the same scope for manual preview, service preview, and posting", () => {
    assert.match(sql, /preview_folio_charge_scoped/);
    assert.match(sql, /'manual', NULL/);
    assert.match(sql, /'service',\s*department_id/);
    assert.match(sql, /applicabilityScope/);
    assert.match(sql, /noru\.charge_source/);
    assert.match(sql, /noru\.department_id/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.post_folio_charge_correction/);
  });

  it("offers the four scopes and property departments in Card 3", () => {
    assert.match(ui, /Applies to/);
    assert.match(ui, /TAX_APPLICABILITY_SCOPES/);
    assert.match(server, /Selected departments/);
    assert.match(server, /Rate plans only/);
    assert.match(server, /Services only/);
    assert.match(server, /All charges/);
    assert.match(fns, /applicability_scope/);
    assert.match(fns, /Choose departments from this property/);
    assert.match(fns, /pms_departments/);
    assert.equal(applicabilityFromBasis("room"), "rate_plans");
    assert.equal(applicabilityFromBasis("fnb"), "services");
    assert.equal(applicabilityFromBasis("all"), "all");
    assert.equal(basisForApplicability("departments"), "fnb");
    assert.equal(basisForApplicability("rate_plans"), "room");
  });
});
