import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { registerRestaurant } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Register Your Restaurant — Garden Table Platform" },
      { name: "description", content: "Create a restaurant account and start taking table orders on the Garden Table platform." },
      { property: "og:title", content: "Register Your Restaurant — Garden Table Platform" },
      { property: "og:description", content: "Create a restaurant account and start taking table orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RestaurantRegister,
});

const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

function RestaurantRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    restaurantName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postcode: "",
    country: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Please enter the owner's first and last name.");
    if (form.restaurantName.trim().length < 2) return setError("Please enter your restaurant name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Please enter a valid email address.");
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) return setError("Please enter a valid phone number.");
    if (!form.address.trim()) return setError("Please enter your restaurant address.");
    if (!form.city.trim()) return setError("Please enter your city.");
    if (!form.country.trim()) return setError("Please enter your country.");
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      return setError("Use at least 8 characters, including a letter and a number.");
    }
    if (form.password !== form.confirm) return setError("Those passwords don't match.");

    setBusy(true);
    try {
      const result = await registerRestaurant({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          restaurantName: form.restaurantName,
          email: form.email,
          phone: form.phone || null,
          address: form.address,
          city: form.city,
          postcode: form.postcode || null,
          country: form.country,
          password: form.password,
          redirectTo: `${window.location.origin}/restaurant/login`,
        },
      });

      if (!result.ok) return setError(result.message);

      if (result.needsVerification) {
        setNotice("Check your email to verify your account, then log in to your restaurant dashboard.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (signInError) {
        setNotice("Your restaurant is ready. Please log in.");
        return;
      }
      void navigate({ to: "/restaurant/dashboard", replace: true });
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="font-display text-3xl">Register your restaurant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your owner account. Your restaurant starts as pending approval and goes live once our team reviews it.
        </p>

        {notice ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>{notice}</p>
            <Button asChild size="lg" className="mt-4 h-12 w-full rounded-full">
              <Link to="/restaurant/login">Go to restaurant log in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="firstName" label="Owner first name" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
              <Field id="lastName" label="Owner last name" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
            </div>
            <Field id="restaurantName" label="Restaurant name" value={form.restaurantName} onChange={set("restaurantName")} autoComplete="organization" />
            <Field id="email" label="Email address" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
            <Field id="phone" label="Phone number (optional)" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
            <Field id="address" label="Address" value={form.address} onChange={set("address")} autoComplete="street-address" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="city" label="City" value={form.city} onChange={set("city")} autoComplete="address-level2" />
              <Field id="postcode" label="Postcode (optional)" value={form.postcode} onChange={set("postcode")} autoComplete="postal-code" />
            </div>
            <Field id="country" label="Country" value={form.country} onChange={set("country")} autoComplete="country-name" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="password" label="Password" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
              <Field id="confirm" label="Confirm password" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
            </div>

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
            ) : null}

            <Button type="submit" size="lg" disabled={busy} className="h-14 w-full rounded-full text-base">
              {busy ? "Creating your restaurant…" : "Create restaurant account"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link to="/restaurant/login" className="font-semibold text-foreground underline underline-offset-4">Log in</Link>
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