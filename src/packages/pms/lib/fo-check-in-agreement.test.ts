import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  copyAcknowledgements,
  projectCheckInAgreement,
  signatureStoragePrefix,
} from "@/packages/pms/lib/fo-check-in-agreement";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const source = read("src/packages/pms/lib/fo-check-in-agreement.functions.ts");
const migration = read("supabase/migrations/0170_checkin_agreement_signature.sql");

function slice(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("check-in agreement read", () => {
  it("treats a missing version as a blocker", () => {
    const result = projectCheckInAgreement({
      reservationRoomId: "unit-1",
      guestId: "guest-1",
      guestSource: "unit_primary",
      version: null,
      signed: {
        id: "instance-1",
        agreementVersionId: "version-1",
        guestId: "guest-1",
        reservationRoomId: "unit-1",
        acknowledgements: { terms: true },
        signedAt: "2026-10-18T12:00:00.000Z",
        capturedBy: "staff-1",
        hasSignature: true,
      },
      draft: null,
    });
    expect(result.blocker).toBe("AGREEMENT_REQUIRED");
    expect(result.version).toBeNull();
    expect(result.signed).toBeNull();
  });

  it("returns the version that was shown and the submitted acknowledgements", () => {
    const submitted = { terms: true, privacy: false };
    const stored = copyAcknowledgements(submitted);
    submitted.terms = false;
    const result = projectCheckInAgreement({
      reservationRoomId: "unit-1",
      guestId: "guest-1",
      guestSource: "unit_primary",
      version: { id: "version-1", label: "2026.1", body: "House rules" },
      signed: {
        id: "instance-1",
        agreementVersionId: "version-1",
        guestId: "guest-1",
        reservationRoomId: "unit-1",
        acknowledgements: stored,
        signedAt: "2026-10-18T12:00:00.000Z",
        capturedBy: "staff-1",
        hasSignature: true,
      },
      draft: null,
    });
    expect(result.blocker).toBeNull();
    expect(result.version?.id).toBe("version-1");
    expect(result.signed?.acknowledgements).toEqual({ terms: true, privacy: false });
    expect(result.signed?.hasSignature).toBe(true);
  });
});

describe("check-in agreement commands", () => {
  it("stores the target guest, unit, and shown version", () => {
    const save = slice(
      "export const saveCheckInAgreement",
      "export const captureCheckInAgreementSignature",
    );
    const capture = slice(
      "export const captureCheckInAgreementSignature",
      "export const beginCheckInAgreementResign",
    );
    const resign = source.slice(source.indexOf("export const beginCheckInAgreementResign"));
    for (const command of [save, resign]) {
      expect(command).toContain("guest_id: target.primaryGuestId");
      expect(command).toContain("reservation_room_id: target.reservationRoomId");
      expect(command).toContain("agreement_version_id: version.id");
    }
    expect(capture).toContain("draft.guest_id !== target.primaryGuestId");
    expect(capture).toContain("draft.reservation_room_id !== target.reservationRoomId");
    expect(capture).toContain("version.id !== data.agreementVersionId");
    expect(capture).not.toContain("guest_id: target.primaryGuestId");
    for (const command of [save, capture, resign]) {
      expect(command).toContain("requireReservationManager");
    }
    expect(save).toContain("acknowledgements");
    expect(capture).not.toContain("acknowledgements");
    expect(capture).toContain('signature_method: "drawn"');
    expect(capture).toContain("signature_storage_path: data.storagePath");
    expect(resign).toContain(".insert(");
    expect(resign).not.toContain(".update(");
    expect(save).toContain("AGREEMENT_ALREADY_SIGNED");
    expect(source).not.toContain("guestId: idSchema");
  });

  it("does not read or write consent columns or email signatures", () => {
    const files = [source, read("src/packages/pms/lib/fo-check-in-agreement.ts"), migration];
    for (const file of files) {
      expect(file).not.toContain("data_processing_consent");
      expect(file).not.toContain("marketing_consent");
      expect(file).not.toContain("pms_communication_sender_settings");
      expect(file).not.toContain("pms_communication_defaults");
      expect(file).not.toContain("registration_snapshot");
    }
    const history = slice("function historyValues", "export const getCheckInAgreement");
    expect(history).toContain("agreement_version_id");
    expect(history).toContain("guest_id");
    expect(history).toContain("reservation_room_id");
    expect(history).toContain("instance_id");
    expect(history).not.toContain("signature_storage_path");
  });

  it("publishes a new version instead of editing signed text", () => {
    const publish = slice(
      "export const publishCheckInAgreementVersion",
      "export const saveCheckInAgreement",
    );
    expect(publish).toContain("requireSupervisor");
    expect(publish).toContain(".update({ active: false })");
    expect(publish.match(/\.update\(/g)).toHaveLength(1);
    expect(publish).toContain(".insert(");
    expect(publish).toContain("body: data.body");
    expect(signatureStoragePrefix("property-1", "stay-1")).toBe(
      "property-1/check-in-agreements/stay-1/",
    );
  });
});

describe("check-in agreement migration", () => {
  it("rejects an update of a signed row and freezes a referenced version", () => {
    expect(migration).toContain("IF OLD.signed_at IS NOT NULL THEN");
    expect(migration).toContain("RAISE EXCEPTION 'AGREEMENT_INSTANCE_IMMUTABLE'");
    expect(migration).toContain("OR NEW.body IS DISTINCT FROM OLD.body");
    expect(migration).toContain("RAISE EXCEPTION 'AGREEMENT_VERSION_IMMUTABLE'");
    expect(migration).toContain("CHECKIN_AGREEMENT_UNIT_REQUIRED");
    expect(migration).toContain("signature_method = 'drawn'");
    const drizzle = read("drizzle/migrations/0170_checkin_agreement_signature.sql");
    expect(drizzle).toBe(migration);
  });
});
