import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { ProfileMenu } from "@/core/components/app-top-header";
import { NoruLogo } from "@/core/components/noru-logo";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { CARD1_HASH } from "@/packages/pms/lib/pms-property-setup-card1";
import { formatDateInZone } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";

type ReviewStepState = "complete" | "current" | "upcoming";

const REVIEW_STEPS = [
  "Registration received",
  "NORU review",
  "Property approved",
  "Complete hotel setup",
  "Ready to operate",
] as const;

/** Visual only. Index of the current step. Nothing is written from here. */
const CURRENT_STEP = {
  review: 1,
  setup: 3,
} as const;

type OnboardingPhase = keyof typeof CURRENT_STEP;

function stepState(index: number, current: number): ReviewStepState {
  if (index < current) return "complete";
  if (index === current) return "current";
  return "upcoming";
}

export function PendingPortalHeader({
  propertyName,
  email,
  role,
  statusLabel = "Pending approval",
  settingsHref,
  onSignOut,
}: {
  propertyName: string;
  email: string;
  role: string;
  statusLabel?: string;
  /** Approved properties only. Pending review never receives this. */
  settingsHref?: string;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 text-white" style={{ backgroundColor: "#2a1810" }}>
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <NoruLogo size="sm" wordmarkClassName="text-white" />
          <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
          <p className="truncate text-sm font-medium text-white/95">{propertyName}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="rounded-full border border-[#c9a24a] px-2 py-1 text-[10px] font-semibold tracking-wide text-[#e8cf8f] sm:px-2.5 sm:text-[11px]">
            {statusLabel}
          </span>
          <span className="hidden max-w-[180px] truncate text-right text-xs md:block" title={email || undefined}>
            <span className="block truncate font-medium text-white">{email || "Signed in"}</span>
            {role ? <span className="block capitalize text-white/60">{role}</span> : null}
          </span>
          <ProfileMenu email={email} role={role} settingsHref={settingsHref} onSignOut={onSignOut} />
        </div>
      </div>
    </header>
  );
}

