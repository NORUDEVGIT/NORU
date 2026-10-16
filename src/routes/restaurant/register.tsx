import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuthShell, AuthField, AuthError, AuthSubmit, authLinkClass } from "@/core/components/auth/authshell";
import registerImage from "@/core/components/noru-site/assets/register.png";
import { supabase } from "@/integrations/supabase/client";
import { registerRestaurant } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/register")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Register Your Hotel — NORU" },
      { name: "description", content: "Create a hotel account and start managing your hotel on the NORU platform." },
      { property: "og:title", content: "Register Your Hotel — NORU" },
      { property: "og:description", content: "Create a hotel account and start managing your hotel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HotelRegister,
});

const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

const backLinkClass =
  "fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-black/60";

function HotelRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    hotelName: "",
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
    if (form.hotelName.trim().length < 2) return setError("Please enter your hotel name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Please enter a valid email address.");
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) return setError("Please enter a valid phone number.");
    if (!form.address.trim()) return setError("Please enter your hotel address.");
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
          restaurantName: form.hotelName, // backend field name unchanged
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
        setNotice("Check your email to verify your account, then log in to your hotel dashboard.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (signInError) {
        setNotice("Your hotel is ready. Please log in.");
        return;
      }
      void navigate({ to: "/restaurant/home", replace: true });
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
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
        image={registerImage}
        wide
        title="Register your hotel"
        subtitle="Create your owner account. Your hotel starts as pending approval and goes live once our team reviews it."
        visualTitle="Start managing your hotel with NORU."
        chips={["Pending review", "Live after approval", "Free to start"]}
        footer={
          <>
            Already registered?{" "}
            <Link to="/restaurant/login" className={authLinkClass}>
              Log in
            </Link>
          </>
        }
      >
        {notice ? (
          <div className="space-y-4 rounded-xl border border-l-4 border-[#C89933] bg-white/10 p-5 text-sm text-white">
            <p>{notice}</p>
            <Link
              to="/restaurant/login"
              className="flex h-[52px] w-full items-center justify-center rounded-[10px] bg-[#C89933] text-base font-bold text-[#1a1405] shadow-[0_4px_12px_rgba(201,152,47,0.35)] transition hover:brightness-105"
            >
              Go to hotel log in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField id="firstName" label="Owner first name" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
              <AuthField id="lastName" label="Owner last name" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
            </div>
            <AuthField id="hotelName" label="Hotel name" value={form.hotelName} onChange={set("hotelName")} autoComplete="organization" />
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField id="email" label="Email address" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
              <AuthField id="phone" label="Phone number (optional)" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
            </div>
            <AuthField id="address" label="Address" value={form.address} onChange={set("address")} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField id="city" label="City" value={form.city} onChange={set("city")} autoComplete="address-level2" />
              <AuthField id="postcode" label="Postcode (optional)" value={form.postcode} onChange={set("postcode")} autoComplete="postal-code" />
            </div>
            <AuthField id="country" label="Country" value={form.country} onChange={set("country")} autoComplete="country-name" />
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField id="password" label="Password" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
              <AuthField id="confirm" label="Confirm password" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
            </div>
            <p className="text-xs text-white/60">Use at least 8 characters, including a letter and a number.</p>

            {error ? <AuthError>{error}</AuthError> : null}

            <AuthSubmit busy={busy}>{busy ? "Creating your hotel…" : "Create hotel account"}</AuthSubmit>
          </form>
        )}
      </AuthShell>
    </>
  );
}