import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Switch } from "@/shared/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import { propertySetupStatusLabel } from "@/packages/pms/lib/pms-property-setup-card1";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import {
  getCorporateCard3,
  saveContractRateCard3,
  saveCorporateAgreementCard3,
} from "@/packages/pms/lib/corporate-card3.functions";
import {
  CARD3_CORPORATE_TABS,
  CONTRACT_RATE_KIND_LABELS,
  CONTRACT_RATE_KINDS,
  type Card3CorporateTabId,
  type ContractRateKind,
  type ContractRateRow,
  type CorporateAgreementRow,
  type CorporateCard3AuditRow,
  type CorporateCard3Snapshot,
} from "@/packages/pms/lib/corporate-card3.server";

const goldFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2";

type AgreementInput = {
  restaurantId: string;
  id?: string;
  companyId: string;
  code: string;
  name: string;
  contractNumber: string;
  validFrom: string;
  validTo: string;
  currencyCode: string;
  description?: string;
  active: boolean;
};

type ContractRateInput = {
  restaurantId: string;
  id?: string;
  agreementId: string;
  roomTypeId: string;
  rateKind: ContractRateKind;
  amount: number;
  validFrom: string;
  validTo: string;
  active: boolean;
};

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

export function PmsPropertySetupCard3Corporate({
  restaurantId,
  canEdit,
  domain,
  onBack,
}: {
  restaurantId: string;
  canEdit: boolean;
  domain: Card3Domain;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(getCorporateCard3);
  const saveAgreement = useServerFn(saveCorporateAgreementCard3);
  const saveRate = useServerFn(saveContractRateCard3);
  const [tab, setTab] = useState<Card3CorporateTabId>("overview");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [selectedAgreementId, setSelectedAgreementId] = useState("all");
  const [agreementDraft, setAgreementDraft] = useState<CorporateAgreementRow | "new" | null>(null);
  const [rateDraft, setRateDraft] = useState<ContractRateRow | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-corporate", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: CorporateCard3Snapshot | undefined = query.data?.snapshot;
  const audit = (query.data?.audit ?? []) as CorporateCard3AuditRow[];
  const readiness = query.data?.readiness;
  const agreements = useMemo(() => snapshot?.agreements ?? [], [snapshot?.agreements]);
  const contractRates = useMemo(() => snapshot?.contractRates ?? [], [snapshot?.contractRates]);
  const companies = snapshot?.companies ?? [];
  const filteredAgreements = useMemo(
    () =>
      agreements.filter((row) =>
        matchesQuery(
          search,
          row.code,
          row.name,
          row.contractNumber,
          row.companyLabel,
          row.currencyCode,
        ),
      ),
    [agreements, search],
  );
  const filteredRates = useMemo(
    () =>
      contractRates.filter(
        (row) =>
          (selectedAgreementId === "all" || row.agreementId === selectedAgreementId) &&
          matchesQuery(
            search,
            row.agreementLabel,
            row.roomTypeLabel,
            row.rateKindLabel,
            String(row.amount),
          ),
      ),
    [contractRates, search, selectedAgreementId],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-corporate", restaurantId] });
  }

  const agreementMutation = useMutation({
    mutationFn: (input: AgreementInput) => saveAgreement({ data: input }),
    onSuccess: () => {
      toast.success("Corporate agreement saved.");
      setAgreementDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const rateMutation = useMutation({
    mutationFn: (input: ContractRateInput) => saveRate({ data: input }),
    onSuccess: () => {
      toast.success("Contract rate saved.");
      setRateDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const searchLabel =
    tab === "agreements" ? "Search corporate agreements" : "Search contract rates";

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Card3CorporateTabId)}>
      <PmsPropertySetupCard3Workspace
        domain={domain}
        onBack={onBack}
        onAuditHistory={() => setShowAudit((open) => !open)}
        tabs={
          <TabsList className="mb-1 flex h-auto flex-wrap">
            {CARD3_CORPORATE_TABS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className={goldFocus}
                data-testid={`card3-corporate-tab-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
        search={
          tab === "overview" ? null : (
            <div className="flex flex-wrap gap-2">
              {tab === "contract-rates" ? (
                <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
                  <SelectTrigger
                    className={`w-64 ${goldFocus}`}
                    aria-label="Filter contract rates by agreement"
                  >
                    <SelectValue placeholder="All agreements" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agreements</SelectItem>
                    {agreements.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.code} — {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchLabel}
                aria-label={searchLabel}
                className={`max-w-sm ${goldFocus}`}
              />
            </div>
          )
        }
        drawer={
          showAudit ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="font-display text-lg text-[#251605]">Audit History</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {audit.length === 0 ? (
                  <li className="text-muted-foreground">
                    No corporate or contract-rate changes recorded yet.
                  </li>
                ) : (
                  audit.map((row) => (
                    <li key={row.id}>
                      <p className="font-medium text-[#251605]">{row.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.detail ? `${row.detail} · ` : ""}
                        {row.createdAt}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null
        }
      >
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading corporate and contract rates…</p>
        ) : query.isError || !snapshot ? (
          <p className="text-sm text-destructive">
            {(query.error as Error | undefined)?.message ??
              "Corporate & Contract Rates are unavailable."}
          </p>
        ) : (
          <div className="space-y-4" data-testid="pms-card3-corporate">
            {tab === "overview" ? (
              <div className="space-y-4">
                <p className="rounded-xl border border-[#E6D7B8] bg-[#f7f4ef] p-4 text-sm text-[#251605]">
                  Companies are inherited from Guest Profile. Room types are inherited from Card 2.
                  Currencies come from Card 1 base plus Card 3 supported currencies. Authorized bookers are out of this workspace.
                </p>
                <p className="rounded-xl border border-[#E6D7B8] bg-white p-4 text-sm text-muted-foreground">
                  Payment terms and credit notes below are inherited read-only from Guest Profile.
                  They are not stored on Corporate Agreements. This configuration makes no reservation or folio operational changes.
                </p>
                <ul className="space-y-2 text-sm">
                  {companies.length === 0 ? (
                    <li className="text-muted-foreground">No Guest Profile companies yet.</li>
                  ) : (
                    companies.map((row) => (
                      <li key={row.id} className="rounded-xl border border-border bg-white p-3">
                        <p className="font-medium text-[#251605]">
                          {row.code} — {row.name}
                        </p>
                        <p className="text-muted-foreground">
                          Inherited payment terms: {row.paymentTerms || "—"} · Inherited credit
                          note: {row.creditLimitNote || "—"}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
                <p className="text-sm font-medium text-[#251605]">
                  Domain status: {propertySetupStatusLabel(readiness?.status ?? "not_started")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {agreements.length} agreements · {contractRates.length} contract rates
                </p>
                {(readiness?.blockers ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {readiness?.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "agreements" ? (
              <CatalogueTable
                canEdit={canEdit}
                addLabel="Add corporate agreement"
                addDisabled={companies.length === 0}
                onAdd={() => setAgreementDraft("new")}
                columns={[
                  "Code",
                  "Name",
                  "Company",
                  "Contract no.",
                  "Dates",
                  "Currency",
                  "Status",
                ]}
                empty="No corporate agreements saved yet."
                rows={filteredAgreements.map((row) => ({
                  id: row.id,
                  cells: [
                    row.code,
                    row.name,
                    row.companyLabel || "—",
                    row.contractNumber,
                    `${row.validFrom} → ${row.validTo}`,
                    row.currencyCode,
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setAgreementDraft(row),
                }))}
              />
            ) : null}

            {tab === "contract-rates" ? (
              <CatalogueTable
                canEdit={canEdit}
                addLabel="Add contract rate"
                addDisabled={agreements.length === 0 || (snapshot.roomTypes?.length ?? 0) === 0}
                onAdd={() => setRateDraft("new")}
                columns={[
                  "Agreement",
                  "Room type (Card 2)",
                  "Kind",
                  "Amount",
                  "Dates",
                  "Status",
                ]}
                empty="No matching contract rates."
                rows={filteredRates.map((row) => ({
                  id: row.id,
                  cells: [
                    row.agreementLabel,
                    row.roomTypeLabel,
                    row.rateKindLabel,
                    String(row.amount),
                    `${row.validFrom} → ${row.validTo}`,
                    row.active ? "Active" : "Inactive",
                  ],
                  onEdit: () => setRateDraft(row),
                }))}
              />
            ) : null}

            <AgreementSheet
              key={
                agreementDraft === "new"
                  ? "agreement-new"
                  : (agreementDraft?.id ?? "agreement-closed")
              }
              open={agreementDraft !== null}
              canEdit={canEdit}
              companies={companies}
              currencies={snapshot.currencies}
              value={
                agreementDraft === "new" || agreementDraft === null ? null : agreementDraft
              }
              pending={agreementMutation.isPending}
              onClose={() => setAgreementDraft(null)}
              onSave={(payload) => agreementMutation.mutate({ restaurantId, ...payload })}
            />
            <ContractRateSheet
              key={rateDraft === "new" ? "rate-new" : (rateDraft?.id ?? "rate-closed")}
              open={rateDraft !== null}
              canEdit={canEdit}
              agreements={agreements}
              roomTypes={snapshot.roomTypes}
              initialAgreementId={selectedAgreementId === "all" ? undefined : selectedAgreementId}
              value={rateDraft === "new" || rateDraft === null ? null : rateDraft}
              pending={rateMutation.isPending}
              onClose={() => setRateDraft(null)}
              onSave={(payload) => rateMutation.mutate({ restaurantId, ...payload })}
            />
          </div>
        )}
      </PmsPropertySetupCard3Workspace>
    </Tabs>
  );
}

function CatalogueTable({
  canEdit,
  addLabel,
  addDisabled,
  empty,
  columns,
  rows,
  onAdd,
}: {
  canEdit: boolean;
  addLabel: string;
  addDisabled?: boolean;
  empty: string;
  columns: string[];
  rows: { id: string; cells: string[]; onEdit: () => void }[];
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {canEdit ? (
        <Button
          type="button"
          disabled={addDisabled}
          onClick={onAdd}
          className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
        >
          {addLabel}
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b bg-[#f7f4ef] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2">
                  {column}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id}-${index}`} className="px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={goldFocus}
                        onClick={row.onEdit}
                      >
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActiveField({
  id,
  active,
  canEdit,
  onChange,
}: {
  id: string;
  active: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2">
      <Label htmlFor={id}>Active</Label>
      <Switch
        id={id}
        checked={active}
        disabled={!canEdit}
        onCheckedChange={onChange}
        className={goldFocus}
      />
    </div>
  );
}

function AgreementSheet({
  open,
  canEdit,
  companies,
  currencies,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  companies: CorporateCard3Snapshot["companies"];
  currencies: CorporateCard3Snapshot["currencies"];
  value: CorporateAgreementRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<AgreementInput, "restaurantId">) => void;
}) {
  const defaultCurrency = currencies.find((row) => row.isBase)?.code ?? currencies[0]?.code ?? "";
  const [companyId, setCompanyId] = useState(value?.companyId ?? companies[0]?.id ?? "");
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [contractNumber, setContractNumber] = useState(value?.contractNumber ?? "");
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [currencyCode, setCurrencyCode] = useState(value?.currencyCode || defaultCurrency);
  const [description, setDescription] = useState(value?.description ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const selectedCompany = companies.find((row) => row.id === companyId);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit corporate agreement" : "Add corporate agreement"}</SheetTitle>
          <SheetDescription>
            Company identity stays on Guest Profile. Payment terms are not stored here.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({
              ...(value ? { id: value.id } : {}),
              companyId,
              code,
              name,
              contractNumber,
              validFrom,
              validTo,
              currencyCode,
              description,
              active,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="agreement-company">Company</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={!canEdit}>
              <SelectTrigger id="agreement-company" className={goldFocus}>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCompany ? (
              <p className="text-xs text-muted-foreground">
                Inherited payment terms: {selectedCompany.paymentTerms || "—"} · Inherited credit
                note: {selectedCompany.creditLimitNote || "—"}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-code">Code</Label>
            <Input
              id="agreement-code"
              value={code}
              maxLength={20}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-name">Name</Label>
            <Input
              id="agreement-name"
              value={name}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-number">Contract number</Label>
            <Input
              id="agreement-number"
              value={contractNumber}
              maxLength={40}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setContractNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-from">Valid from</Label>
            <Input
              id="agreement-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-to">Valid to</Label>
            <Input
              id="agreement-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-currency">Currency</Label>
            <Select value={currencyCode} onValueChange={setCurrencyCode} disabled={!canEdit}>
              <SelectTrigger id="agreement-currency" className={goldFocus}>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.code}
                    {row.isBase ? " (base)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="agreement-description">Description</Label>
            <Textarea
              id="agreement-description"
              value={description}
              maxLength={500}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <ActiveField id="agreement-active" active={active} canEdit={canEdit} onChange={setActive} />
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
            >
              Save corporate agreement
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContractRateSheet({
  open,
  canEdit,
  agreements,
  roomTypes,
  initialAgreementId,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  agreements: CorporateAgreementRow[];
  roomTypes: CorporateCard3Snapshot["roomTypes"];
  initialAgreementId?: string;
  value: ContractRateRow | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: Omit<ContractRateInput, "restaurantId">) => void;
}) {
  const [agreementId, setAgreementId] = useState(
    value?.agreementId ?? initialAgreementId ?? agreements[0]?.id ?? "",
  );
  const [roomTypeId, setRoomTypeId] = useState(value?.roomTypeId ?? roomTypes[0]?.id ?? "");
  const [rateKind, setRateKind] = useState<ContractRateKind>(value?.rateKind ?? "negotiated");
  const [amount, setAmount] = useState(String(value?.amount ?? 0));
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? "");
  const [validTo, setValidTo] = useState(value?.validTo ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const agreement = agreements.find((row) => row.id === agreementId);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{value ? "Edit contract rate" : "Add contract rate"}</SheetTitle>
          <SheetDescription>
            Amount is a setup figure in the agreement currency. Room types stay on Card 2.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            onSave({
              ...(value ? { id: value.id } : {}),
              agreementId,
              roomTypeId,
              rateKind,
              amount: Number(amount),
              validFrom,
              validTo,
              active,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="rate-agreement">Agreement</Label>
            <Select value={agreementId} onValueChange={setAgreementId} disabled={!canEdit}>
              <SelectTrigger id="rate-agreement" className={goldFocus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agreements.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-room">Room type (Card 2)</Label>
            <Select value={roomTypeId} onValueChange={setRoomTypeId} disabled={!canEdit}>
              <SelectTrigger id="rate-room" className={goldFocus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-kind">Rate kind</Label>
            <Select
              value={rateKind}
              onValueChange={(next) => setRateKind(next as ContractRateKind)}
              disabled={!canEdit}
            >
              <SelectTrigger id="rate-kind" className={goldFocus}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_RATE_KINDS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CONTRACT_RATE_KIND_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-amount">Amount ({agreement?.currencyCode || "currency"})</Label>
            <Input
              id="rate-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-from">Valid from</Label>
            <Input
              id="rate-from"
              type="date"
              value={validFrom}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-to">Valid to</Label>
            <Input
              id="rate-to"
              type="date"
              value={validTo}
              disabled={!canEdit}
              className={goldFocus}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
          <ActiveField id="rate-active" active={active} canEdit={canEdit} onChange={setActive} />
          {canEdit ? (
            <Button
              type="submit"
              disabled={pending}
              className={`bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90 ${goldFocus}`}
            >
              Save contract rate
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
