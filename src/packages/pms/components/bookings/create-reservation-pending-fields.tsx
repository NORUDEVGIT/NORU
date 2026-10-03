import { useState, type ReactNode } from "react";

import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

/** Disabled field kept visible until its owning package can supply a live reader. */
function PendingField({
  label,
  placeholder,
  source,
  note,
}: {
  label: string;
  placeholder: string;
  source: string;
  note?: string;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <Input value="" placeholder={placeholder} disabled aria-label={label} />
      <span className="text-[10px] font-normal">
        {/* source is the intended owner; the control is not submitted */}
        {source}
        {note ? ` ${note}` : ""}
      </span>
    </label>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E7E0D4] bg-white p-4 shadow-sm">
      <h3 className="font-display text-base text-[#251605]">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function AvailabilityUtilities({ onModifySearch }: { onModifySearch?: () => void }) {
  return (
    <Card title="Search criteria extras">
      {/* TODO: wire to Settings > Reservation Rules */}
      <PendingField label="Infants" placeholder="Number of infants" source="TODO: wire to Settings > Reservation Rules" />
      {/* TODO: wire to Rate & Revenue */}
      <PendingField label="Flexible Dates" placeholder="Select a flexible-date window" source="TODO: wire to Rate & Revenue" />
      {/* TODO: wire to Settings > Property currency */}
      <PendingField label="Currency" placeholder="Select currency" source="TODO: wire to Settings > Property currency" />
      <div className="sm:col-span-2">
        <Button type="button" variant="outline" size="sm" onClick={onModifySearch}>
          Modify Search
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="button" variant="outline" size="sm" disabled>
          Compare Rates
        </Button>
        <Button type="button" variant="outline" size="sm" disabled>
          Alternative Dates
        </Button>
        <Button type="button" variant="outline" size="sm" disabled>
          Different Room Type
        </Button>
        <Button type="button" variant="outline" size="sm" disabled>
          Adjust Occupancy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        These utilities stay off until Rate & Revenue can return comparison and alternate-date reads. No sample rates are shown.
      </p>
    </Card>
  );
}

export function BookingRelationshipFields() {
  return (
    <div className="space-y-3">
      <Card title="Company / Corporate">
        {/* TODO: wire to Guest Profile company masters */}
        <PendingField label="Company Contact" placeholder="Select company contact" source="TODO: wire to Guest Profile" />
        <PendingField label="Corporate Rate" placeholder="Select corporate rate" source="TODO: wire to Rate & Revenue" />
        <PendingField label="Billing Arrangement" placeholder="Select billing arrangement" source="TODO: wire to Cashiering" />
        <PendingField label="Travel Purpose" placeholder="Select travel purpose" source="TODO: wire to Settings > Reservation Rules" />
      </Card>
      <Card title="Travel Agent / Agency">
        <PendingField label="Agent Contact" placeholder="Select agent contact" source="TODO: wire to Guest Profile" />
        <PendingField label="Agency Rate" placeholder="Select agency rate" source="TODO: wire to Rate & Revenue" />
        <PendingField label="Commission" placeholder="Commission is not calculated here" source="TODO: wire to Rate & Revenue" note="Not posted from Reservations." />
        <PendingField label="Agency external reference" placeholder="Enter external booking reference" source="TODO: wire to Settings > Reservation Rules" />
      </Card>
      <Card title="Group / Block">
        <PendingField label="Group" placeholder="Select group/block" source="TODO: wire to Groups & Blocks" />
        <PendingField label="Block" placeholder="Select group/block" source="TODO: wire to Groups & Blocks" />
        <PendingField label="Group Rate" placeholder="Select group rate" source="TODO: wire to Rate & Revenue" />
        <PendingField label="Cut-off Date" placeholder="Select cut-off date" source="TODO: wire to Groups & Blocks" />
        <PendingField label="Pickup Status" placeholder="Pickup status is read from the block" source="TODO: wire to Groups & Blocks" />
      </Card>
    </div>
  );
}

export function StayPreferenceChecks() {
  const options = ["High Floor", "Non-Smoking", "Quiet Room", "Connecting Rooms", "Late Check-In", "Early Check-In"];
  return (
    <section className="rounded-xl border border-[#E7E0D4] bg-white p-4 shadow-sm">
      <h3 className="font-display text-base text-[#251605]">Stay preferences</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="inline-flex items-center gap-2 rounded-full border border-[#E7E0D4] px-3 py-1 text-xs text-[#6B6256]">
            <input type="checkbox" disabled />
            {option}
          </label>
        ))}
      </div>
      {/* TODO: wire to Settings > Reservation Rules */}
      <p className="mt-2 text-[10px] text-muted-foreground">TODO: wire to Settings &gt; Reservation Rules. Preferences are not stored on the create payload yet.</p>
    </section>
  );
}

