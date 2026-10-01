import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ExchangeRateApiProvider,
  DEFAULT_OPEN_URL,
  DEFAULT_KEYED_URL,
} from "./providers/exchange-rate-api-provider";

describe("ExchangeRateApiProvider mode and validation", () => {
  it("uses open endpoint by default without appending an API key", () => {
    const provider = new ExchangeRateApiProvider({ mode: "open" });
    const url = provider.buildUrl("ETB");
    assert.equal(url, `${DEFAULT_OPEN_URL}/ETB`);
    assert.doesNotMatch(url, /\/v6\/[^/]+\/latest/);
  });

  it("requires API key in keyed mode and throws if missing", () => {
    assert.throws(
      () => new ExchangeRateApiProvider({ mode: "keyed", apiKey: "" }),
      /FX_PROVIDER_API_KEY is required when FX_PROVIDER_MODE is set to 'keyed'/,
    );
  });

  it("builds keyed endpoint with apiKey in keyed mode", () => {
    const provider = new ExchangeRateApiProvider({
      mode: "keyed",
      apiKey: "test-secret-key-123",
    });
    const url = provider.buildUrl("ETB");
    assert.equal(url, `${DEFAULT_KEYED_URL}/test-secret-key-123/latest/ETB`);
  });

  it("requires base currency to be ETB", async () => {
    const provider = new ExchangeRateApiProvider({ mode: "open" });
    await assert.rejects(
      async () => provider.fetchRates("USD", ["EUR"]),
      /ExchangeRateApiProvider requires base currency 'ETB'/,
    );
  });

  it("filters out ETB from requested quote currencies", async () => {
    const provider = new ExchangeRateApiProvider({ mode: "open" });
    // Empty quotes after filtering ETB returns immediately without external HTTP call
    const res = await provider.fetchRates("ETB", ["ETB"]);
    assert.equal(res.success, true);
    assert.deepEqual(res.rates, {});
  });
});
