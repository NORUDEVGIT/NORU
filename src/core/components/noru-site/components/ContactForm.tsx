import { useEffect, useState, type FormEvent } from "react";
import { PROPERTY_TYPES } from "../data/content";
import { DEMO_EVENT } from "../lib/router";

/** Contact and demo request form. TODO: send the submission to the backend (for example a `leads` table). */
export function ContactForm() {
  const [sent, setSent] = useState(false);

  /* "Request Demo" resets the form even when the contact page is already open. */
  useEffect(() => {
    const reset = (): void => setSent(false);
    window.addEventListener(DEMO_EVENT, reset);
    return () => window.removeEventListener(DEMO_EVENT, reset);
  }, []);

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div>
      {sent ? (
        <div className="ok" role="status">
          Thank you. Your request has been sent to the Noru Digital Solutions team.
        </div>
      ) : (
        <form onSubmit={onSubmit}>
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
            <select className="pt" name="propertyType">
              {PROPERTY_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea rows={4} placeholder="Tell us about your property and what you need" name="message" />
          </label>
          <button className="btn" type="submit">
            Submit
          </button>
        </form>
      )}
    </div>
  );
}
