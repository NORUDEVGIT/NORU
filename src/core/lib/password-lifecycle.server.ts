/**
 * Server password gate. Reads profiles through the caller's client.
 * Does not consult role or permissions.
 */
import { mustChangePasswordFromProfile } from "@/packages/pms/lib/pms-permissions";
import {
  PASSWORD_CHANGE_REQUIRED,
  PASSWORD_STATUS_UNCONFIRMED,
  passwordColumnUnavailable,
} from "./password-lifecycle";

type ProfileClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { must_change_password?: boolean | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

const gateCache = new WeakMap<object, Promise<void>>();

async function readAndAssert(context: { supabase: ProfileClient; userId: string }): Promise<void> {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) {
    if (passwordColumnUnavailable(error.message)) return;
    throw new Error(PASSWORD_STATUS_UNCONFIRMED);
  }
  if (mustChangePasswordFromProfile(data)) throw new Error(PASSWORD_CHANGE_REQUIRED);
}

/** One profile read per request context. A failed read is not cached. */
export function assertPasswordChangeComplete(context: {
  supabase: ProfileClient;
  userId: string;
}): Promise<void> {
  const cached = gateCache.get(context);
  if (cached) return cached;
  const pending = readAndAssert(context).catch((error: unknown) => {
    gateCache.delete(context);
    throw error;
  });
  gateCache.set(context, pending);
  return pending;
}
