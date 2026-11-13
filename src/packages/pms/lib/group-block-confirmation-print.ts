import { groupStatusLabel } from "@/packages/pms/lib/groups-detail-workspace";
import { formatStayDate, nightsBetween } from "@/packages/pms/lib/reservation-dates";

export type GroupBlockConfirmationProperty = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type GroupBlockConfirmationAllotment = {
  roomType: string;
  dates: string;
  roomsBlocked: string;
  cutoff: string;
};

export type GroupBlockConfirmationInput = {
  property: GroupBlockConfirmationProperty;
  generatedAt: string;
  groupName: string;
  groupCode: string;
  status: string;
  stay: string;
  cutoff: string;
  company: string;
  travelAgency: string;
  groupLeader: string;
  profileSource: string;
  staySource: string;
  profileMarketSegment: string;
  stayMarketSegment: string;
  ratePlan: string;
  allotments: GroupBlockConfirmationAllotment[];
  roomTypes: string;
  totalRoomsBlocked: string;
  totalRoomNights: string;
  /** Guest-facing notes only. Staff and profile notes must not be passed. */
  publicNotes: string | null;
  /**
   * Review prints a draft before the group exists. A saved group prints the
   * same document without the draft mark.
   */
  draft?: boolean;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function safeLogoUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!/^https?:\/\//i.test(text)) return null;
  return text;
}

function line(label: string, value: string) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function buildGroupBlockConfirmationHtml(input: GroupBlockConfirmationInput): string {
  const property = input.property;
  const contact = [property.address, property.phone, property.email]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  const logo = safeLogoUrl(property.logoUrl);
  const rows = input.allotments
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.roomType)}</td>
        <td>${escapeHtml(row.dates)}</td>
        <td class="num">${escapeHtml(row.roomsBlocked)}</td>
        <td>${escapeHtml(row.cutoff)}</td>
      </tr>`,
    )
    .join("");
  const notes = input.publicNotes?.trim() ?? "";
  const draft = input.draft !== false;
  const footer = draft
    ? "This draft confirmation was prepared in NORU before the group was created. It is not a receipt and does not confirm payment or a held room inventory until the group and block are created."
    : "This confirmation was prepared in NORU from the saved group and block. It is not a receipt and does not confirm payment.";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Group / Block Confirmation — ${escapeHtml(property.name)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { margin: 0; color: #251605; font-family: Georgia, "Palatino Linotype", Palatino, serif; }
      .brand { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #C89933; padding-bottom: 14px; }
      .kicker { margin: 0; font-family: Arial, sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #8A641A; }
      h1 { margin: 4px 0 0; font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
      .contact { margin: 8px 0 0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #5C4E3E; }
      .logo { max-height: 52px; max-width: 160px; object-fit: contain; }
      .doc { text-align: right; font-family: Arial, sans-serif; }
      .doc h2 { margin: 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
      .badge { display: inline-block; margin-top: 8px; border: 1px solid #C89933; padding: 2px 6px; font-size: 10px; letter-spacing: 0.14em; color: #8A641A; }
      .meta { margin-top: 4px; font-size: 11px; color: #6B5E4E; }
      section { margin-top: 18px; }
      h3 { margin: 0 0 8px; border-bottom: 1px solid #E8DFD0; padding-bottom: 4px; font-family: Arial, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8A641A; }
      dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; margin: 0; }
      dt { font-family: Arial, sans-serif; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #6B5E4E; }
      dd { margin: 2px 0 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
      th { background: #251605; color: #FBF7F1; text-align: left; font-weight: 600; }
      th, td { padding: 7px 8px; vertical-align: top; }
      td { border-bottom: 1px solid #E8DFD0; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .totals { display: flex; gap: 18px; margin-top: 10px; font-family: Arial, sans-serif; font-size: 12px; }
      .totals strong { display: block; margin-top: 2px; font-size: 14px; }
      .notes { background: #FBF7F1; padding: 10px 12px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
      footer { margin-top: 22px; border-top: 1px solid #E8DFD0; padding-top: 8px; font-family: Arial, sans-serif; font-size: 10px; line-height: 1.45; color: #6B5E4E; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <header class="brand">
      <div>
        ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="" />` : `<p class="kicker">NORU</p>`}
        <h1>${escapeHtml(property.name)}</h1>
        ${contact.length ? `<p class="contact">${contact.map((item) => escapeHtml(item)).join("<br />")}</p>` : ""}
      </div>
      <div class="doc">
        <h2>Group / Block Confirmation</h2>
        ${draft ? `<div class="badge">DRAFT</div>` : ""}
        <p class="meta">Prepared ${escapeHtml(input.generatedAt)}</p>
      </div>
    </header>
    <section>
      <h3>Group</h3>
      <dl>
        ${line("Group name", input.groupName)}
        ${line("Group code", input.groupCode)}
        ${line("Status", input.status)}
        ${line("Stay", input.stay)}
        ${line("Cut-off", input.cutoff)}
        ${line("Company", input.company)}
        ${line("Travel agency", input.travelAgency)}
        ${line("Group leader", input.groupLeader)}
        ${line("Profile Source", input.profileSource)}
        ${line("Stay Source", input.staySource)}
        ${line("Profile Market Segment", input.profileMarketSegment)}
        ${line("Stay Market Segment", input.stayMarketSegment)}
        ${line("Preferred rate plan", input.ratePlan)}
      </dl>
    </section>
    <section>
      <h3>Room allotment</h3>
      <table>
        <thead>
          <tr>
            <th>Room type</th>
            <th>Block dates</th>
            <th class="num">Rooms blocked</th>
            <th>Cut-off</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4">No room allotment.</td></tr>`}
        </tbody>
      </table>
      <div class="totals">
        <div>Room types<strong>${escapeHtml(input.roomTypes)}</strong></div>
        <div>Rooms blocked<strong>${escapeHtml(input.totalRoomsBlocked)}</strong></div>
        <div>Room nights<strong>${escapeHtml(input.totalRoomNights)}</strong></div>
      </div>
    </section>
    ${
      notes
        ? `<section><h3>Notes</h3><div class="notes">${escapeHtml(notes)}</div></section>`
        : ""
    }
    <footer>
      ${escapeHtml(footer)}
    </footer>
    <script>window.onload = () => { window.focus(); window.print(); };</script>
  </body>
