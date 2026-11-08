import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import {
  PASSWORD_STATUS_UNCONFIRMED,
  SET_PASSWORD_PATH,
  passwordChangeRequired,
  passwordColumnUnavailable,
} from "@/core/lib/password-lifecycle";

export const Route = createFileRoute("/restaurant/login")({
  ssr: false,

  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search.redirect === "string" ? search.redirect : "";

    const safe = /^\/[A-Za-z0-9/_-]*$/.test(raw) && raw !== "//" ? raw : "";

    return safe ? { redirect: safe } : {};
  },

  head: () => ({
    meta: [
      { title: "Hotel Log In — NORU" },
      {
        name: "description",
        content: "Hotel owners and managers can sign in to manage their hotel on NORU.",
      },
      { property: "og:title", content: "Hotel Log In — NORU" },
      {
        property: "og:description",
        content: "Sign in to your hotel portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),

  component: HotelLogin,
});

const backLinkClass =
  "fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60";

function HotelLogin() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setError(null);

    const normalizedEmail = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setBusy(true);

    try {
      // STEP 1: Authenticate the user.
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError || !data.user) {
        setError(
          /confirm/i.test(signInError?.message ?? "")
            ? "Please verify your email address before logging in."
            : "That email or password isn't right.",
        );
        return;
      }

      // STEP 2: Verify the user has an active hotel membership.
      const { data: membership, error: membershipError } = await supabase
        .from("restaurant_users")
        .select("restaurant_id")
        .eq("user_id", data.user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        await supabase.auth.signOut();

        setError(
          "This account isn't linked to an active hotel. Please contact your hotel administrator.",
        );
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError && !passwordColumnUnavailable(profileError.message)) {
        setError(PASSWORD_STATUS_UNCONFIRMED);
        return;
      }
      if (passwordChangeRequired(profile)) {
        await navigate({ to: SET_PASSWORD_PATH, replace: true });
        return;
      }

      // STEP 3: Navigate only after successful login and validation.
      await navigate({
        to: redirectTo ?? "/restaurant/pms/dashboard",
        replace: true,
      });
    } catch (err) {
      console.error("Hotel login failed:", err);
      setError("Something went wrong. Please try again.");
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
        title="Hotel log in"
        subtitle="Manage your hotel on the NORU platform."
        visualTitle="Run your whole hotel from one place."
        chips={["PMS", "RMS", "POS", "Back Office"]}
        footer={
          <>
            New to NORU?{" "}
            <Link to="/restaurant/register" className={authLinkClass}>
              Register your hotel
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField
            id="email"
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />

          <AuthField
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <div className="-mt-1.5 flex justify-end text-sm">
            <Link to="/restaurant/forgot-password" className={authLinkClass}>
              Forgot password?
            </Link>
          </div>

          {error ? <AuthError>{error}</AuthError> : null}

          <AuthSubmit busy={busy}>{busy ? "Logging in..." : "Log in"}</AuthSubmit>
        </form>
      </AuthShell>
    </>
  );
}
