import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { assertPasswordChangeComplete } from "../../../core/lib/password-lifecycle.server.ts";
import { passwordResumeValid, signPasswordResume } from "../../../core/lib/password-resume.server.ts";
import {
  PASSWORD_CHANGE_REQUIRED,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  SET_PASSWORD_PATH,
  passwordChangeRequired,
  passwordGateAllowsPath,
  validateNewPassword,
} from "../../../core/lib/password-lifecycle.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function profileClient(row: { must_change_password?: boolean } | null, error: { message: string } | null = null) {
  let reads = 0;
  const context = {
    userId: "user-1",
    supabase: {
      from(table: string) {
        assert.equal(table, "profiles");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            reads += 1;
            return { data: row, error };
          },
        };
      },
    },
  };
  return { context, reads: () => reads };
}

describe("forced password gate", () => {
  it("blocks every restaurant path except the set-password route", () => {
    assert.equal(passwordGateAllowsPath(SET_PASSWORD_PATH), true);
    assert.equal(passwordGateAllowsPath("/restaurant/pms/reservations"), false);
    assert.equal(passwordGateAllowsPath("/restaurant/pms/cashiering"), false);
    assert.equal(passwordGateAllowsPath("/restaurant/settings"), false);
    assert.equal(passwordChangeRequired({ must_change_password: true }), true);
    assert.equal(passwordChangeRequired({ must_change_password: false }), false);
    assert.equal(passwordChangeRequired(null), false);
  });

  it("rejects business access while the flag is true, including an owner profile", async () => {
    const required = profileClient({ must_change_password: true });
    await assert.rejects(
      assertPasswordChangeComplete(required.context),
      new RegExp(PASSWORD_CHANGE_REQUIRED),
    );
    const owner = profileClient({ must_change_password: true });
    await assert.rejects(assertPasswordChangeComplete(owner.context), /Set a new password/);
    const open = profileClient({ must_change_password: false });
    await assert.doesNotReject(assertPasswordChangeComplete(open.context));
    await assert.doesNotReject(assertPasswordChangeComplete(open.context));
    assert.equal(open.reads(), 1);
  });

  it("fails closed on an unexpected profile error and stays open when the column is absent", async () => {
    const missing = profileClient(null, { message: "column must_change_password does not exist" });
    await assert.doesNotReject(assertPasswordChangeComplete(missing.context));
    const down = profileClient(null, { message: "connection refused" });
    await assert.rejects(assertPasswordChangeComplete(down.context), /confirm your sign-in status/);
    await assert.rejects(assertPasswordChangeComplete(down.context), /confirm your sign-in status/);
  });
});

describe("password resume proof", () => {
  it("accepts only an unexpired proof for the same user", async () => {
    const proof = await signPasswordResume("user-1", "test-key", 1_000);
    assert.equal(await passwordResumeValid("user-1", proof, "test-key", 1_000), true);
    assert.equal(await passwordResumeValid("user-2", proof, "test-key", 1_000), false);
    assert.equal(await passwordResumeValid("user-1", proof, "other-key", 1_000), false);
    assert.equal(await passwordResumeValid("user-1", proof, "test-key", 1_000 + 11 * 60 * 1000), false);
    assert.equal(await passwordResumeValid("user-1", "", "test-key", 1_000), false);
  });
});

describe("password form rules", () => {
  it("stops a mismatch before any password update", () => {
    const mismatch = validateNewPassword("abc12345", "abc12346");
    assert.equal(mismatch?.field, "confirm");
    assert.equal(mismatch?.message, PASSWORD_MISMATCH_MESSAGE);
    const short = validateNewPassword("abc123", "abc123");
    assert.equal(short?.field, "password");
    assert.equal(short?.message, PASSWORD_RULE_MESSAGE);
    assert.equal(validateNewPassword("abc12345", "abc12345"), null);
  });
});

