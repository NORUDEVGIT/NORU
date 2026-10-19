/**
 * Dedicated registration / check-in confirmation.
 * Printed through the browser. The open PMS screen stays hidden.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import type { RegistrationFormView } from "@/packages/pms/lib/fo-checkin-v2-review-model";

const PRINT_CLASS = "fo-ci-v2-registration-print";

export function RegistrationPrintLayer({
  active,
  form,
}: {
  active: boolean;
  form: RegistrationFormView | null;
}) {
  if (!active || !form || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className={`${PRINT_CLASS} hidden bg-white text-black print:block`}>
        <RegistrationFormDocument form={form} />
      </div>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { overflow: visible !important; height: auto !important; background: white !important; }
          body * { visibility: hidden; }
          .${PRINT_CLASS}, .${PRINT_CLASS} * { visibility: visible; }
          .${PRINT_CLASS} {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: #251605;
          }
          .${PRINT_CLASS} section, .${PRINT_CLASS} header, .${PRINT_CLASS} footer { break-inside: avoid; }
          .${PRINT_CLASS} img { max-height: 28mm; width: auto; }
        }
      `}</style>
    </>,
    document.body,
  );
}

export function RegistrationFormDocument({ form }: { form: RegistrationFormView }) {
  return (
    <article
      className="mx-auto max-w-[190mm] bg-white p-2 text-[11pt] leading-6 text-[#251605]"
      data-testid="fo-ci-v2-registration-form"
      data-print-status={form.status}
    >
      <header className="border-b-2 border-[#251605] pb-3 text-center">
        {form.propertyLogoUrl ? (
          <img src={form.propertyLogoUrl} alt="" className="mx-auto mb-2 max-h-12" />
        ) : null}
        {form.propertyName ? <p className="text-[13pt] font-bold">{form.propertyName}</p> : null}
        {form.propertyAddress ? <p className="text-[10pt]">{form.propertyAddress}</p> : null}
        {form.propertyPhone || form.propertyEmail ? (
          <p className="text-[10pt]">
            {[form.propertyPhone, form.propertyEmail].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <h1 className="mt-2 text-[14pt] font-extrabold tracking-wide">{form.heading}</h1>
        <p className="text-[11pt] font-semibold" data-testid="fo-ci-v2-registration-form-status">
          Status: {form.status}
        </p>
      </header>

      <FormSection title="Guest Information">
        <FormGrid>
          <FormFact label="Guest Name" value={form.guestName} />
          <FormFact label="Profile Number" value={form.profileNumber} />
          <FormFact label="Date of Birth" value={form.dateOfBirth} />
          <FormFact label="Nationality" value={form.nationality} />
          <FormFact label="Phone" value={form.phone} />
          <FormFact label="Email" value={form.email} />
          <FormFact label="Address" value={form.address} />
        </FormGrid>
      </FormSection>

      <FormSection title="Reservation">
        <FormGrid>
          <FormFact label="Confirmation Number" value={form.confirmationNumber} />
          <FormFact label="Reservation Status" value={form.reservationStatus} />
          <FormFact label="Booking Source" value={form.bookingSource} />
          <FormFact label="Company" value={form.companyName} />
          <FormFact label="Travel Agency" value={form.travelAgentName} />
          <FormFact label="Group" value={form.groupName} />
        </FormGrid>
      </FormSection>

      <FormSection title="Stay">
        <FormGrid>
          <FormFact label="Arrival Date" value={formatStayDate(form.arrivalDate)} />
          <FormFact label="Departure Date" value={formatStayDate(form.departureDate)} />
          <FormFact label="Nights" value={String(form.nights)} />
          <FormFact label="Adults" value={String(form.adults)} />
          <FormFact label="Children" value={String(form.children)} />
          <FormFact
            label="Room Number"
            value={form.roomNumber ? `Room ${form.roomNumber}` : null}
          />
          <FormFact label="Room Type" value={form.roomTypeName} />
          <FormFact label="Rate Plan" value={form.ratePlanName} />
        </FormGrid>
      </FormSection>

      <FormSection title="Financial Summary">
        <FormGrid>
          <FormFact label="Room Charge" value={form.roomCharge} />
          <FormFact label="Deposit Required" value={form.depositRequired} />
          <FormFact label="Deposit Received" value={form.depositReceived} />
          <FormFact label="Deposit Status" value={form.depositStatus} />
          <FormFact label="Guarantee Method" value={form.guaranteeMethod} />
        </FormGrid>
      </FormSection>

      <FormSection title="Identification">
        <FormGrid>
          <FormFact label="ID Type" value={form.idType} />
          <FormFact label="ID Number" value={form.idNumber} />
          <FormFact label="Issuing Country" value={form.idCountry} />
          <FormFact label="Issue Date" value={form.idIssueDate} />
          <FormFact label="Expiry Date" value={form.idExpiry} />
          <FormFact label="Verification" value={form.idVerification} />
        </FormGrid>
      </FormSection>

      <FormSection title="Guest Agreement">
        <FormGrid>
          <FormFact label="Agreement" value={form.agreementTitle} />
          <FormFact label="Version" value={form.agreementVersion} />
          <FormFact
            label="Signed"
            value={form.agreementTitle ? (form.agreementSigned ? "Signed" : "Not signed") : null}
          />
          <FormFact label="Signed at" value={form.agreementSignedAt} />
        </FormGrid>
        {form.acknowledgements.length > 0 ? (
          <div className="mt-2">
            <p className="text-[10pt] font-bold uppercase tracking-wide">Guest Acknowledgements</p>
            <ul
              className="mt-1 space-y-1"
              data-testid="fo-ci-v2-registration-form-acknowledgements"
            >
              {form.acknowledgements.map((item) => (
                <li key={item.id} className="text-[10.5pt]">
                  <span className="font-semibold">{item.state}.</span> {item.statement}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Guest Signature">
        {form.agreementSigned ? (
          form.signatureUrl ? (
            <img
              src={form.signatureUrl}
              alt={`Signature of ${form.signedBy ?? form.guestName}`}
              className="max-h-24 max-w-xs border-b border-[#251605]"
              data-testid="fo-ci-v2-registration-form-signature"
            />
          ) : form.signatureRecorded ? (
            <p data-testid="fo-ci-v2-registration-form-signature-recorded">Signature Recorded</p>
          ) : (
            <p>Signature Recorded</p>
          )
        ) : (
          <p data-testid="fo-ci-v2-registration-form-unsigned">Not signed</p>
        )}
        {form.agreementSigned ? (
          <FormGrid>
            <FormFact label="Signed by" value={form.signedBy} />
            <FormFact label="Signed at" value={form.agreementSignedAt} />
          </FormGrid>
        ) : null}
      </FormSection>

      {form.status === "Checked In" ? (
        <section
          className="mt-4 border-2 border-[#251605] p-3"
          data-testid="fo-ci-v2-registration-form-confirmation"
        >
          <h2 className="text-[12pt] font-extrabold tracking-wide">CHECK-IN CONFIRMATION</h2>
          <p className="font-bold">Status: CHECKED IN</p>
          {form.stampPending ? (
            <p>
              The room status was updated to Checked In. Progress synchronization is still pending
              and will be reconciled automatically.
            </p>
          ) : null}
          <FormGrid>
            <FormFact label="Guest" value={form.guestName} />
            <FormFact label="Room" value={form.roomNumber ? `Room ${form.roomNumber}` : null} />
            <FormFact label="Check-In Time" value={form.checkInTime} />
            <FormFact label="Processed By" value={form.processedBy} />
          </FormGrid>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-[#251605] pt-2 text-[9pt]">
        <p>This document confirms the guest registration and check-in recorded in NORU PMS.</p>
        <p>
          {form.propertyName ? `${form.propertyName} · ` : ""}
          {form.confirmationNumber ? `Confirmation ${form.confirmationNumber} · ` : ""}
          Generated {form.generatedAt}
        </p>
      </footer>
    </article>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-[#DDD4C5] pt-2">
      <h2 className="text-[10pt] font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function FormGrid({ children }: { children: ReactNode }) {
  return <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">{children}</dl>;
}

function FormFact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="font-semibold">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}
