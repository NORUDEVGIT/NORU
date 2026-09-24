import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_DOCUMENTS_MIGRATION_FILE,
  documentExpiryStatus,
  kindFromTypeCode,
  nextSelectedDocumentId,
  typeAllowedForNewDocument,
} from "./guest-identity-documents.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Identity document helpers", () => {
  it("maps Settings type codes onto existing kind values", () => {
    assert.equal(kindFromTypeCode("PAS"), "passport");
    assert.equal(kindFromTypeCode("NID"), "national_id");
    assert.equal(kindFromTypeCode("DL"), "driving_licence");
    assert.equal(kindFromTypeCode("VISA"), "visa");
    assert.equal(kindFromTypeCode("OID"), "other");
  });

  it("reuses valid_for_profile_type_ids and blocks inactive types for new documents", () => {
    const profile = "type-individual";
    assert.equal(
      typeAllowedForNewDocument({ active: true, validForProfileTypeIds: [profile] }, profile),
      true,
    );
    assert.equal(
      typeAllowedForNewDocument({ active: false, validForProfileTypeIds: [profile] }, profile),
      false,
    );
    assert.equal(
      typeAllowedForNewDocument({ active: true, validForProfileTypeIds: ["other"] }, profile),
      false,
    );
    assert.equal(typeAllowedForNewDocument({ active: true, validForProfileTypeIds: [] }, profile), false);
  });

  it("classifies expiry against property today", () => {
    assert.equal(documentExpiryStatus(null, "2026-09-21"), "none");
    assert.equal(documentExpiryStatus("2026-09-20", "2026-09-21"), "expired");
    assert.equal(documentExpiryStatus("2026-10-01", "2026-09-21"), "expiring_soon");
    assert.equal(documentExpiryStatus("2027-01-01", "2026-09-21"), "valid");
  });

  it("keeps selection after save and picks the next row after delete", () => {
    const docs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.equal(nextSelectedDocumentId(docs, "b"), "b");
    assert.equal(nextSelectedDocumentId(docs, "b", "b"), "a");
    assert.equal(nextSelectedDocumentId([{ id: "only" }], "only", "only"), null);
  });
});

describe("Identity documents lock", () => {
  it("extends guest_documents instead of creating a second document table", () => {
    const supabaseSql = readRel(`../../../../supabase/migrations/${IDENTITY_DOCUMENTS_MIGRATION_FILE}`);
    const drizzleSql = readRel(`../../../../drizzle/migrations/${IDENTITY_DOCUMENTS_MIGRATION_FILE}`);
    for (const sql of [supabaseSql, drizzleSql]) {
      assert.match(sql, /ALTER TABLE public\.guest_documents/);
      assert.match(sql, /id_type_id uuid REFERENCES public\.pms_guest_id_types/);
      assert.match(sql, /back_storage_path/);
      assert.match(sql, /document_updated/);
      assert.match(sql, /document_deleted/);
      assert.match(sql, /Front office delete guest documents/);
      assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.guest_identity_/);
      assert.doesNotMatch(sql, /CREATE .+SECURITY DEFINER/s);
    }
    assert.equal(supabaseSql, drizzleSql);
  });

  it("keeps Settings pms_guest_id_types as the type source of truth", () => {
    const functions = readRel("./guests.functions.ts");
    const identity = readRel("../components/guests/guest-identity-card.tsx");
    assert.match(functions, /from\("pms_guest_id_types"\)/);
    assert.match(functions, /valid_for_profile_type_ids/);
    assert.match(functions, /document_number_required/);
    assert.match(functions, /scan_image_allowed/);
    assert.match(functions, /export const listGuestIdentityDocumentTypes/);
    assert.match(functions, /export const getGuestDocument/);
    assert.match(functions, /export const saveGuestDocument/);
    assert.match(functions, /export const saveGuestDocumentImage/);
    assert.match(functions, /export const clearGuestDocumentImage/);
    assert.match(functions, /export const deleteGuestDocument/);
    assert.match(functions, /includeNumber: boolean/);
    assert.match(functions, /signRoomImages/);
    assert.match(functions, /createSignedUploadUrl/);
    assert.doesNotMatch(functions, /getPublicUrl/);
    assert.match(identity, /Upload New Document/);
    assert.match(identity, /View All Documents/);
    assert.match(identity, /Print Selected/);
    assert.match(identity, /Delete Document/);
    assert.match(identity, /Staff verify/);
    assert.match(identity, /Re-verify/);
    assert.match(identity, /STAFF_VERIFY_COPY/);
    assert.doesNotMatch(identity, /Recent Activity/);
    assert.doesNotMatch(identity, /getPublicUrl/);
  });

  it("does not change verification status when saving document fields", () => {
    const functions = readRel("./guests.functions.ts");
    const saveStart = functions.indexOf("export const saveGuestDocument");
    const saveEnd = functions.indexOf("export const saveGuestDocumentImage");
    const save = functions.slice(saveStart, saveEnd);
    assert.match(save, /id_type_id: data\.idTypeId/);
    assert.doesNotMatch(save, /verification_status/);
    assert.doesNotMatch(save, /verified_at/);
  });

  it("lists a mask and returns the full number only from getGuestDocument", () => {
    const functions = readRel("./guests.functions.ts");
    const listStart = functions.indexOf("export const listGuestDocuments");
    const listEnd = functions.indexOf("export const reviewGuestDocument");
    const list = functions.slice(listStart, listEnd);
    assert.match(list, /signed,\s+false/);
    assert.match(list, /documentNumber: _hidden/);
    const getStart = functions.indexOf("export const getGuestDocument");
    const getEnd = functions.indexOf("export const saveGuestDocument");
    const get = functions.slice(getStart, getEnd);
    assert.match(get, /mapGuestDocumentRow\(item, types, actorNames, signed, true\)/);
    assert.match(get, /requireGuestManager/);
  });
});
