import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LEAD_PROPERTY_TYPES, type LeadSource } from "@/core/lib/leads";
import { submitLead } from "@/core/lib/leads.functions";
import { DEMO_EVENT, isDemoRequestNavigation } from "../lib/router";

/** Contact and demo request form. The thank-you is shown only after the lead insert succeeds. */
export function ContactForm() {
  const sendLead = useServerFn(submitLead);
  const [sent, setSent] = useState(false);
  const [source, setSource] = useState<LeadSource>("contact");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const onDemo = (): void => {
      setSent(false);
      setError(null);
      setSource("request_demo");
    };
    const onHash = (): void => {
      if (!window.location.hash.replace(/^#/, "").startsWith("resources/contact")) return;
      setSource(isDemoRequestNavigation() ? "request_demo" : "contact");
    };
    window.addEventListener(DEMO_EVENT, onDemo);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(DEMO_EVENT, onDemo);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);
    try {
      await sendLead({
        data: {
          source,
          name: String(form.get("name") ?? ""),
          company: String(form.get("company") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          propertyType: String(form.get("propertyType") ?? LEAD_PROPERTY_TYPES[0]),
          message: String(form.get("message") ?? ""),
        },
      });
      setSent(true);
    } catch (submitError) {
      setSent(false);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't send that request. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {sent ? (
        <div className="ok" role="status">
          Thank you. Your request has been sent to the Noru Digital Solutions team.
        </div>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)}>
          <label>
            Name{" "}
            <span className="rq" aria-hidden="true">
              *
            </span>
            <input required placeholder="Your name" name="name" />
          </label>
          <label>
            Company / Property Name{" "}
            <span className="rq" aria-hidden="true">
              *
            </span>
            <input required placeholder="e.g. Sunrise Hotel" name="company" />
          </label>
          <label>
            Email{" "}
            <span className="rq" aria-hidden="true">
              *
            </span>
            <input type="email" required placeholder="name@example.com" name="email" />
          </label>
          <label>
            Phone Number
            <input type="tel" placeholder="+251 9XX XXX XXX" name="phone" />
          </label>
          <label>
            Property Type
            <select className="pt" name="propertyType" defaultValue={LEAD_PROPERTY_TYPES[0]}>
              {LEAD_PROPERTY_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea
              rows={4}
              placeholder="Tell us about your property and what you need"
              name="message"
            />
          </label>
          {error ? (
            <p className="mut" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="submit" disabled={sending}>
            {sending ? "Sending…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
