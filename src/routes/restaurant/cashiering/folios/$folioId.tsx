import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getFolio } from "@/packages/pms/lib/cashiering.functions";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import { FolioStatusBadge, labelTransactionType, splitLedger } from "@/packages/pms/components/cashiering/folio-bits";
import { CloseFolioDialog, FolioEntryDialog } from "@/packages/pms/components/cashiering/folio-dialogs";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/cashiering/folios/$folioId")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: `/restaurant/cashiering/folios/${params.folioId}` },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Guest Folio — NORU" },
      { name: "description", content: "Guest folio ledger, charges, payments and statement in NORU." },
      { property: "og:title", content: "Guest Folio — NORU" },
      { property: "og:description", content: "Folio ledger, balance and printable statement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FolioRoute,
});

function FolioRoute() {
  const { folioId } = Route.useParams();
  return (
    <RestaurantShell active="Folios">{(m) => <FolioPage membership={m} folioId={folioId} />}</RestaurantShell>
  );
}

function FolioPage({ membership, folioId }: { membership: RestaurantMembership; folioId: string }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const fetchFolio = useServerFn(getFolio);
  const query = useQuery({
    queryKey: ["folio", restaurantId, folioId],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId } }),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folioId] });
    void queryClient.invalidateQueries({ queryKey: ["folios", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
  };

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading folio…</p>;
  if (query.isError) return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  const folio = query.data;
  if (!folio) return <p className="text-sm text-muted-foreground">Folio not found for this property.</p>;

  const { charges, credits } = splitLedger(folio.transactions);
  const isOpen = folio.status === "open";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/restaurant/cashiering" search={{ tab: "folios" }}>
              <ArrowLeft className="size-4" /> Back to folios
            </Link>
          </Button>
          <h1 className="mt-1 font-display text-2xl">
            {folio.folioNumber} · {folio.guestName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {folio.confirmationNumber ? `Reservation ${folio.confirmationNumber} · ` : ""}
            Opened {dateTime(folio.openedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FolioStatusBadge status={folio.status} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print statement
          </Button>
        </div>
      </div>

      {isOpen ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button size="sm" onClick={() => setEntryType("charge")}>
            Post charge
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryType("payment")}>
            Receive payment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryType("deposit")}>
            Add deposit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryType("refund")}>
            Refund
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryType("discount")}>
            Discount
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEntryType("adjustment")}>
            Adjustment
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCloseOpen(true)}>
            Close folio
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This folio was closed {folio.closedAt ? dateTime(folio.closedAt) : ""}. The ledger is final.
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <LedgerTable title="Charges" rows={charges} money={money} dateTime={dateTime} />
          <LedgerTable title="Payments & credits" rows={credits} money={money} dateTime={dateTime} />
        </div>

        <aside className="h-fit space-y-2 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg">Summary</h2>
          <Row label="Total charges" value={money(folio.charges)} />
          <Row label="Total credits" value={money(folio.credits)} />
          <div className="border-t border-border pt-2">
            <Row label="Balance due" value={money(folio.balance)} strong />
          </div>
          <div className="pt-3 text-sm text-muted-foreground">
            <p>{folio.guestEmail ?? "No email on file"}</p>
            <p>{folio.guestPhone ?? "No phone on file"}</p>
            {folio.arrivalDate ? (
              <p className="mt-2">
                Stay {folio.arrivalDate} → {folio.departureDate}
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      <FolioEntryDialog
        restaurantId={restaurantId}
        folioId={folio.id}
        type={entryType}
        open={entryType !== null}
        onClose={() => setEntryType(null)}
        onDone={refresh}
      />
      <CloseFolioDialog
        restaurantId={restaurantId}
        folioId={folio.id}
        balance={folio.balance}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onDone={refresh}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-display text-lg" : "font-medium"}>{value}</span>
    </div>
  );
}

function LedgerTable({
  title,
  rows,
  money,
  dateTime,
}: {
  title: string;
  rows: { id: string; type: string; description: string; amount: number; postedAt: string }[];
  money: (v: number) => string;
  dateTime: (iso: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing posted yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Posted</th>
              <th className="p-3">Type</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">{dateTime(t.postedAt)}</td>
                <td className="p-3">{labelTransactionType(t.type)}</td>
                <td className="p-3">{t.description}</td>
                <td className="p-3 text-right font-medium">{money(Math.abs(t.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
