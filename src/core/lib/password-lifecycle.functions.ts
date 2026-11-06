import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mustChangePasswordFromProfile } from "@/packages/pms/lib/pms-permissions";
import {
  PASSWORD_FLAG_CLEAR_FAILED,
  PASSWORD_UPDATE_FAILED,
  passwordColumnUnavailable,
  validateNewPassword,
} from "./password-lifecycle";

/** Minimal identity read for the set-password screen and the restaurant shell. */
export const getMyPasswordGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) {
      if (passwordColumnUnavailable(error.message)) {
        return { mustChangePassword: false, columnReady: false, restaurantId: null as string | null };
      }
      throw new Error("We couldn't confirm your sign-in status. Refresh and try again.");
    }
    const { data: membership } = await context.supabase
      .from("restaurant_users")
      .select("restaurant_id")
      .eq("user_id", context.userId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return {
      mustChangePassword: mustChangePasswordFromProfile(data),
      columnReady: true,
      restaurantId: membership?.restaurant_id ?? null,
    };
  });

function finishInput(input: unknown): { password: string; resume: string } {
  const raw = input && typeof input === "object" ? (input as { password?: unknown; resume?: unknown }) : {};
  const resume = typeof raw.resume === "string" ? raw.resume : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  if (!resume) {
    const issue = validateNewPassword(password, password);
    if (issue) throw new Error(issue.message);
  }
  return { password: resume ? "" : password, resume };
}

/**
 * Same GoTrue request as supabase.auth.updateUser({ password }), using the
 * caller's session. The flag is cleared only after that request succeeds, so a
 * direct call cannot drop the flag while keeping the temporary password.
 */
async function updatePasswordWithSession(
  password: string,
): Promise<{ accessToken?: string; refreshToken?: string }> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const header = getRequest()?.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !apiKey) throw new Error(PASSWORD_UPDATE_FAILED);
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(PASSWORD_UPDATE_FAILED);
  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;
  return {
    accessToken: typeof payload?.access_token === "string" ? payload.access_token : undefined,
    refreshToken: typeof payload?.refresh_token === "string" ? payload.refresh_token : undefined,
  };
}

/**
 * Sets the signed-in user's password, then clears profiles.must_change_password.
 * A failed flag write returns a resume proof so the retry does not send the password again.
 */
export const clearMyPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(finishInput)
  .handler(async ({ context, data }) => {
    const { passwordResumeValid, signPasswordResume } = await import("./password-resume.server");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    if (data.resume) {
      if (!key || !(await passwordResumeValid(context.userId, data.resume, key))) {
        throw new Error(PASSWORD_FLAG_CLEAR_FAILED);
      }
    } else {
      const session = await updatePasswordWithSession(data.password);
      accessToken = session.accessToken;
      refreshToken = session.refreshToken;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) {
      if (passwordColumnUnavailable(error.message)) {
        return { ok: true as const, columnReady: false, accessToken, refreshToken };
      }
      if (!key) throw new Error(PASSWORD_FLAG_CLEAR_FAILED);
      return { ok: false as const, resume: await signPasswordResume(context.userId, key), accessToken, refreshToken };
    }
    return { ok: true as const, columnReady: true, accessToken, refreshToken };
  });
