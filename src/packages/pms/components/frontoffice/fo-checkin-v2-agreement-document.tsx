/**
 * Step 4 agreement document. Shared by the panel, the full view, and the print layout.
 * Content is the published version returned by getCheckInAgreement. Nothing here writes.
 */
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CheckCircle2, Circle, X } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type {
  CheckInAgreementAcknowledgement,
  CheckInAgreementAcknowledgementView,
  CheckInAgreementRead,
  CheckInAgreementVersion,
} from "@/packages/pms/lib/fo-check-in-agreement";
import { agreementSectionIcon } from "@/packages/pms/lib/fo-checkin-v2-agreement-icons";
import {
  agreementSectionItems,
  agreementStaffReference,
  agreementVersionLabel,
  formatAgreementTimestamp,
} from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import { DialogOverlay, DialogPortal } from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

export type AgreementDocumentContext = {
  propertyName: string | null;
  guestName: string;
  confirmationNumber: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
};

export function AgreementContent({
  read,
  version,
  variant,
}: {
  read: CheckInAgreementRead;
  version: CheckInAgreementVersion;
  variant: "panel" | "dialog" | "print";
}) {
  const sections = agreementSectionItems(read);
  const print = variant === "print";
  if (sections.length === 0) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap text-sm leading-6 text-[#251605]",
          !print && "rounded-lg border border-[#E8DFD0] bg-[#FBF7F1] p-4",
        )}
        data-testid={`fo-ci-v2-agreement-body${variant === "panel" ? "" : `-${variant}`}`}
      >
        {version.body}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid={`fo-ci-v2-agreement-content-${variant}`}>
      {version.intro ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-[#251605]">{version.intro}</p>
      ) : null}
      {version.leadIn ? (
        <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#251605]">
          {version.leadIn}
        </p>
      ) : null}
      <ol
        className={cn(
          "divide-y divide-[#E8DFD0]",
          !print && "rounded-lg border border-[#E8DFD0] bg-[#FBF7F1]",
        )}
        data-testid={`fo-ci-v2-agreement-sections-${variant}`}
      >
        {sections.map((section) => {
          const Icon = agreementSectionIcon(section);
          return (
            <li
              key={section.id}
              className={cn("flex gap-3", print ? "py-2" : "px-4 py-3")}
              data-testid={`fo-ci-v2-agreement-section-${section.id}`}
              data-section-icon={Icon.displayName ?? ""}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  print ? "border border-[#DDD4C5]" : "bg-[#C89933]/15 text-[#8B6914]",
                )}
                aria-hidden="true"
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#251605]">{section.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-[#4A3F33]">
                  {section.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AcknowledgementSummaryList({
  items,
  flags,
  signed,
}: {
  items: CheckInAgreementAcknowledgementView[];
  flags: CheckInAgreementAcknowledgement;
  signed: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="fo-ci-v2-agreement-ack-summary">
      {items.map((item) => {
        const accepted = flags[item.id] === true;
        return (
          <li key={item.id} className="flex gap-2 text-sm text-[#251605]">
            {signed ? (
              accepted ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#436436]" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-[#6B5E4E]" aria-hidden />
              )
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-[#6B5E4E]" aria-hidden />
            )}
            <div>
              {item.title ? (
                <p className="text-xs font-semibold text-[#6B5E4E]">
                  {item.title}
                  {item.required ? " (required)" : ""}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{item.statement}</p>
              {signed ? (
                <p className="text-xs text-[#6B5E4E]">{accepted ? "Accepted" : "Not accepted"}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FullAgreementDialog({
  open,
  onOpenChange,
  read,
  version,
  items,
  flags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  read: CheckInAgreementRead;
  version: CheckInAgreementVersion;
  items: CheckInAgreementAcknowledgementView[];
  flags: CheckInAgreementAcknowledgement;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[80]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[80] flex max-h-[90dvh] w-[min(92vw,860px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-xl"
          data-testid="fo-ci-v2-agreement-full-view"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#E8DFD0] px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-[#251605]">
                {version.title || "Guest Agreement"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-[#6B5E4E]">
                {agreementVersionLabel(version)} · Read-only
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-[#6B5E4E] hover:bg-[#FBF7F1]"
              aria-label="Close full agreement"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <AgreementContent read={read} version={version} variant="dialog" />
            {items.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                  {version.acknowledgementTitle || "Guest Acknowledgement"}
                </h3>
                {version.acknowledgementIntro ? (
                  <p className="mb-2 text-sm text-[#251605]">{version.acknowledgementIntro}</p>
                ) : null}
                <AcknowledgementSummaryList
                  items={items}
                  flags={flags}
                  signed={Boolean(read.signed && !read.draft)}
                />
              </section>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

const PRINT_CLASS = "fo-ci-v2-agreement-print";

/** Print-only layer on document.body. Everything else on the page is hidden while printing. */
export function AgreementPrintLayer({
  active,
  read,
  version,
  items,
  context,
  signatureUrl,
}: {
  active: boolean;
  read: CheckInAgreementRead;
  version: CheckInAgreementVersion;
  items: CheckInAgreementAcknowledgementView[];
  context: AgreementDocumentContext;
  signatureUrl: string | null;
}) {
  if (!active || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={`${PRINT_CLASS} hidden bg-white print:block`}>
        <AgreementPrintDocument
          read={read}
          version={version}
          items={items}
          context={context}
          signatureUrl={signatureUrl}
        />
      </div>
      <style>{`
        @media print {
          @page { margin: 14mm; }
          html, body { overflow: visible !important; height: auto !important; }
          body * { visibility: hidden; }
          .${PRINT_CLASS}, .${PRINT_CLASS} * { visibility: visible; }
          .${PRINT_CLASS} {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .${PRINT_CLASS} li, .${PRINT_CLASS} section { break-inside: avoid; }
        }
      `}</style>
    </>,
    document.body,
  );
}

export function AgreementPrintDocument({
  read,
  version,
  items,
  context,
  signatureUrl,
}: {
  read: CheckInAgreementRead;
  version: CheckInAgreementVersion;
  items: CheckInAgreementAcknowledgementView[];
  context: AgreementDocumentContext;
  signatureUrl: string | null;
}) {
  const signed = read.signed && !read.draft ? read.signed : null;
  return (
    <article
      className="mx-auto max-w-[780px] space-y-5 p-2 text-[#251605]"
      data-testid="fo-ci-v2-agreement-print-document"
    >
      <header className="border-b border-[#251605] pb-3 text-center">
        {context.propertyName ? (
          <p className="text-sm font-semibold">{context.propertyName}</p>
        ) : null}
        <h1 className="mt-1 text-lg font-extrabold tracking-wide">HOTEL REGISTRATION AGREEMENT</h1>
        {version.title ? <p className="text-sm">{version.title}</p> : null}
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <PrintFact label="Guest" value={context.guestName} />
        <PrintFact label="Reservation" value={context.confirmationNumber ?? "—"} />
        <PrintFact
          label="Room"
          value={context.roomNumber ? `Room ${context.roomNumber}` : "No room assigned"}
        />
        <PrintFact
          label="Stay"
          value={`${formatStayDate(context.arrivalDate)} \u2192 ${formatStayDate(context.departureDate)}`}
        />
        <PrintFact label="Agreement Version" value={agreementVersionLabel(version)} />
      </dl>
      <AgreementContent read={read} version={version} variant="print" />
      {items.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
            {version.acknowledgementTitle || "Guest Acknowledgement"}
          </h2>
          {version.acknowledgementIntro ? (
            <p className="mb-2 text-sm">{version.acknowledgementIntro}</p>
          ) : null}
          <AcknowledgementSummaryList
            items={items}
            flags={signed?.acknowledgements ?? {}}
            signed={Boolean(signed)}
          />
        </section>
      ) : null}
      <section
        className="border-t border-[#DDD4C5] pt-3"
        data-testid="fo-ci-v2-agreement-print-signature"
      >
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Guest Signature</h2>
        {signed ? (
          <>
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt={`Signature of ${context.guestName}`}
                className="max-h-28 border-b border-[#251605]"
              />
            ) : (
              <p className="text-sm">Signature recorded</p>
            )}
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <PrintFact label="Signed by" value={context.guestName} />
              <PrintFact label="Signed at" value={formatAgreementTimestamp(signed.signedAt)} />
              <PrintFact label="Recorded by" value={agreementStaffReference(signed.capturedBy)} />
            </dl>
          </>
        ) : (
          <p className="text-sm font-semibold" data-testid="fo-ci-v2-agreement-print-unsigned">
            Unsigned
          </p>
        )}
      </section>
    </article>
  );
}

function PrintFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}
