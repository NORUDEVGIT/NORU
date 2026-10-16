import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuthShell, AuthField, AuthError, AuthSubmit, authLinkClass } from "@/core/components/auth/authshell";
import loginImage from "@/core/components/noru-site/assets/login.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search['redirect'] === "string" ? (search['redirect'] as string) : "";
    // Only same-origin app paths may be used as a post-login destination.
    const safe = /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : "";
    return safe ? { redirect: safe } : {};
  },
  head: () => ({
    meta: [
      { title: "Hotel Log In — NORU" },
      { name: "description", content: "Hotel owners and managers: sign in to manage your hotel on the NORU platform." },
      { property: "og:title", content: "Hotel Log In — NORU" },
      { property: "og:description", content: "Sign in to your hotel portal." },
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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError || !data.user) {
      setBusy(false);
      setError(
        /confirm/i.test(signInError?.message ?? "")
          ? "Please verify your email address before logging in."
          : "That email or password isn't right.",
      );
      return;
    }

    // Membership decides where this account belongs; customers stay out.
    const { data: membership } = await supabase
      .from("restaurant_users")
      .select("restaurant_id")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    setBusy(false);
    if (!membership) {
      await supabase.auth.signOut();
      setError("This account isn't linked to a hotel. Customers can log in from the main site.");
      return;
    }
    void navigate({ to: redirectTo ?? "/restaurant/home", replace: true });
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
          <AuthField id="email" label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="-mt-1.5 flex justify-end text-sm">
            <Link to="/forgot-password" className={authLinkClass}>
              Forgot password?
            </Link>
          </div>
          {error ? <AuthError>{error}</AuthError> : null}
          <AuthSubmit busy={busy}>{busy ? "Logging in…" : "Log in"}</AuthSubmit>
        </form>
      </AuthShell>
    </>
  );
}