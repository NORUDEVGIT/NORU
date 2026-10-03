import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Info } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { listCompanyBilling } from "@/packages/pms/lib/guest-company-detail.functions";
import { COMPANY_BILLING_COPY } from "@/packages/pms/lib/guest-company-detail-workspace";

export function GuestCompanyBilling({
  restaurantId,
  companyId,
}: {
  restaurantId: string;
  companyId: string;
}) {
  const load = useServerFn(listCompanyBilling);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["company-billing", restaurantId, companyId, q, status],
    queryFn: () => load({ data: { restaurantId, companyId, q, status } }),
    retry: false,
  });

  function exportCsv() {
    const rows = query.data?.items ?? [];
    const header = [
      "Date",
      "Reference",
      "Guest",
      "Reservation",
      "Description",
      "Debit",
      "Credit",
      "Balance",
      "Status",
    ];
    const body = rows.map((row) =>
      [
        row.date,
        row.reference,
        row.guestName,
        row.confirmationNumber ?? "",
        row.description,
        row.debit,
        row.credit,
        row.balance,
        row.status,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `company-billing-${companyId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (query.isLoading) {
    return (
      <p className="p-6 text-center text-xs text-[#756A5B]">Loading billing & commercial terms…</p>
    );
  }
  if (query.error) {
    return (
      <div
        className="rounded-xl border border-dashed border-[#DDD4C5] p-6 text-center"
        data-testid="company-billing-error"
      >
        <p className="font-display text-base font-bold text-[#251605]">
          Billing information unavailable
        </p>
        <p className="mt-1 text-xs text-[#756A5B]">{(query.error as Error).message}</p>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;
  const money = Boolean(data.summary.moneyAvailable);

  return (
    <div className="space-y-5" data-testid="company-billing">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] pb-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#251605]">Commercial & Billing</h2>
          <p className="text-xs text-[#756A5B] max-w-2xl">{COMPANY_BILLING_COPY}</p>
        </div>
        <div className="flex items-center gap-2">
          {money ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              onClick={exportCsv}
              disabled={!data.items.length}
            >
              <Download className="mr-1.5 size-3.5" />
              Statement CSV
            </Button>
          ) : null}
        </div>
      </div>

      {/* PART 1: Commercial Terms */}
      <section
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3"
        data-testid="company-commercial-terms"
      >
        <div className="flex items-center gap-2 border-b border-[#F0EAE1] pb-2">
          <FileText className="size-4 text-[#8A641A]" />
          <h3 className="font-display text-sm font-bold text-[#251605]">
            Commercial Terms & Settlement Rules
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
          <InfoRow label="Account Status" value={data.summary.accountStatus} />
          <InfoRow
            label="Default Billing Rule"
            value={(data.summary as any).defaultBillingRule || "—"}
          />
          <InfoRow
            label="Settlement Method"
            value={(data.summary as any).defaultPaymentMethod || "No preference"}
          />
          <InfoRow
            label="Billing Currency"
            value={(data.summary as any).billingCurrency || "—"}
          />
          <InfoRow
            label="Payment Timing"
            value={
              (data.summary as any).paymentTiming
                ? String((data.summary as any).paymentTiming).replace(/_/g, " ")
                : "—"
            }
          />
          <InfoRow label="Payment terms" value={data.summary.paymentTerms ?? "—"} />
          <InfoRow
            label="Credit Account"
            value={data.summary.creditAccountEnabled ? "Enabled" : "Off"}
          />
          {data.summary.creditAccountEnabled ? (
            <>
              <InfoRow
                label="Credit Limit"
                value={
                  (data.summary as any).creditLimitAmount != null
                    ? `${Number((data.summary as any).creditLimitAmount).toFixed(2)} ${(data.summary as any).billingCurrency || ""}`
                    : "Uncapped"
                }
              />
              <InfoRow
                label="Credit Days"
                value={
                  (data.summary as any).creditDays != null
                    ? `${(data.summary as any).creditDays} Days`
                    : "—"
                }
              />
              <InfoRow
                label="Credit Status"
                value={
                  (data.summary as any).creditStatus
                    ? String((data.summary as any).creditStatus).replace(/_/g, " ")
                    : "—"
                }
              />
            </>
          ) : null}
          <InfoRow
            label="Tax Exemption"
            value={
              (data.summary as any).taxExempt
                ? `${(data.summary as any).taxExemptionRule || "Exempt"}${(data.summary as any).taxExemptionCertificateNumber ? ` (${(data.summary as any).taxExemptionCertificateNumber})` : ""}`
                : "Standard (Non-Exempt)"
            }
          />
          {(data.summary as any).taxExemptionValidTo ? (
            <InfoRow
              label="Tax Exemption Valid To"
              value={(data.summary as any).taxExemptionValidTo}
            />
          ) : null}
          <InfoRow
            label="Billing Instructions"
            value={(data.summary as any).billingInstruction || "—"}
          />
          <InfoRow label="Billing Contact" value={data.summary.billingContact ?? "—"} />
          <InfoRow label="Credit limit note" value={data.summary.creditLimitNote ?? "—"} />
          <InfoRow
            label="Numeric credit ledger"
            value={
              <span>
                —{" "}
                <span className="text-[10px] text-[#756A5B] font-normal">
                  (Not stored. This is not an AR balance.)
                </span>
              </span>
            }
          />
        </div>
      </section>

      {/* PART 2: Folio-Derived Billing */}
      <div className="space-y-4">
        {/* Folio Summary Band */}
        {money && data.kpis ? (
          <div
            className="grid grid-cols-2 divide-y divide-[#DDD4C5] rounded-xl border border-[#DDD4C5] bg-white p-2.5 sm:grid-cols-4 sm:divide-y-0 sm:divide-x shadow-sm"
            data-testid="company-billing-kpis"
          >
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
                Total charges
              </span>
              <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
                {data.kpis.totalRevenue.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
                Credits / payments
              </span>
              <span className="mt-1 font-mono text-sm font-bold text-emerald-700">
                {data.kpis.paid.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
                Outstanding (folio charges − credits)
              </span>
              <span className="mt-1 font-mono text-sm font-bold text-[#8A641A]">
                {data.kpis.outstanding.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-col px-3 py-1.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
                Open Folio Lines
              </span>
              <span className="mt-1 font-mono text-sm font-bold text-[#251605]">
                {data.kpis.pending}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#DDD4C5] bg-[#FAF8F5] p-3 text-xs text-[#756A5B]">
            Folio amounts stay hidden for roles without cashiering access. Authorized managers can
            read reservation folios here.
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 text-xs border-[#DDD4C5] bg-white min-w-48 flex-1"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search reference, guest, reservation…"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white w-36">
              <SelectValue placeholder="Folio status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All folio statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dense Full-Width Table */}
        <div className="rounded-xl border border-[#DDD4C5] bg-white overflow-hidden shadow-sm">
          {!money ? (
            <p className="p-6 text-center text-xs text-[#756A5B]">
              Transaction rows require cashiering access.
            </p>
          ) : data.items.length === 0 ? (
            <p className="p-6 text-center text-xs text-[#756A5B]">
              No folio transactions for this company’s reservations.
            </p>
          ) : (
            <Table>
              <TableHeader className="bg-[#FAF8F5]">
                <TableRow className="border-b border-[#DDD4C5]">
                  <TableHead className="text-xs font-semibold text-[#251605]">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-[#251605]">Reference</TableHead>
                  <TableHead className="text-xs font-semibold text-[#251605]">Guest</TableHead>
                  <TableHead className="text-xs font-semibold text-[#251605]">
                    Reservation
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-[#251605]">
                    Description
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-[#251605]">
                    Debit
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-[#251605]">
                    Credit
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold text-[#251605]">
                    Balance
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-[#251605]">Status</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-[#251605]">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#EFE9DF]/60 text-xs">
                {data.items.map((row) => (
                  <TableRow key={row.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <TableCell className="py-2.5 text-[#756A5B]">{row.date}</TableCell>
                    <TableCell className="py-2.5 font-mono text-[#8A641A] font-medium">
                      {row.reference}
                    </TableCell>
                    <TableCell className="py-2.5 text-[#251605]">{row.guestName}</TableCell>
                    <TableCell className="py-2.5 font-mono text-[#756A5B]">
                      {row.confirmationNumber ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-[#251605]">{row.description}</TableCell>
                    <TableCell className="py-2.5 text-right font-mono text-[#251605]">
                      {row.debit ? row.debit.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-right font-mono text-emerald-700">
                      {row.credit ? row.credit.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-right font-mono font-bold text-[#251605]">
                      {row.balance.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                          row.status === "closed"
                            ? "bg-stone-100 text-stone-600 border border-stone-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right space-x-1">
                      {row.reservationId ? (
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-[#8A641A] hover:bg-[#F7F4EE]"
                        >
                          <Link
                            to="/restaurant/pms/reservations/$reservationId"
                            params={{ reservationId: row.reservationId }}
                          >
                            Folio
                          </Link>
                        </Button>
                      ) : null}
                      {data.summary.canOperate && row.folioId ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                        >
                          <Link
                            to="/restaurant/pms/cashiering/folios/$folioId"
                            params={{ folioId: row.folioId }}
                            search={{ action: "payment" }}
                          >
                            Record payment
                          </Link>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-[#EFE9DF]/50 last:border-b-0">
      <span className="shrink-0 text-[#756A5B]">{label}</span>
      <span className="text-right font-medium text-[#251605]">{value ?? "—"}</span>
    </div>
  );
}
