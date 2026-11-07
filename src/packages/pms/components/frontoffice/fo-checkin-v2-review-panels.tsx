/**
 * Step 5 presentational panels. Values come from getCheckInReadiness and the
 * selected unit. These components do not decide eligibility.
 */
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  KeyRound,
  ShieldAlert,
  Wallet,
} from "lucide-react";

import type { CheckInReadiness } from "@/packages/pms/lib/fo-check-in-readiness";
import {
  agreementStaffReference,
  formatAgreementTimestamp,
  identityReviewTone,
  keyRequirementState,
  roomReadinessLabel,
  satisfiedReadinessItems,
  waiverLabel,
  type ReviewDepositView,
} from "@/packages/pms/lib/fo-checkin-v2-review-model";
import { cn } from "@/shared/lib/utils";

export function completeCheckInHint(readiness: CheckInReadiness | null): string | null {
  if (!readiness || readiness.canCheckIn || readiness.blockers.length === 0) return null;
  const keyOnly =
    readiness.blockers.length === 1 && readiness.blockers[0]?.code === "KEY_REQUIRED";
  if (keyOnly) return "Record a key or authorize waiver to continue.";
  return readiness.blockers[0]?.message ?? null;
}

export function ReviewBanner({ readiness }: { readiness: CheckInReadiness }) {
  if (readiness.canCheckIn || readiness.blockers.length === 0) return null;
  const count = readiness.blockers.length;
  return (
    <div
      className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5"
      role="alert"
      data-testid="fo-ci-v2-review-banner"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {count} {count === 1 ? "item" : "items"} required before check-in
      </p>
      <ul className="mt-1 space-y-0.5" data-testid="fo-ci-v2-review-blockers">
        {readiness.blockers.map((blocker) => (
          <li
            key={blocker.code}
            className="text-xs text-red-900"
            data-testid={`fo-ci-v2-review-blocker-${blocker.code}`}
            data-blocker-code={blocker.code}
          >
            {blocker.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

type StripTone = "ok" | "warn" | "block";

function stripItemTone(tone: StripTone) {
  if (tone === "ok") return "text-[#436436]";
  if (tone === "warn") return "text-[#8B6914]";
  return "text-red-800";
}

function hasBlocker(readiness: CheckInReadiness, code: string) {
  return readiness.blockers.some((item) => item.code === code);
}

export function ReviewReadinessStrip({ readiness }: { readiness: CheckInReadiness }) {
  const identity = identityReviewTone(readiness);
  const registrationComplete = readiness.registration.complete;
  const registration = hasBlocker(readiness, "GUEST_FIELDS") ||
    hasBlocker(readiness, "IDENTITY_DOCUMENT") ||
    hasBlocker(readiness, "REGISTRATION_INCOMPLETE") ||
    hasBlocker(readiness, "GUEST_REQUIRED")
    ? { label: "Incomplete", tone: "block" as const }
    : registrationComplete && identity === "warning"
      ? { label: "Complete with warning", tone: "warn" as const }
      : registrationComplete
        ? { label: "Complete", tone: "ok" as const }
        : readiness.registration.waived
          ? { label: "Waived", tone: "warn" as const }
          : { label: "Incomplete", tone: "block" as const };
  const roomReady = readiness.room.ready === true && readiness.room.assigned;
  const room = hasBlocker(readiness, "ROOM_REQUIRED") ||
    hasBlocker(readiness, "ROOM_NOT_READY") ||
    hasBlocker(readiness, "ROOM_NOT_ELIGIBLE") ||
    hasBlocker(readiness, "ROOM_UNIT_REQUIRED")
    ? { label: roomReadinessLabel(readiness.room), tone: "block" as const }
    : roomReady
      ? { label: "Ready", tone: "ok" as const }
      : { label: roomReadinessLabel(readiness.room), tone: "warn" as const };
  const paymentSatisfied = Boolean(readiness.financial?.satisfied);
  const payment = hasBlocker(readiness, "DEPOSIT_REQUIRED")
    ? { label: "Required", tone: "block" as const }
    : paymentSatisfied
      ? { label: "Satisfied", tone: "ok" as const }
      : { label: "Outstanding", tone: "warn" as const };
  const agreement = hasBlocker(readiness, "AGREEMENT_REQUIRED") || hasBlocker(readiness, "SIGNATURE_REQUIRED")
    ? { label: "Required", tone: "block" as const }
    : readiness.agreement.signed
      ? { label: "Signed", tone: "ok" as const }
      : { label: "Unsigned", tone: "warn" as const };
  const keyState = keyRequirementState(readiness.key);
  const key = hasBlocker(readiness, "KEY_REQUIRED")
    ? { label: "Required", tone: "block" as const }
    : { label: keyState, tone: keyState === "Required" ? ("warn" as const) : ("ok" as const) };
  const items = [
    { id: "room", label: "Room", status: room, Icon: BedDouble },
    { id: "registration", label: "Registration", status: registration, Icon: ClipboardCheck },
    { id: "payment", label: "Payment", status: payment, Icon: Wallet },
    { id: "agreement", label: "Agreement", status: agreement, Icon: FileSignature },
    { id: "key", label: "Key", status: key, Icon: KeyRound },
  ];
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      data-testid="fo-ci-v2-review-readiness-strip"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-center gap-2 rounded-md border border-[#E8DFD0] bg-white px-2.5 py-1.5"
        >
          <item.Icon className={cn("size-3.5 shrink-0", stripItemTone(item.status.tone))} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
              {item.label}
            </p>
            <p className={cn("truncate text-xs font-semibold", stripItemTone(item.status.tone))}>
              {item.status.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewWarnings({ readiness }: { readiness: CheckInReadiness }) {
  if (readiness.warnings.length === 0) return null;
  return (
    <section
      className="rounded-lg border border-[#C89933]/40 bg-[#C89933]/10 p-2.5"
      data-testid="fo-ci-v2-review-warnings"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8B6914]">Warnings</h3>
      <ul className="mt-1.5 space-y-1">
        {readiness.warnings.map((warning) => (
          <li
            key={warning.code}
            className="flex gap-2 text-xs text-[#251605]"
            data-testid={`fo-ci-v2-review-warning-${warning.code}`}
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#8B6914]" aria-hidden="true" />
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReadinessCard({
  readiness,
  settled,
}: {
  readiness: CheckInReadiness;
  settled?: boolean;
}) {
  const items = satisfiedReadinessItems(readiness);
  const key = keyRequirementState(readiness.key);
  return (
    <section
      className="rounded-lg border border-[#DDD4C5] bg-white p-3"
      data-testid="fo-ci-v2-review-readiness"
      aria-labelledby="fo-ci-v2-readiness-heading"
    >
      <h3 id="fo-ci-v2-readiness-heading" className="text-sm font-semibold text-[#251605]">
        Check-In Readiness
      </h3>
      {readiness.canCheckIn ? (
        <div className="mt-2" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#436436]">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            All requirements completed
          </p>
          <p className="mt-1 text-xs text-[#6B5E4E]">You can now complete the guest check-in.</p>
        </div>
      ) : settled ? (
        <p className="mt-2 text-sm font-medium text-[#436436]" role="status">
          This room is checked in.
        </p>
      ) : (
        <p className="mt-2 text-xs text-[#6B5E4E]">
          Room readiness: {roomReadinessLabel(readiness.room)}
        </p>
      )}
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1.5" data-testid="fo-ci-v2-review-readiness-items">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm text-[#251605]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#436436]" aria-hidden="true" />
              <span>
                <span className="sr-only">Completed. </span>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-[#251605]" data-testid="fo-ci-v2-review-key">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
          Key
        </span>
        <span className="mt-0.5 block font-medium">{key}</span>
      </p>
      {readiness.blockers.length > 0 && !settled ? (
        <div className="mt-4" role="alert" data-testid="fo-ci-v2-review-blockers">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
            Required before Check-In
          </p>
          <ul className="mt-2 space-y-2">
            {readiness.blockers.map((blocker) => (
              <li
                key={blocker.code}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
                data-testid={`fo-ci-v2-review-blocker-${blocker.code}`}
                data-blocker-code={blocker.code}
              >
                {blocker.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <div className="mt-4" role="status" data-testid="fo-ci-v2-review-warnings">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8B6914]">Warnings</p>
          <ul className="mt-2 space-y-2">
            {readiness.warnings.map((warning) => (
              <li
                key={warning.code}
                className="flex gap-2 rounded-lg border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2 text-sm text-[#251605]"
                data-testid={`fo-ci-v2-review-warning-${warning.code}`}
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-[#8B6914]"
                  aria-hidden="true"
                />
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {readiness.overrides.length > 0 ? (
        <div className="mt-4" data-testid="fo-ci-v2-review-waivers">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Authorized Waivers
          </p>
          <ul className="mt-2 space-y-2">
            {readiness.overrides.map((waiver) => (
              <li
                key={waiver.requirement}
                className="rounded-lg border border-[#E8DFD0] bg-[#FBF7F1] px-3 py-2 text-sm text-[#251605]"
                data-testid={`fo-ci-v2-review-waiver-${waiver.requirement}`}
              >
                <p className="font-semibold">
                  {waiverLabel(waiver.requirement)}
                  <span className="ml-2 text-xs font-medium uppercase text-[#8B6914]">Waived</span>
                </p>
                <p className="text-xs text-[#6B5E4E]">
                  {waiver.reason?.trim() || "No reason recorded"}
                </p>
                <p className="text-xs text-[#6B5E4E]">
                  Authorized by {agreementStaffReference(waiver.actor)}
                  {waiver.at ? ` · ${formatAgreementTimestamp(waiver.at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function DepositFacts({ deposit }: { deposit: ReviewDepositView }) {
  return (
    <dl className="mt-1 grid gap-2 sm:grid-cols-2" data-testid="fo-ci-v2-review-deposit">
      <DepositFact label="Deposit Required" value={deposit.required} />
      {deposit.received ? (
        <DepositFact
          label="Deposit Received"
          value={deposit.received}
          testId="fo-ci-v2-review-deposit-received"
        />
      ) : (
        <DepositFact label="Deposit" value="Waived" testId="fo-ci-v2-review-deposit-received" />
      )}
      {deposit.outstanding ? <DepositFact label="Outstanding" value={deposit.outstanding} /> : null}
      <DepositFact
        label="Deposit Status"
        value={deposit.status}
        testId="fo-ci-v2-review-deposit-status"
      />
      <DepositFact label="Guarantee Method" value={deposit.guarantee} />
      {deposit.waived ? (
        <DepositFact label="Deposit waiver" value={deposit.waiverReason || "Waived"} />
      ) : null}
    </dl>
  );
}

function DepositFact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{label}</dt>
      <dd
        className={cn("text-sm font-medium text-[#251605]")}
        {...(testId ? { "data-testid": testId } : {})}
      >
        {value}
      </dd>
    </div>
  );
}

export function IdentityTone({ readiness }: { readiness: CheckInReadiness }) {
  const tone = identityReviewTone(readiness);
  const copy =
    tone === "warning"
      ? "Identity document not verified"
      : tone === "blocker"
        ? "Identification is blocking check-in"
        : "Identification requirements satisfied";
  return (
    <p
      className={cn(
        "text-sm font-medium",
        tone === "satisfied" && "text-[#436436]",
        tone === "warning" && "text-[#8B6914]",
        tone === "blocker" && "text-red-800",
      )}
      data-testid="fo-ci-v2-review-identity-tone"
    >
      {copy}
    </p>
  );
}
