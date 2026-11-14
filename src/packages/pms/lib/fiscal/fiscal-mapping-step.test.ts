import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { FISCAL_MAPPING_CHARGE_SOURCES } from "./fiscal.types.ts";

const drawer = readFileSync(
  new URL("../../components/settings/fiscal/fiscal-integration-drawer.tsx", import.meta.url),
  "utf8",
);
const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");

describe("fiscal mapping step", () => {
  it("prefills service item codes and leaves VAT as the open step", () => {
    assert.deepEqual(
      [...FISCAL_MAPPING_CHARGE_SOURCES],
      ["room", "manual", "service", "package", "system"],
    );
    const ensure = functions.slice(
      functions.indexOf("export const ensureFiscalItemMappings"),
      functions.indexOf("export const saveFiscalModeMapping"),
    );
    assert.match(ensure, /nature_of_supplies: "service"/);
    assert.match(ensure, /FISCAL_MAPPING_CHARGE_SOURCES/);
    assert.match(drawer, /const \[itemsOpen, setItemsOpen\] = useState\(false\)/);
    assert.match(drawer, /aria-expanded=\{itemsOpen\}/);
    assert.match(drawer, /ensureFiscalItemMappings/);
    assert.doesNotMatch(drawer, /Buyer codes/);
    assert.doesNotMatch(drawer, /chargeSource: "pos"/);
    assert.doesNotMatch(drawer, /chargeSource: "transfer"/);
    assert.match(drawer, /setTaxCode\(providerTaxCode\(event\.target\.value\)\)/);
    assert.match(
      functions,
      /providerTaxCode\(\s*requireExternalCode\(data\.externalTaxCode, "External tax code"\),?\s*\)/,
    );
  });
});
