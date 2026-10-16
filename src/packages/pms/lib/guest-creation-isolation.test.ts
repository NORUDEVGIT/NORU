import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCompanyFieldCode,
  isTravelAgencyFieldCode,
  isGroupFieldCode,
  isIndividualGuestFieldCode,
} from "./guest-creation-field-definitions.ts";
import {
  resolveGuestFieldRules,
  validateGuestFields,
} from "./guest-field-rules.ts";
import {
  createFieldRules,
} from "./guest-create-workspace.ts";
import {
  createCompanyFieldRules,
} from "./guest-company-create-workspace.ts";
import {
  createTravelAgencyFieldRules,
} from "./guest-travel-agent-create-workspace.ts";
import type { GuestFieldRecord } from "./required-fields-card4.server.ts";

function makeField(partial: Partial<GuestFieldRecord> & { code: string; required: boolean }): GuestFieldRecord {
  return {
    id: partial.id ?? `f-${partial.code.toLowerCase()}`,
    name: partial.name ?? partial.code,
    code: partial.code,
    fieldType: partial.fieldType ?? "text",
    description: null,
    options: [],
    required: partial.required,
    checkIn: false,
    reservation: false,
    active: partial.active ?? true,
    displayOrder: 1,
    lookupSource: null,
    documentTypeIds: [],
    minValue: null,
    maxValue: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Cross-profile field requirement isolation", () => {
  it("partitions field codes cleanly across Individual, Company, and Travel Agency", () => {
    // Individual fields
    assert.equal(isIndividualGuestFieldCode("FIRST_NAME"), true);
    assert.equal(isIndividualGuestFieldCode("DATE_OF_BIRTH"), true);
    assert.equal(isIndividualGuestFieldCode("PHONE"), true);
    assert.equal(isCompanyFieldCode("FIRST_NAME"), false);
    assert.equal(isTravelAgencyFieldCode("FIRST_NAME"), false);

    // Company fields
    assert.equal(isCompanyFieldCode("COMPANY_TAX_ID"), true);
    assert.equal(isCompanyFieldCode("TAX_ID"), true);
    assert.equal(isCompanyFieldCode("TIN"), true);
    assert.equal(isCompanyFieldCode("COMPANY_NAME"), true);
    assert.equal(isIndividualGuestFieldCode("COMPANY_TAX_ID"), false);
    assert.equal(isIndividualGuestFieldCode("TAX_ID"), false);
    assert.equal(isTravelAgencyFieldCode("COMPANY_TAX_ID"), false);

    // Travel Agency fields
    assert.equal(isTravelAgencyFieldCode("TA_TAX_ID"), true);
    assert.equal(isTravelAgencyFieldCode("TA_NAME"), true);
    assert.equal(isTravelAgencyFieldCode("TA_IATA_NUMBER"), true);
    assert.equal(isCompanyFieldCode("TA_TAX_ID"), false);
    assert.equal(isIndividualGuestFieldCode("TA_TAX_ID"), false);
  });

  it("Individual guest creation never requires Company TIN, Tax ID, or TA fields even when marked required", () => {
    const config = {
      requiredFields: [
        makeField({ code: "FIRST_NAME", name: "First Name", required: true }),
        makeField({ code: "LAST_NAME", name: "Last Name", required: true }),
        // Company fields marked required in Card 4
        makeField({ code: "COMPANY_TAX_ID", name: "Company TIN Number", required: true }),
        makeField({ code: "TAX_ID", name: "Tax ID / TIN", required: true }),
        makeField({ code: "COMPANY_NAME", name: "Company Name", required: true }),
        // Travel Agency fields marked required in Card 4
        makeField({ code: "TA_TAX_ID", name: "Agency Tax ID", required: true }),
        makeField({ code: "TA_IATA_NUMBER", name: "IATA Number", required: true }),
      ],
      types: [
        {
          id: "pt-ind",
          code: "IND",
          domain: "individual",
          active: true,
          requiredFieldIds: ["f-first_name", "f-last_name"],
        },
      ],
    };

    const rules = resolveGuestFieldRules(config as never, config.types[0] as never, "profile_create");

    // Company and TA fields must NOT be requiredForContext in individual guest rules
    const companyTax = rules.find((r) => r.code === "COMPANY_TAX_ID");
    const taxId = rules.find((r) => r.code === "TAX_ID");
    const companyName = rules.find((r) => r.code === "COMPANY_NAME");
    const taTax = rules.find((r) => r.code === "TA_TAX_ID");

    assert.equal(companyTax?.requiredForContext, false);
    assert.equal(taxId?.requiredForContext, false);
    assert.equal(companyName?.requiredForContext, false);
    assert.equal(taTax?.requiredForContext, false);

    // Validating individual guest data must succeed without company or TA fields
    const validation = validateGuestFields(
      { firstName: "Abebe", lastName: "Bikila" },
      rules,
      "profile_create",
      null,
    );

    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.missingFieldCodes.includes("COMPANY_TAX_ID"), false);
    assert.equal(validation.missingFieldCodes.includes("TAX_ID"), false);
    assert.equal(validation.missingFieldCodes.includes("TA_TAX_ID"), false);
  });

  it("Individual createFieldRules ignores company and travel agency fields", () => {
    const fields = [
      makeField({ code: "FIRST_NAME", name: "First Name", required: true }),
      makeField({ code: "COMPANY_TAX_ID", name: "Company TIN Number", required: true }),
      makeField({ code: "TAX_ID", name: "Tax ID / TIN", required: true }),
      makeField({ code: "TA_TAX_ID", name: "Agency Tax ID", required: true }),
    ];

    const rules = createFieldRules(fields, null);

    // COMPANY_TAX_ID, TAX_ID, TA_TAX_ID should either not exist or not be required
    for (const rule of rules) {
      if (rule.code === "COMPANY_TAX_ID" || rule.code === "TAX_ID" || rule.code === "TA_TAX_ID") {
        assert.equal(rule.required, false);
      }
    }
  });

  it("Company creation rules are not affected by Individual or Travel Agency required fields", () => {
    const fields = [
      // Individual fields marked required
      makeField({ code: "DATE_OF_BIRTH", name: "Date of Birth", required: true }),
      makeField({ code: "NATIONALITY", name: "Nationality", required: true }),
      makeField({ code: "PHONE", name: "Mobile Phone", required: true }),
      // Travel agency field marked required
      makeField({ code: "TA_TAX_ID", name: "Agency Tax ID", required: true }),
      makeField({ code: "TA_IATA_NUMBER", name: "IATA Number", required: true }),
      // Company tax ID marked optional in Card 4
      makeField({ id: "f-com-tax", code: "COMPANY_TAX_ID", name: "Tax ID / TIN", required: false }),
    ];

    const companyRules = createCompanyFieldRules(
      fields,
      { id: "com-type-1", requiredFieldIds: [] },
      null,
    );

    // Date of Birth and Nationality must NOT be in company rules
    const dobRule = companyRules.find((r) => r.code === "DATE_OF_BIRTH");
    assert.equal(dobRule, undefined);

    // Individual PHONE requirement must NOT make Company contact phone required
    const contactPhoneRule = companyRules.find((r) => r.code === "COMPANY_CONTACT_PHONE");
    assert.equal(contactPhoneRule?.required, false);

    // TA_TAX_ID requirement must NOT make Company tax ID required
    const taxRule = companyRules.find((r) => r.code === "COMPANY_TAX_ID");
    assert.equal(taxRule?.required, false);
  });

  it("Company creation requires TAX_ID when Company profile type includes it", () => {
    const fields = [
      makeField({ id: "f-com-tax", code: "COMPANY_TAX_ID", name: "Tax ID / TIN", required: true }),
    ];

    const companyRules = createCompanyFieldRules(
      fields,
      { id: "com-type-1", requiredFieldIds: ["f-com-tax"] },
      null,
    );

    const taxRule = companyRules.find((r) => r.code === "COMPANY_TAX_ID");
    assert.equal(taxRule?.required, true);
  });

  it("Travel Agency creation rules are not affected by Company TAX_ID or Individual PHONE", () => {
    const fields = [
      // Company TAX_ID marked required
      makeField({ id: "f-com-tax", code: "COMPANY_TAX_ID", name: "Company TIN", required: true }),
      makeField({ id: "f-tax-id", code: "TAX_ID", name: "Tax ID", required: true }),
      // Individual PHONE marked required
      makeField({ id: "f-ind-phone", code: "PHONE", name: "Mobile Phone", required: true }),
      // Travel agency TAX_ID marked optional
      makeField({ id: "f-ta-tax", code: "TA_TAX_ID", name: "Agency Tax ID", required: false }),
    ];

    const taRules = createTravelAgencyFieldRules(
      fields,
      { id: "tra-type-1", requiredFieldIds: [] },
    );

    // Travel Agency tax ID must NOT be required just because Company TAX_ID was required
    const taTaxRule = taRules.find((r) => r.code === "TA_TAX_ID");
    assert.equal(taTaxRule?.required, false);

    // Travel Agency phone must NOT be required just because Individual PHONE was required
    const taPhoneRule = taRules.find((r) => r.code === "TA_CONTACT_PHONE");
    assert.equal(taPhoneRule?.required, false);
  });

  it("Travel Agency creation requires TA_TAX_ID when Travel Agency profile type includes it", () => {
    const fields = [
      makeField({ id: "f-ta-tax", code: "TA_TAX_ID", name: "Agency Tax ID", required: true }),
    ];

    const taRules = createTravelAgencyFieldRules(
      fields,
      { id: "tra-type-1", requiredFieldIds: ["f-ta-tax"] },
    );

    const taTaxRule = taRules.find((r) => r.code === "TA_TAX_ID");
    assert.equal(taTaxRule?.required, true);
  });
});
