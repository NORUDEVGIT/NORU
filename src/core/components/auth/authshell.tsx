import { useState, type ReactNode } from "react";
import { NoruLogo } from "@/core/components/noru-logo";
import { cn } from "@/shared/lib/utils";

/**
 * Shared sign-in / sign-up layout that mirrors the Noru site's auth screens:
 * a brand panel (photo, gold accent, feature chips) next to the form card.
 * Page background and card are both dark brown.
 */
export function AuthShell({
  title,
  subtitle,
  visualTitle,
  image,
  chips = [],
  wide = false,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  visualTitle: string;
  /** Photo shown in the brand panel (import it from src/assets). */
  image: string;
  chips?: string[];
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#2b1a0e] px-3 py-8 sm:px-4 sm:py-12">
      <div
        className={cn(
          "grid w-full overflow-hidden rounded-2xl border border-[#C89933]/25 bg-[#2b1a0e] shadow-[0_22px_60px_rgba(0,0,0,0.45)] md:grid-cols-[1fr_1.05fr] md:rounded-[22px]",
          wide ? "max-w-5xl" : "max-w-4xl",
        )}
      >
        <aside className="relative flex min-h-[130px] items-end bg-[#2b1a0e] text-white md:min-h-full">
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2b1a0e]/90 via-[#2b1a0e]/40 to-[#2b1a0e]/10" />
          <div className="relative p-5 md:p-8">
            <span className="mb-3.5 hidden h-1 w-11 rounded bg-[#C89933] md:block" />
            <p className="text-lg font-extrabold leading-tight md:text-2xl">{visualTitle}</p>
            {chips.length > 0 ? (
              <ul className="mt-3 hidden flex-wrap gap-2 md:flex">
                {chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-[#d9ad4f]/70 bg-[#2b1a0e]/50 px-3 py-1 text-xs font-bold tracking-wide text-[#d9ad4f]"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>

        <section className="self-center bg-[#2b1a0e] p-6 sm:p-9 md:p-11">
          <NoruLogo size="md" className="mb-5" />
          <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mb-6 mt-1.5 text-white/70">{subtitle}</p> : <div className="mb-6" />}
          {children}
          {footer ? (
            <div className="mt-6 border-t border-white/15 pt-4 text-center text-sm text-white/70">{footer}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** Text input with a gold focus ring; password fields get a Show/Hide toggle. */
export function AuthField({
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
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-white">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          value={value}
          autoComplete={autoComplete ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-12 w-full rounded-[10px] border border-white/20 bg-[#3a2413] px-3.5 text-base text-white outline-none transition placeholder:text-white/40 hover:border-[#C89933] focus:border-[#C89933] focus:ring-4 focus:ring-[#C89933]/25",
            isPassword && "pr-[72px]",
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1.5 text-sm font-semibold text-[#d9ad4f] hover:bg-white/10"
          >
            {show ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border-l-4 border-red-400 bg-red-500/15 px-3 py-2.5 text-sm font-medium text-red-200"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white"
      >
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Gold call-to-action used for the main submit button. */
export function AuthSubmit({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="h-[52px] w-full rounded-[10px] bg-[#C89933] px-6 text-base font-bold text-[#1a1405] shadow-[0_4px_12px_rgba(201,152,47,0.35)] transition hover:shadow-[0_8px_20px_rgba(201,152,47,0.45)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C89933]/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Class names for inline links in the auth screens. */
export const authLinkClass =
  "border-b-2 border-transparent font-bold text-[#d9ad4f] transition-colors hover:border-[#C89933]";