export function PolicyPendingFields() {
  return (
    <div className="space-y-3">
      <Card title="Guarantee card reference">
        {/* TODO: wire to Cashiering tokenization. Do not persist raw card or CVV. */}
        <PendingField label="Card Holder Name" placeholder="Name on card" source="TODO: wire to Cashiering" note="Disabled until a token provider exists." />
        <PendingField label="Card reference" placeholder="Masked card or token reference" source="TODO: wire to Cashiering" />
        <PendingField label="Expiry" placeholder="MM/YY" source="TODO: wire to Cashiering" />
        <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
          CVV
          <Input value="" placeholder="Not collected" disabled aria-label="CVV" />
          <span className="text-[10px] font-normal">CVV is never stored on a reservation. Secure payment integration is pending.</span>
        </label>
      </Card>
      <Card title="Deposit requirement">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="radio" name="deposit-requirement" disabled defaultChecked />
          No Deposit Required
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="radio" name="deposit-requirement" disabled />
          Deposit Required
        </label>
        <PendingField label="Deposit amount type" placeholder="Select fixed amount or percentage" source="TODO: wire to Cashiering" />
        <PendingField label="Deposit amount" placeholder="Enter deposit amount" source="TODO: wire to Cashiering" note="Reservations does not post money." />
        <PendingField label="Deposit due date" placeholder="Select deposit due date" source="TODO: wire to Cashiering" />
        <PendingField label="Payment method" placeholder="Select payment method" source="TODO: wire to Cashiering" />
        <PendingField label="Payment reference" placeholder="Enter payment reference" source="TODO: wire to Cashiering" />
      </Card>
      <Card title="Policies">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="radio" name="policy-mode" disabled defaultChecked />
          Use Hotel Default Policy
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="radio" name="policy-mode" disabled />
          Select Different Policy
        </label>
        <PendingField label="Cancellation policy" placeholder="Select cancellation policy" source="TODO: wire to Settings > Reservation Rules" />
        <div className="sm:col-span-2">
          <Button type="button" variant="outline" size="sm" disabled>
            View Details
          </Button>
        </div>
        <PendingField label="No-show policy" placeholder="Select no-show policy" source="TODO: wire to Settings > Reservation Rules" />
        <PendingField label="Early departure policy" placeholder="Select early departure policy" source="TODO: wire to Settings > Reservation Rules" />
      </Card>
      <section className="rounded-xl border border-[#E7E0D4] bg-white p-4 text-sm text-[#6B6256] shadow-sm">
        {[
          "Guest informed about cancellation and no-show policy",
          "Guest consent for deposit or guarantee",
          "Non-refundable reservation acknowledgement",
          "Special terms and conditions apply",
        ].map((line) => (
          <label key={line} className="mt-1 flex items-center gap-2 first:mt-0">
            <input type="checkbox" disabled />
            {line}
          </label>
        ))}
        <p className="mt-2 text-[10px]">TODO: wire to Settings &gt; Reservation Rules. Acknowledgements are not written by the current create call.</p>
      </section>
    </div>
  );
}

export function GuestBookerReview({
  name,
  phone,
  email,
  idDocument,
  nationality,
  onViewProfile,
}: {
  name: string | null;
  phone: string | null;
  email: string | null;
  idDocument: string | null;
  nationality: string | null;
  onViewProfile?: () => void;
}) {
  const [sameAsGuest, setSameAsGuest] = useState(true);
  return (
    <section className="rounded-xl border border-[#E7E0D4] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-[#251605]">Guest and booker</h3>
        {onViewProfile ? (
          <Button type="button" variant="outline" size="sm" onClick={onViewProfile}>
            View Profile
          </Button>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Guest Name</dt>
          <dd>{name || "Select a guest on Guest & Stay"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone</dt>
          <dd>{phone || "No phone on the guest profile"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</dt>
          <dd>{email || "No email on the guest profile"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">ID / Passport No.</dt>
          <dd>{idDocument || "No identity number on the guest profile"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Nationality</dt>
          <dd>{nationality || "No nationality on the guest profile"}</dd>
        </div>
      </dl>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sameAsGuest} onChange={(event) => setSameAsGuest(event.target.checked)} />
        Same as Guest
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* TODO: wire to Guest Profile — a different booker is not on the create payload */}
        <PendingField label="Contact Name" placeholder="Contact name" source="TODO: wire to Guest Profile" note={sameAsGuest ? "Using the selected guest." : "Disabled. A separate booker is not stored by create."} />
        <PendingField label="Phone" placeholder="Contact phone" source="TODO: wire to Guest Profile" />
        <PendingField label="Email" placeholder="Contact email" source="TODO: wire to Guest Profile" />
        <PendingField label="Company" placeholder="Select company" source="TODO: wire to Guest Profile" />
      </div>
    </section>
  );
}

export function ChannelField() {
  return (
    <PendingField label="Channel" placeholder="Select booking channel" source="TODO: wire to Settings > Reservation Rules" />
  );
}

export function PurposeField() {
  return (
    <div className="mt-3">
      <PendingField label="Purpose of stay" placeholder="Select purpose of stay" source="TODO: wire to Settings > Reservation Rules" />
    </div>
  );
}
