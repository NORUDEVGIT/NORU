import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Your Password — The Garden Table" },
      { name: "description", content: "Request a password reset link for your Garden Table customer account." },
      { property: "og:title", content: "Reset Your Password — The Garden Table" },
      { property: "og:description", content: "We'll email you a link to set a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    // Always show the same confirmation, so this can't be used to discover
    // which email addresses have accounts.
    await supabase.auth
      .resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      .catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Forgot password</h1>
        {sent ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>If an account exists for that email, we've sent password reset instructions.</p>
            <Button asChild size="lg" className="mt-4 h-12 w-full rounded-full">
              <Link to="/login">Back to log in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl text-base" />
            </div>
            <Button type="submit" size="lg" disabled={busy} className="h-14 w-full rounded-full text-base">
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