describe("password lifecycle wiring", () => {
  it("gates the restaurant shell, membership resolver, and set-password route", () => {
    const shell = read("../../../core/components/restaurant-shell.tsx");
    const membership = read("../../../core/lib/workforce.server.ts");
    const page = read("../../../routes/restaurant/set-password.tsx");
    const login = read("../../../routes/restaurant/login.tsx");
    const recovery = read("../../../routes/reset-password.tsx");
    const staff = read("./pms-staff.functions.ts");
    const clear = read("../../../core/lib/password-lifecycle.functions.ts");
    const restaurants = read("../../../core/lib/restaurant.functions.ts");
    const serverGate = read("../../../core/lib/password-lifecycle.server.ts");
    assert.match(shell, /SET_PASSWORD_PATH/);
    assert.match(shell, /password-gate-redirect/);
    assert.match(membership, /assertPasswordChangeComplete\(context\)/);
    assert.match(restaurants, /assertPasswordChangeComplete/);
    assert.doesNotMatch(serverGate, /restaurant_users|isOwner|owner/);
    assert.doesNotMatch(membership, /must_change_password[\s\S]{0,80}owner/);
    const submit = page.slice(page.indexOf("async function onSubmit"));
    assert.ok(submit.indexOf("validateNewPassword") < submit.indexOf("applyFinish"));
    assert.doesNotMatch(submit, /updateUser|localStorage|sessionStorage/);
    const recoverySubmit = recovery.slice(recovery.indexOf("async function onSubmit"));
    assert.ok(recoverySubmit.indexOf("validateNewPassword") < recoverySubmit.indexOf("clearFlag("));
    assert.doesNotMatch(recoverySubmit, /updateUser/);
    const finish = clear.slice(clear.indexOf("export const clearMyPasswordChange"));
    assert.ok(finish.indexOf("updatePasswordWithSession") < finish.indexOf("must_change_password: false"));
    assert.match(clear, /\/auth\/v1\/user/);
    assert.match(page, /Sign out/);
    assert.match(page, /FORCED_PASSWORD_COPY/);
    assert.match(login, /SET_PASSWORD_PATH/);
    assert.match(recovery, /clearMyPasswordChange/);
    assert.match(recovery, /validateNewPassword/);
    assert.match(staff, /if \(password\) await markPasswordChange/);
    assert.match(staff, /membership\.role === "owner"/);
    assert.match(clear, /must_change_password: false/);
    assert.doesNotMatch(clear, /user_metadata/);
    assert.doesNotMatch(`${page}\n${clear}\n${login}`, /localStorage|sessionStorage|console\.log/);

    for (const route of [
      "../routes/restaurant/pms/reservations.index.tsx",
      "../routes/restaurant/pms/cashiering.tsx",
      "../routes/restaurant/settings.tsx",
    ]) {
      assert.match(read(`../../../${route.replace("../", "")}`), /RestaurantShell/);
    }
  });

  it("keeps the flag on the profile, never stores a temporary password, and protects the column", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0193_pms_rbac_foundation.sql"), "utf8");
    const lane = readFileSync(join(process.cwd(), "supabase/migrations/0195_pms_password_lifecycle.sql"), "utf8");
    const drizzle = readFileSync(join(process.cwd(), "drizzle/migrations/0195_pms_password_lifecycle.sql"), "utf8");
    assert.match(sql, /ALTER TABLE public\.profiles/);
    assert.match(sql, /must_change_password boolean NOT NULL DEFAULT false/);
    assert.doesNotMatch(sql, /temporary password|user_metadata/);
    assert.equal(lane, drizzle);
    assert.match(lane, /protect_must_change_password/);
    assert.match(lane, /service_role/);
    assert.doesNotMatch(lane, /temporary password|user_metadata/);
    const staff = read("./pms-staff.functions.ts");
    assert.doesNotMatch(staff, /console\.log\([\s\S]{0,40}password/);
    assert.doesNotMatch(staff, /metadata:\s*\{[^}]*password/);
  });
});
