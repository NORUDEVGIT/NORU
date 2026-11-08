import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import {
  AuthShell,
  AuthField,
  AuthSubmit,
  authLinkClass,
} from "@/core/components/auth/authshell";
import loginImage from "@/core/components/noru-site/assets/login.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Your Password — NORU" },
      { name: "description", content: "Request a password reset link for your NORU hotel account." },
      { property: "og:title", content: "Reset Your Password — NORU" },
      { property: "og:description", content: "We'll email you a link to set a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HotelForgotPassword,
});

const backLinkClass =
  "fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60";

function HotelForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await supabase.auth
      .resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/restaurant/reset-password`,
      })
      .catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  return (
    <>
      <Link to="/" className={backLinkClass}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to home
      </Link>

      <AuthShell
        image={loginImage}
        title="Forgot password"
        subtitle="We'll email a reset link if that hotel account exists."
        visualTitle="Run your whole hotel from one place."
        chips={["PMS", "RMS", "POS", "Back Office"]}
        footer={
          <>
            Remembered it?{" "}
            <Link to="/restaurant/login" className={authLinkClass}>
              Back to hotel log in
            </Link>
          </>
        }
      >
        {sent ? (
          <p className="text-sm text-white/80">
            If an account exists for that email, we've sent password reset instructions.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <AuthField
              id="email"
              label="Email address"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <AuthSubmit busy={busy}>{busy ? "Sending…" : "Send reset link"}</AuthSubmit>
          </form>
        )}
      </AuthShell>
    </>
  );
}
