import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import {
  AuthShell,
  AuthField,
  AuthError,
  AuthSubmit,
  authLinkClass,
} from "@/core/components/auth/authshell";
import loginImage from "@/core/components/noru-site/assets/login.png";
import { supabase } from "@/integrations/supabase/client";
import { clearMyPasswordChange } from "@/core/lib/password-lifecycle.functions";
import {
  PASSWORD_FLAG_CLEAR_FAILED,
  PASSWORD_UPDATE_FAILED,
  validateNewPassword,
} from "@/core/lib/password-lifecycle";

export const Route = createFileRoute("/restaurant/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a New Password — NORU" },
      { name: "description", content: "Choose a new password for your NORU hotel account." },
      { property: "og:title", content: "Set a New Password — NORU" },
      { property: "og:description", content: "Finish resetting your NORU password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HotelResetPassword,
});

const backLinkClass =
  "fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60";

function HotelResetPassword() {
  const navigate = useNavigate();
  const clearFlag = useServerFn(clearMyPasswordChange);
  const [ready, setReady] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [resume, setResume] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!passwordUpdated) {
      const issue = validateNewPassword(password, confirm);
      if (issue) {
        setError(issue.message);
        return;
      }
    }
    setBusy(true);
    try {
      const result = await clearFlag({ data: passwordUpdated ? { resume: resume ?? "" } : { password } });
      try {
        if (result.accessToken && result.refreshToken) {
          await supabase.auth.setSession({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
          });
        } else {
          await supabase.auth.refreshSession();
        }
      } catch {
        // The recovery session remains usable when the provider keeps the current token.
      }
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
      setDone(true);
      setTimeout(() => void navigate({ to: "/restaurant/login", replace: true }), 1200);
    } catch {
      setError(passwordUpdated ? PASSWORD_FLAG_CLEAR_FAILED : PASSWORD_UPDATE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/" className={backLinkClass}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to home
      </Link>

      <AuthShell
        image={loginImage}
        title="Set a new password"
        subtitle="Finish resetting your hotel account password."
        visualTitle="Run your whole hotel from one place."
        chips={["PMS", "RMS", "POS", "Back Office"]}
        footer={
          <>
            <Link to="/restaurant/login" className={authLinkClass}>
              Back to hotel log in
            </Link>
          </>
        }
      >
        {done ? (
          <p className="text-sm text-white/80">Password updated. Taking you to hotel log in…</p>
        ) : !ready ? (
          <div className="space-y-4">
            <p className="text-sm text-white/80">Open the reset link from your email on this device to continue.</p>
            <Link to="/restaurant/forgot-password" className={authLinkClass}>
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <AuthField
              id="password"
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <AuthField
              id="confirm"
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            {error ? <AuthError>{error}</AuthError> : null}
            <AuthSubmit busy={busy}>{busy ? "Saving…" : "Update password"}</AuthSubmit>
          </form>
        )}
      </AuthShell>
    </>
  );
}
