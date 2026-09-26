/**
 * RFC-4180 compliant CSV serializer with spreadsheet formula injection protection.
 * Client/server shared pure utilities (P8-STEP-02).
 */

import type { CommercialPerformance, RevenuePerformanceOverview } from "./revenue-analytics.ts";
import type { UnifiedRevenueAuditEntry } from "./revenue-audit.ts";

export const MAX_AUDIT_EXPORT_ROWS = 10000;

const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@"];

/**
 * Escapes a single CSV cell according to RFC-4180 and sanitizes against formula injection.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // Formula injection defense: If text starts with =, +, -, @, prefix with a single quote.
  if (FORMULA_TRIGGER_CHARS.some((char) => str.startsWith(char))) {
    str = `'${str}`;
  }

  // Quote wrapping required if cell contains comma, quote, or newline.
  const requiresQuotes =
    str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r");
  if (requiresQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function serializeCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = [serializeCsvRow(headers)];
  for (const row of rows) {
    lines.push(serializeCsvRow(row));
  }
  return lines.join("\r\n");
}

export function buildRevenuePerformanceCsv(overview: RevenuePerformanceOverview): string {
  const lines: string[] = [];

  // 1. Report Metadata
  lines.push("REVENUE PERFORMANCE OVERVIEW");
  lines.push(`Property ID,${overview.restaurantId}`);
  lines.push(`Period,${overview.fromDate} to ${overview.toDate}`);
  lines.push(`Currency,${overview.currency}`);
  lines.push(`Date Basis,${overview.dateBasis}`);
  lines.push(`Inventory Metric Status,${overview.summary.inventoryMetricSupport}`);
  lines.push("");

  // 2. Summary KPIs
  lines.push("METRIC SUMMARY");
  const summaryHeaders = ["Metric", "Value"];
  const summaryRows = [
    [
      "Booked Room Revenue",
      `${overview.summary.bookedRoomRevenue.toFixed(2)} ${overview.currency}`,
    ],
    ["Sold Room Nights", overview.summary.soldRoomNights],
    ["Available Room Nights", overview.summary.availableRoomNights ?? "N/A (Non-inventory filter)"],
    [
      "Occupancy %",
      overview.summary.occupancyPct !== null
        ? `${overview.summary.occupancyPct.toFixed(2)}%`
        : "N/A (Non-inventory filter)",
    ],
    ["ADR", `${overview.summary.adr.toFixed(2)} ${overview.currency}`],
    [
      "RevPAR",
      overview.summary.revpar !== null
        ? `${overview.summary.revpar.toFixed(2)} ${overview.currency}`
        : "N/A (Non-inventory filter)",
    ],
    ["Reservation Count (Distinct)", overview.summary.reservationCount],
    ["Priced Nights Share", `${overview.summary.pricedShare.toFixed(1)}%`],
  ];
  lines.push(serializeCsv(summaryHeaders, summaryRows));
  lines.push("");

  // 3. Daily Trend
  lines.push("DAILY TREND");
  const trendHeaders = [
    "Date",
    "Sold Nights",
    "Available Nights",
    "Occupancy %",
    "Booked Revenue",
    "ADR",
    "RevPAR",
    "Distinct Reservations",
  ];
  const trendRows = overview.dailyTrend.map((row) => [
    row.date,
    row.soldRoomNights,
    row.availableRoomNights ?? "N/A",
    row.occupancyPct !== null ? `${row.occupancyPct.toFixed(2)}%` : "N/A",
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.revpar !== null ? row.revpar.toFixed(2) : "N/A",
    row.reservationCount,
  ]);
  lines.push(serializeCsv(trendHeaders, trendRows));
  lines.push("");

  // 4. Room Types Breakdown
  lines.push("ROOM TYPE PERFORMANCE");
  const roomHeaders = [
    "Room Type",
    "Sold Nights",
    "Available Nights",
    "Occupancy %",
    "Booked Revenue",
    "ADR",
    "RevPAR",
    "Distinct Reservations",
    "Revenue Share %",
  ];
  const roomRows = overview.breakdowns.roomTypes.map((row) => [
    row.roomTypeName,
    row.soldRoomNights,
    row.availableRoomNights ?? "N/A",
    row.occupancyPct !== null ? `${row.occupancyPct.toFixed(2)}%` : "N/A",
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.revpar !== null ? row.revpar.toFixed(2) : "N/A",
    row.reservationCount,
    `${row.shareOfRevenue.toFixed(2)}%`,
  ]);
  lines.push(serializeCsv(roomHeaders, roomRows));
  lines.push("");

  // 5. Rate Plans Breakdown (Occupancy/RevPAR strictly N/A)
  lines.push("RATE PLAN PERFORMANCE (Non-inventory dimension - Occupancy/RevPAR not applicable)");
  const planHeaders = [
    "Rate Plan Code",
    "Rate Plan Name",
    "Sold Nights",
    "Booked Revenue",
    "ADR",
    "Distinct Reservations",
    "Revenue Share %",
  ];
  const planRows = overview.breakdowns.ratePlans.map((row) => [
    row.ratePlanCode,
    row.ratePlanName,
    row.soldRoomNights,
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.reservationCount,
    `${row.shareOfRevenue.toFixed(2)}%`,
  ]);
  lines.push(serializeCsv(planHeaders, planRows));
  lines.push("");

  // 6. Market Segments Breakdown
  lines.push("MARKET SEGMENT PERFORMANCE");
  const segHeaders = [
    "Market Segment",
    "Sold Nights",
    "Booked Revenue",
    "ADR",
    "Distinct Reservations",
    "Revenue Share %",
  ];
  const segRows = overview.breakdowns.marketSegments.map((row) => [
    row.marketSegmentLabel,
    row.soldRoomNights,
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.reservationCount,
    `${row.shareOfRevenue.toFixed(2)}%`,
  ]);
  lines.push(serializeCsv(segHeaders, segRows));
  lines.push("");

  // 7. Commercial Sources Breakdown
  lines.push("COMMERCIAL BOOKING SOURCE PERFORMANCE");
  const srcHeaders = [
    "Commercial Source",
    "Sold Nights",
    "Booked Revenue",
    "ADR",
    "Distinct Reservations",
    "Revenue Share %",
  ];
  const srcRows = overview.breakdowns.commercialSources.map((row) => [
    row.commercialSourceLabel,
    row.soldRoomNights,
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.reservationCount,
    `${row.shareOfRevenue.toFixed(2)}%`,
  ]);
  lines.push(serializeCsv(srcHeaders, srcRows));
  lines.push("");

  // 8. Technical Origin Breakdown
  lines.push("TECHNICAL RESERVATION ORIGIN PERFORMANCE");
  const originHeaders = [
    "Origin",
    "Sold Nights",
    "Booked Revenue",
    "ADR",
    "Distinct Reservations",
    "Revenue Share %",
  ];
  const originRows = overview.breakdowns.technicalOrigins.map((row) => [
    row.originLabel,
    row.soldRoomNights,
    row.bookedRoomRevenue.toFixed(2),
    row.adr.toFixed(2),
    row.reservationCount,
    `${row.shareOfRevenue.toFixed(2)}%`,
  ]);
  lines.push(serializeCsv(originHeaders, originRows));

  return lines.join("\r\n");
}

export function buildCommercialPerformanceCsv(perf: CommercialPerformance): string {
  const lines: string[] = [];

  lines.push("COMMERCIAL ATTRITION & PERFORMANCE");
  lines.push(`Period,${perf.fromDate} to ${perf.toDate}`);
  lines.push(`Currency,${perf.currency}`);
  lines.push("");

  lines.push("PROMOTIONS");
  const promoHeaders = [
    "Promotion Name",
    "Distinct Reservations",
    "Sold Nights",
    "Base Amount",
    "Discount Amount",
    "Post-Promotion Amount",
  ];
  const promoRows = perf.promotions.map((p) => [
    p.promotionName,
    p.reservationCount,
    p.soldRoomNights,
    p.preCommercialRoomAmount.toFixed(2),
    p.discountAmount.toFixed(2),
    p.postPromotionRoomAmount.toFixed(2),
  ]);
  lines.push(serializeCsv(promoHeaders, promoRows));
  lines.push("");

  lines.push("PACKAGES");
  const pkgHeaders = [
    "Package Name",
    "Distinct Reservations",
    "Selection Count",
    "Sold Nights",
    "Booked Package Amount",
  ];
  const pkgRows = perf.packages.map((k) => [
    k.packageName,
    k.reservationCount,
    k.selectionCount,
    k.soldRoomNights,
    k.bookedPackageAmount.toFixed(2),
  ]);
  lines.push(serializeCsv(pkgHeaders, pkgRows));

  return lines.join("\r\n");
}

export function buildUnifiedAuditCsv(entries: UnifiedRevenueAuditEntry[]): string {
  const headers = [
    "Timestamp (UTC)",
    "Domain",
    "Action",
    "Entity Type",
    "Entity Label",
    "Scope / Context",
    "Actor",
    "Reason",
    "Status",
    "Operation ID",
    "Approval Request ID",
    "Source Table",
  ];

  const rows = entries.map((e) => [
    e.timestamp,
    e.domain,
    e.action,
    e.entityType,
    e.entityLabel,
    e.scopeLabel,
    e.actorLabel,
    e.reason ?? "",
    e.status,
    e.operationId ?? "",
    e.approvalRequestId ?? "",
    e.sourceTable,
  ]);

  return serializeCsv(headers, rows);
}
