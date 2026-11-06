import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { NoruLogo } from "@/core/components/noru-logo";
import { AuthError, AuthField, AuthSubmit } from "@/core/components/auth/authshell";
import { clearMyPasswordChange } from "@/core/lib/password-lifecycle.functions";
import {
  FORCED_PASSWORD_COPY,
  FORCED_PASSWORD_TITLE,
  PASSWORD_FLAG_CLEAR_FAILED,
  PASSWORD_UPDATE_FAILED,
  validateNewPassword,
} from "@/core/lib/password-lifecycle";
import { invalidatePasswordGate, usePasswordGate } from "@/core/lib/use-password-gate";
import { useAuth } from "@/core/state/auth-store";
import { supabase } from "@/integrations/supabase/client";
import { getFirstAccessiblePmsRoute } from "@/packages/pms/lib/pms-client-access";
import { getMyPmsPermissions } from "@/packages/pms/lib/pms-permissions.functions";

export const Route = createFileRoute("/restaurant/set-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a New Password — NORU" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading, signOut } = useAuth();
  const gate = usePasswordGate(Boolean(session));
  const clearFlag = useServerFn(clearMyPasswordChange);
  const fetchPermissions = useServerFn(getMyPmsPermissions);
  const continued = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<"password" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [resume, setResume] = useState<string | null>(null);
  const [noModule, setNoModule] = useState(false);

  useEffect(() => {
    if (loading || session) return;
    void navigate({ to: "/restaurant/login", replace: true });
  }, [loading, navigate, session]);

  useEffect(() => {
    if (!gate.data || gate.data.mustChangePassword || passwordUpdated || continued.current) return;
    continued.current = true;
    void continueToApp(gate.data.restaurantId);
  }, [gate.data, passwordUpdated]);

  async function continueToApp(restaurantId: string | null) {
    if (!restaurantId) {
      setNoModule(true);
      return;
    }
    try {
      const access = await fetchPermissions({ data: { restaurantId } });
      const next = getFirstAccessiblePmsRoute({ isOwner: access.isOwner, codes: access.codes });
      if (!next) {
        setNoModule(true);
        return;
      }
      await navigate({ to: next as never, replace: true });
    } catch {
      setNoModule(true);
    }
  }

  async function finish(restaurantId: string | null) {
    await invalidatePasswordGate(queryClient);
    setPassword("");
    setConfirm("");
    await continueToApp(restaurantId);
  }

  async function keepSession(result: { accessToken?: string; refreshToken?: string }) {
    try {
      if (result.accessToken && result.refreshToken) {
        await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
        return;
      }
      await supabase.auth.refreshSession();
    } catch {
      // The access token from this sign-in still opens the next screen when the provider keeps it.
    }
  }

  async function applyFinish(input: { password?: string; resume?: string }) {
    const result = await clearFlag({ data: input });
    await keepSession(result);
    if (!result.ok) {
      setResume(result.resume);
      setPasswordUpdated(true);
      setPassword("");
      setConfirm("");
      setError(PASSWORD_FLAG_CLEAR_FAILED);
      return;
    }
    setPassword("");
    setConfirm("");
    setResume(null);
    await finish(gate.data?.restaurantId ?? null);
  }

  async function clearAndContinue() {
    if (!resume) {
      setError(PASSWORD_FLAG_CLEAR_FAILED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await applyFinish({ resume });
    } catch {
      setError(PASSWORD_FLAG_CLEAR_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!passwordUpdated) {
      const issue = validateNewPassword(password, confirm);
      if (issue) {
        setFieldError(issue.field);
        setError(issue.message);
        const node = issue.field === "password" ? passwordRef.current : confirmRef.current;
        node?.focus();
        return;
      }
      setFieldError(null);
    }
    setBusy(true);
    try {
      await applyFinish(passwordUpdated ? { resume: resume ?? "" } : { password });
    } catch {
      setError(passwordUpdated ? PASSWORD_FLAG_CLEAR_FAILED : PASSWORD_UPDATE_FAILED);
      if (!passwordUpdated) passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setPassword("");
    setConfirm("");
    await signOut();
    await navigate({ to: "/restaurant/login", replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#2b1a0e] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-[#C89933]/25 bg-[#2b1a0e] p-6 shadow-[0_22px_60px_rgba(0,0,0,0.45)] sm:p-8">
        <NoruLogo size="md" className="mb-5" />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{FORCED_PASSWORD_TITLE}</h1>
        <p className="mb-6 mt-2 text-sm text-white/70">{FORCED_PASSWORD_COPY}</p>
        {loading || (session && gate.isLoading) ? (
          <p className="text-sm text-white/70">Checking access…</p>
        ) : noModule ? (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              Your password is updated. This account doesn't have a PMS module to open.
            </p>
            <a href="/restaurant/home" className="inline-block text-sm font-bold text-[#d9ad4f]">
              Go to property home
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {passwordUpdated ? null : (
              <>
                <AuthField
                  id="new-password"
                  label="New Password *"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  invalid={fieldError === "password"}
                  describedBy={error ? "set-password-error" : undefined}
                  inputRef={passwordRef}
                />
                <AuthField
                  id="confirm-password"
                  label="Confirm Password *"
                  type="password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  invalid={fieldError === "confirm"}
                  describedBy={error ? "set-password-error" : undefined}
                  inputRef={confirmRef}
                />
              </>
            )}
            {error ? (
              <div id="set-password-error">
                <AuthError>{error}</AuthError>
              </div>
            ) : null}
            {passwordUpdated ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearAndContinue()}
                className="h-12 w-full rounded-[10px] border border-white/20 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Finishing…" : "Try again"}
              </button>
            ) : (
              <AuthSubmit busy={busy}>{busy ? "Updating…" : "Update Password"}</AuthSubmit>
            )}
          </form>
        )}
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mt-4 w-full text-sm font-semibold text-[#d9ad4f]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