function OnboardingProgress({ current }: { current: number }) {
  return (
    <section
      aria-label="Onboarding progress"
      className="rounded-2xl border border-[#E7E0D4] bg-white px-4 py-5 shadow-sm sm:px-6"
    >
      <ol className="flex flex-col gap-4 md:flex-row md:items-start md:gap-0">
        {REVIEW_STEPS.map((label, index) => {
          const state = stepState(index, current);
          const last = index === REVIEW_STEPS.length - 1;
          const leftComplete = index > 0 && stepState(index - 1, current) === "complete";
          const rightComplete = state === "complete";
          return (
            <li
              key={label}
              className="flex min-w-0 flex-1 items-center gap-3 md:flex-col md:items-stretch md:gap-2 md:text-center"
            >
              <div className="flex items-center md:w-full">
                <span
                  className={cn(
                    "hidden h-px flex-1 md:block",
                    index === 0 ? "bg-transparent" : leftComplete ? "bg-emerald-600/50" : "bg-[#E7E0D4]",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    state === "complete" && "border-emerald-600/30 bg-emerald-50 text-emerald-700",
                    state === "current" && "border-[#C89933] bg-[#F4E9D0] text-[#8A641A]",
                    state === "upcoming" && "border-[#E7E0D4] bg-[#F7F4EE] text-[#A39888]",
                  )}
                  aria-hidden
                >
                  {state === "complete" ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "hidden h-px flex-1 md:block",
                    last ? "bg-transparent" : rightComplete ? "bg-emerald-600/50" : "bg-[#E7E0D4]",
                  )}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 md:px-1">
                <p
                  className={cn(
                    "text-sm md:text-xs",
                    state === "current" && "font-semibold text-[#8A641A]",
                    state === "upcoming" && "text-[#A39888]",
                    state === "complete" && "text-[#251605]",
                  )}
                >
                  {label}
                </p>
                <p className="text-[11px] text-[#A39888]">
                  {state === "complete" ? "Complete" : state === "current" ? "Current" : "Upcoming"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function PendingApprovalDashboard({
  membership,
  phase = "review",
  packagePending = false,
}: {
  membership: RestaurantMembership;
  phase?: OnboardingPhase;
  /** Shown only after approval, when no package is assigned yet. */
  packagePending?: boolean;
}) {
  const property = membership.restaurant;
  const setup = phase === "setup";
  const location = [property.city, property.country].filter(Boolean).join(", ") || property.address;
  const submitted = property.createdAt
    ? formatDateInZone(property.createdAt, property.timezone)
    : null;
  const approvedOn = property.approvedAt
    ? formatDateInZone(property.approvedAt, property.timezone)
    : null;
  const details: [string, string][] = setup
    ? [
        ["Property name", property.name],
        ["Location", location || "—"],
        ["Status", "Approved"],
        ["Contact email", property.email || "—"],
        ...(approvedOn ? [["Approval date", approvedOn] as [string, string]] : []),
      ]
    : [
        ["Property name", property.name],
        ["Location", location || "—"],
        ["Contact email", property.email || "—"],
        ...(property.phone?.trim()
          ? [["Contact phone", property.phone.trim()] as [string, string]]
          : []),
        ["Submitted", submitted || "—"],
        ["Status", "Pending approval"],
      ];
  const nextSteps = setup
    ? ["Complete Property & Business", "Configure Rooms & Inventory", "Finish the remaining hotel setup"]
    : [
        "NORU reviews your application",
        "We contact you if any information is missing",
        "Once approved, you continue your hotel setup",
      ];

  return (
    <div className="bg-[#F7F4EE] px-4 py-8 text-[#251605] sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
        <section className="rounded-2xl border border-[#E7E0D4] bg-white px-6 py-7 shadow-sm sm:px-8">
          <span className="inline-flex rounded-full bg-[#F4E9D0] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#8A641A]">
            {setup ? "Approved" : "Pending approval"}
          </span>
          <h1 className="mt-4 font-display text-3xl leading-tight">
            {setup ? "Your property is approved" : "Application under review"}
          </h1>
          {setup ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#5C5144]">
              {property.name} has been approved by NORU. The next step is to complete your hotel
              setup so your property can be prepared for operations.
            </p>
          ) : (
            <div className="mt-4 max-w-2xl space-y-3 text-sm leading-relaxed text-[#5C5144]">
              <p>Thank you for registering {property.name} with NORU.</p>
              <p>
                Our onboarding team is reviewing the information you submitted. If we need anything
                else, a member of our team will contact you using the details provided during
                registration.
              </p>
              <p>Once your property is approved, you'll be able to continue your hotel setup in NORU.</p>
            </div>
          )}
          {setup ? (
            <Link
              to="/restaurant/settings"
              hash={CARD1_HASH}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#C89933] px-5 text-sm font-semibold text-[#2a1810] transition-colors hover:bg-[#b7892c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2"
            >
              Continue hotel setup
            </Link>
          ) : null}
        </section>

        <OnboardingProgress current={CURRENT_STEP[phase]} />

        <section
          aria-label={setup ? "Setup details" : "Application details"}
          className="rounded-2xl border border-[#E7E0D4] bg-white px-6 py-5 shadow-sm"
        >
          <h2 className="font-display text-lg">{setup ? "Setup details" : "Application details"}</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-[#756A5B]">{label}</dt>
                <dd className="mt-0.5 truncate text-sm text-[#251605]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-[#E7E0D4] bg-white px-6 py-5 shadow-sm">
          <h2 className="font-display text-lg">What happens next?</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {nextSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-[#5C5144]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#8A641A]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {setup ? (
          packagePending ? (
            <section className="px-1 pb-2">
              <h2 className="text-sm font-semibold">NORU package</h2>
              <p className="mt-1 text-sm font-medium text-[#8A641A]">Package assignment pending</p>
              <p className="mt-1 text-sm text-[#756A5B]">
                Your package will be activated separately by NORU.
              </p>
            </section>
          ) : null
        ) : (
          <section className="px-1 pb-2">
            <h2 className="text-sm font-semibold">Need to update something?</h2>
            <p className="mt-1 text-sm text-[#756A5B]">
              If important application information has changed while we are reviewing your property,
              contact the NORU onboarding team.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
