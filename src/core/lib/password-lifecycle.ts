/**
 * Identity password lifecycle. This is not RBAC and not property-specific.
 * profiles.must_change_password is the only source. user_metadata is not read.
 */
import { mustChangePasswordFromProfile } from "@/packages/pms/lib/pms-permissions";

export const SET_PASSWORD_PATH = "/restaurant/set-password";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_RULE_MESSAGE = "Use at least 8 characters, including a letter and a number.";
export const PASSWORD_MISMATCH_MESSAGE = "Those passwords don't match.";
export const PASSWORD_CHANGE_REQUIRED = "Set a new password before continuing.";
export const PASSWORD_UPDATE_FAILED = "We couldn't update your password. Please try again.";
export const PASSWORD_FLAG_CLEAR_FAILED =
  "Your password was updated, but we couldn't finish sign-in setup. Try again.";
export const PASSWORD_STATUS_UNCONFIRMED =
  "We couldn't confirm your sign-in status. Refresh and try again.";

export const FORCED_PASSWORD_TITLE = "Set a new password";
export const FORCED_PASSWORD_COPY =
  "Your temporary password must be replaced before you can continue.";

export function validateNewPassword(
  password: string,
  confirm: string,
): { field: "password" | "confirm"; message: string } | null {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return { field: "password", message: PASSWORD_RULE_MESSAGE };
  }
  if (password !== confirm) return { field: "confirm", message: PASSWORD_MISMATCH_MESSAGE };
  return null;
}

export function passwordChangeRequired(row: { must_change_password?: boolean | null } | null | undefined): boolean {
  return mustChangePasswordFromProfile(row);
}

/** True only when the profile column from 0193 is not available yet. */
export function passwordColumnUnavailable(message: string | undefined): boolean {
  return /must_change_password/i.test(message ?? "");
}

/** The set-password screen is the only restaurant route that stays open while the flag is true. */
export function passwordGateAllowsPath(pathname: string): boolean {
  return pathname === SET_PASSWORD_PATH;
}
