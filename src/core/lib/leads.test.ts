import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  LEAD_COOLDOWN_LIMIT,
  isMissingLeadStorage,
  leadCooldownExceeded,
  leadStorageErrorMessage,
  leadStorageUnavailableMessage,
  leadSubmissionSchema,
  leadUpdateSchema,
} from "./leads.ts";
import { marketingUploadFailureMessage } from "./marketing-media.ts";

describe("lead submissions", () => {
  it("accepts a request demo and normalizes the email", () => {
    const parsed = leadSubmissionSchema.parse({
      source: "request_demo",
      name: "Ada",
      email: "Ada@Hotel.example",
      company: "Sunrise Hotel",
      phone: "",
      message: "",
      propertyType: "Hotel",
    });
    assert.equal(parsed.email, "ada@hotel.example");
    assert.equal(parsed.phone, null);
    assert.equal(parsed.message, null);
    assert.equal(parsed.source, "request_demo");
  });

  it("rejects an unknown property type", () => {
    const parsed = leadSubmissionSchema.safeParse({
      source: "contact",
      name: "Ada",
      email: "ada@hotel.example",
      company: "Sunrise",
      propertyType: "Hostel",
    });
    assert.equal(parsed.success, false);
  });

  it("blocks a fourth submission inside the cooldown", () => {
    assert.equal(leadCooldownExceeded(LEAD_COOLDOWN_LIMIT - 1), false);
    assert.equal(leadCooldownExceeded(LEAD_COOLDOWN_LIMIT), true);
  });

  it("accepts an inbox status update", () => {
    const parsed = leadUpdateSchema.parse({
      id: "8e56bce2-dbd1-479c-a459-bc261bd6c17d",
      status: "contacted",
      notes: "Called the property.",
    });
    assert.equal(parsed.status, "contacted");
  });

  it("turns a missing leads table into a controlled message", () => {
    const missing = "Could not find the table 'public.leads' in the schema cache";
    assert.equal(isMissingLeadStorage(missing), true);
    assert.equal(
      leadStorageErrorMessage(missing, "We couldn't send that request. Please try again."),
      leadStorageUnavailableMessage(),
    );
  });

  it("keeps other database failures retryable", () => {
    assert.equal(
      leadStorageErrorMessage(
        "connection refused",
        "We couldn't send that request. Please try again.",
      ),
      "We couldn't send that request. Please try again.",
    );
  });

  it("keeps the admin inbox behind platform admin auth", () => {
    const source = readFileSync(new URL("./leads.functions.ts", import.meta.url), "utf8");
    assert.match(source, /export const listLeads = createServerFn\(\{ method: "GET" \}\)/);
    assert.match(source, /export const updateLead = createServerFn\(\{ method: "POST" \}\)/);
    assert.equal(source.includes("requireSupabaseAuth"), true);
    assert.equal(source.includes("requirePlatformAdmin"), true);
    assert.equal(source.includes("supabaseAdmin"), true);
  });
});

describe("marketing media uploads", () => {
  it("reports a missing bucket without crashing the page", () => {
    assert.equal(
      marketingUploadFailureMessage("Bucket not found"),
      "Image storage is unavailable. Please try again later.",
    );
  });

  it("keeps other upload failures as a start error", () => {
    assert.equal(
      marketingUploadFailureMessage("payload too large"),
      "Could not start the image upload.",
    );
  });
});
