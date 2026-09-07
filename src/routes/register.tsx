import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { registerCustomer } from "@/lib/customer.functions";

export const Route = createFileRoute("/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create Your Account — NORU" },
      { name: "description", content: "Create a free account to order faster and keep your order history at NORU." },
      { property: "og:title", content: "Create Your Account — NORU" },
      { property: "og:description", content: "Order faster and track every order with a NORU account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError("Use at least 8 characters, including a letter and a number.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const result = await registerCustomer({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || null,
          password: form.password,
          redirectTo: `${window.location.origin}/login`,
        },
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (result.needsVerification) {
        setNotice("Check your email to verify your account, then log in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (signInError) {
        setNotice("Your account is ready. Please log in.");
        return;
      }
      void navigate({ to: "/account", replace: true });
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One account for every restaurant on the platform.
        </p>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>{notice}</p>
            <Button asChild size="lg" className="mt-4 h-12 w-full rounded-full">
              <Link to="/login">Go to log in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field id="firstName" label="First name" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
              <Field id="lastName" label="Last name" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
            </div>
            <Field id="email" label="Email address" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
            <Field id="phone" label="Phone number (optional)" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
            <Field id="password" label="Password" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
            <Field id="confirm" label="Confirm password" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={busy} className="h-14 w-full rounded-full text-base">
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-xl text-base"
      />
    </div>
  );
}
