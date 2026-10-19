/**
 * Step 5 presentational panels. Values come from getCheckInReadiness and the
 * selected unit. These components do not decide eligibility.
 */
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

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

export function ReviewBanner({ readiness }: { readiness: CheckInReadiness }) {
  if (readiness.canCheckIn) {
    return (
      <div
        className="rounded-xl border border-[#436436]/30 bg-[#436436]/10 px-4 py-4"
        role="status"
        data-testid="fo-ci-v2-review-banner"
      >
        <p className="flex items-center gap-2 text-base font-bold text-[#436436]">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          All information completed
        </p>
        <p className="mt-1 text-sm text-[#251605]" id="fo-ci-v2-complete-reason">
          Please review the details below and complete the guest check-in.
        </p>
      </div>
    );
  }
  if (readiness.blockers.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-4"
      role="alert"
      data-testid="fo-ci-v2-review-banner"
    >
      <p className="flex items-center gap-2 text-base font-bold text-red-800">
        <ShieldAlert className="size-5" aria-hidden="true" />
        Check-In cannot be completed
      </p>
      <p className="mt-1 text-sm text-[#251605]" id="fo-ci-v2-complete-reason">
        Resolve the required items below before completing check-in.
      </p>
    </div>
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
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
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
    <dl className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="fo-ci-v2-review-deposit">
      <DepositFact label="Folio scope" value={deposit.scope} />
      <DepositFact label="Deposit required" value={deposit.required} />
      {deposit.received ? (
        <DepositFact
          label="Deposit received"
          value={deposit.received}
          testId="fo-ci-v2-review-deposit-received"
        />
      ) : (
        <DepositFact label="Deposit" value="Waived" testId="fo-ci-v2-review-deposit-received" />
      )}
      {deposit.outstanding ? <DepositFact label="Outstanding" value={deposit.outstanding} /> : null}
      <DepositFact
        label="Deposit status"
        value={deposit.status}
        testId="fo-ci-v2-review-deposit-status"
      />
      <DepositFact label="Guarantee method" value={deposit.guarantee} />
      <DepositFact label="Guarantee evaluation" value={deposit.guaranteeNote} />
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
      ? "Warning: identity document is unverified"
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