</html>`;
}

/** Opens a confirmation document and prints that document. */
export function printGroupBlockConfirmation(input: GroupBlockConfirmationInput): void {
  const printWindow = window.open("", "_blank", "width=900,height=740");
  if (!printWindow) {
    window.alert("Please allow pop-ups to print the confirmation.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildGroupBlockConfirmationHtml(input));
  printWindow.document.close();
}

export type SavedGroupConfirmationSource = {
  group: {
    confirmationNumber: string;
    name: string;
    code: string | null;
    status: string;
    arrivalDate: string;
    departureDate: string;
    cutoffDate: string | null;
    source: string | null;
    marketSegment: string | null;
  };
  blocks: Array<{
    roomTypeId: string;
    roomTypeName: string | null;
    startDate: string;
    endDate: string;
    allotted: number;
    cutoffDate: string | null;
  }>;
  roomTypes: Array<{ id: string; name: string }>;
  property: GroupBlockConfirmationProperty | null;
  generatedAt: string;
  companyName?: string | null;
  travelAgencyName?: string | null;
  groupLeaderName?: string | null;
  profileSourceName?: string | null;
  profileSourceCode?: string | null;
  profileMarketSegmentName?: string | null;
  profileMarketSegmentCode?: string | null;
  sources?: Array<{ code: string; name: string }>;
  segments?: Array<{ code: string; name: string }>;
  ratePlan?: string | null;
  /** Guest special requests only. Stay notes and profile notes are not accepted. */
  publicNotes?: string | null;
};

function catalogueName(rows: Array<{ code: string; name: string }> | undefined, code: string): string {
  const match = rows?.find((row) => row.code === code);
  return match?.name?.trim() || code;
}

function classificationLabel(input: {
  saved: string | null;
  profileName: string | null | undefined;
  profileCode: string | null | undefined;
  rows: Array<{ code: string; name: string }> | undefined;
  inherits: string;
}): string {
  const saved = input.saved?.trim() ?? "";
  const profileName = input.profileName?.trim() ?? "";
  const profileCode = input.profileCode?.trim() ?? "";
  if (!saved) return profileName || profileCode ? input.inherits : "—";
  if (profileCode && saved === profileCode) return input.inherits;
  return catalogueName(input.rows, saved);
}

/** Confirmation document for a group that has already been saved. */
export function savedGroupBlockConfirmationInput(
  input: SavedGroupConfirmationSource,
): GroupBlockConfirmationInput {
  const confirmation = input.group.confirmationNumber.trim();
  const code = input.group.code?.trim() ?? "";
  const groupCode =
    code && confirmation && code !== confirmation
      ? `${confirmation} · ${code}`
      : confirmation || code || "—";
  const nights =
    input.group.arrivalDate &&
    input.group.departureDate &&
    input.group.departureDate > input.group.arrivalDate
      ? nightsBetween(input.group.arrivalDate, input.group.departureDate)
      : 0;
  const stay =
    input.group.arrivalDate && input.group.departureDate
      ? `${formatStayDate(input.group.arrivalDate)} – ${formatStayDate(input.group.departureDate)}${
          nights > 0 ? ` · ${nights} ${nights === 1 ? "night" : "nights"}` : ""
        }`
      : "Not set";
  const allotments = input.blocks.map((block) => {
    const roomType =
      block.roomTypeName?.trim() ||
      input.roomTypes.find((type) => type.id === block.roomTypeId)?.name ||
      "Room type";
    return {
      roomType,
      dates: `${formatStayDate(block.startDate)} – ${formatStayDate(block.endDate)}`,
      roomsBlocked: String(block.allotted),
      cutoff: block.cutoffDate
        ? formatStayDate(block.cutoffDate)
        : input.group.cutoffDate
          ? `Inherits stay cut-off ${formatStayDate(input.group.cutoffDate)}`
          : "Inherits stay cut-off",
      roomTypeId: block.roomTypeId,
      roomNights:
        block.startDate && block.endDate && block.endDate > block.startDate
          ? nightsBetween(block.startDate, block.endDate) * Math.max(0, block.allotted)
          : null,
    };
  });
  const roomNights = allotments.every((row) => row.roomNights != null)
    ? allotments.reduce((sum, row) => sum + (row.roomNights ?? 0), 0)
    : null;
  const roomTypes = new Set(allotments.map((row) => row.roomTypeId).filter(Boolean));
  const totalRooms = allotments.reduce((sum, row) => sum + Math.max(0, Number(row.roomsBlocked) || 0), 0);
  return {
    property: {
      name: input.property?.name?.trim() || "Property",
      logoUrl: input.property?.logoUrl ?? null,
      address: input.property?.address ?? null,
      phone: input.property?.phone ?? null,
      email: input.property?.email ?? null,
    },
    generatedAt: input.generatedAt,
    groupName: input.group.name.trim() || "Group",
    groupCode,
    status: groupStatusLabel(input.group.status),
    stay,
    cutoff: input.group.cutoffDate ? formatStayDate(input.group.cutoffDate) : "Not set",
    company: input.companyName?.trim() || "—",
    travelAgency: input.travelAgencyName?.trim() || "—",
    groupLeader: input.groupLeaderName?.trim() || "—",
    profileSource: input.profileSourceName?.trim() || input.profileSourceCode?.trim() || "—",
    staySource: classificationLabel({
      saved: input.group.source,
      profileName: input.profileSourceName,
      profileCode: input.profileSourceCode,
      rows: input.sources,
      inherits: "Uses profile source",
    }),
    profileMarketSegment:
      input.profileMarketSegmentName?.trim() || input.profileMarketSegmentCode?.trim() || "—",
    stayMarketSegment: classificationLabel({
      saved: input.group.marketSegment,
      profileName: input.profileMarketSegmentName,
      profileCode: input.profileMarketSegmentCode,
      rows: input.segments,
      inherits: "Uses profile segment",
    }),
    ratePlan: input.ratePlan?.trim() || "—",
    allotments: allotments.map(({ roomType, dates, roomsBlocked, cutoff }) => ({
      roomType,
      dates,
      roomsBlocked,
      cutoff,
    })),
    roomTypes: String(roomTypes.size),
    totalRoomsBlocked: String(totalRooms),
    totalRoomNights: roomNights == null ? "—" : String(roomNights),
    publicNotes: input.publicNotes?.trim() || null,
    draft: false,
  };
}
