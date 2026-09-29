import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Coins,
  Download,
  ExternalLink,
  Filter,
  Lock,
  Printer,
  Receipt,
  Search,
} from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
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
import { getGroupFinancials } from "@/packages/pms/lib/guest-group-detail.functions";

export function GuestGroupFinancialView({
  restaurantId,
  groupId,
}: {
  restaurantId: string;
  groupId: string;
}) {
  const load = useServerFn(getGroupFinancials);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const query = useQuery({
    queryKey: ["group-financials", restaurantId, groupId],
    queryFn: () => load({ data: { restaurantId, groupId } }),
  });

  const data = query.data;

  const rows = useMemo(() => {
    const items = data?.transactions ?? [];
    const term = searchQuery.trim().toLowerCase();
    return items.filter((row) => {
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!term) return true;
      return [row.description, row.guestName, row.confirmationNumber, row.folioId]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(term));
    });
  }, [data, searchQuery, categoryFilter]);

  const extras = useMemo(() => {
    const source = data?.transactions ?? [];
    return {
      room: source.filter((r) => r.category === "room").reduce((sum, r) => sum + r.amount, 0),
      payment: source.filter((r) => r.category === "payment").reduce((sum, r) => sum + Math.abs(r.amount), 0),
      other: source.filter((r) => r.category === "other").reduce((sum, r) => sum + r.amount, 0),
    };
  }, [data]);

  function exportStatementCsv() {
    const headers = [
      "Date",
      "Guest",
      "Reservation Conf",
      "Folio ID",
      "Description",
      "Transaction Type",
      "Category",
      "Amount",
      "Folio Status",
    ];
    const body = rows.map((row) => [
      `"${row.date.slice(0, 10)}"`,
      `"${(row.guestName || "").replace(/"/g, '""')}"`,
      `"${row.confirmationNumber || ""}"`,
      `"${row.folioId || ""}"`,
      `"${row.description.replace(/"/g, '""')}"`,
      `"${row.transactionType}"`,
      `"${row.category}"`,
      row.amount.toFixed(2),
      `"${row.folioStatus}"`,
    ]);

    const csvContent = [headers.join(","), ...body.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `group-statement-${groupId.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading financial summary…</p>;
  }

  return (
    <div className="space-y-6" data-testid="group-financial-view">
      {/* Header Info */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">
            Derived Financial Summary
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            All financial figures and transactions are dynamically derived from linked reservation folios.
            Group Folios and Group Ledgers do not exist; linked folios are the single source of financial truth.
          </p>
        </div>

        {data?.folioAccess && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportStatementCsv}
              disabled={rows.length === 0}
              className="gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Statement CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        )}
      </div>

      {!data?.folioAccess ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">Folio Access Restricted</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Folio financial amounts and transactions are hidden for your current role. Cashiering access is required.
          </p>
        </div>
      ) : (
        <>
          {/* 4 Primary Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Estimated Revenue
              </p>
              <p className="mt-1 text-2xl font-bold font-display text-foreground">
                ${data.summary.estimatedRevenue.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Folio Charges
              </p>
              <p className="mt-1 text-2xl font-bold font-display text-foreground">
                ${data.summary.totalCharges.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Folio Payments
              </p>
              <p className="mt-1 text-2xl font-bold font-display text-emerald-600">
                ${data.summary.totalPayments.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Outstanding Across Linked Folios
              </p>
              <p className={`mt-1 text-2xl font-bold font-display ${data.summary.outstandingBalance > 0 ? "text-amber-600" : "text-foreground"}`}>
                ${data.summary.outstandingBalance.toFixed(2)}
              </p>
            </div>
          </div>

          {/* 3 Category Breakdown Subtotals */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Room Charges</span>
              <span className="font-semibold text-sm text-foreground">${extras.room.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Other / Ancillary</span>
              <span className="font-semibold text-sm text-foreground">${extras.other.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Payments Received</span>
              <span className="font-semibold text-sm text-emerald-600">${extras.payment.toFixed(2)}</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search guest, confirmation, folio…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px] text-xs">
                  <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Folio-Derived Transactions Table */}
          <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold text-xs">Date</TableHead>
                  <TableHead className="font-semibold text-xs">Guest / Reservation</TableHead>
                  <TableHead className="font-semibold text-xs">Folio Link</TableHead>
                  <TableHead className="font-semibold text-xs">Description</TableHead>
                  <TableHead className="font-semibold text-xs">Category</TableHead>
                  <TableHead className="font-semibold text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={`${row.folioId}-${idx}`} className="hover:bg-muted/20">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.date.slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{row.guestName || "—"}</p>
                      {row.confirmationNumber && (
                        <p className="text-xs font-mono text-muted-foreground">{row.confirmationNumber}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.folioId ? (
                        <Link
                          to="/restaurant/pms/cashiering/folios/$folioId"
                          params={{ folioId: row.folioId }}
                          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        >
                          Folio {row.folioId.slice(0, 8)}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-foreground max-w-xs truncate">
                      {row.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {row.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          row.category === "payment"
                            ? "text-emerald-600"
                            : "text-foreground"
                        }`}
                      >
                        {row.category === "payment" ? "-" : ""}${Math.abs(row.amount).toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No folio transactions found.</p>
                      <p className="text-xs text-muted-foreground">
                        Transactions posted to linked reservation folios will automatically reflect here.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
