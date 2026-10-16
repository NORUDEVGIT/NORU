import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3InheritedStrip,
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
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
  type ContractRateKind,
  type ContractRateRow,
  type CorporateAgreementRow,
  type CorporateCard3Snapshot,
} from "@/packages/pms/lib/corporate-card3.server";
import {
  listPmsContractTypes,
  savePmsContractType,
  setPmsContractTypeActive,
} from "@/packages/pms/lib/corporate-contracts.functions";
import type { ContractTypeRecord } from "@/packages/pms/lib/corporate-contracts.server";

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
  const fetchContractTypes = useServerFn(listPmsContractTypes);
  const saveContractTypeFn = useServerFn(savePmsContractType);
  const toggleContractTypeFn = useServerFn(setPmsContractTypeActive);

  const [agreementSearch, setAgreementSearch] = useState("");
  const [rateSearch, setRateSearch] = useState("");
  const [contractTypeSearch, setContractTypeSearch] = useState("");
  const [selectedAgreementId, setSelectedAgreementId] = useState("all");
  const [agreementDraft, setAgreementDraft] = useState<CorporateAgreementRow | "new" | null>(null);
  const [rateDraft, setRateDraft] = useState<ContractRateRow | "new" | null>(null);
  const [contractTypeDraft, setContractTypeDraft] = useState<ContractTypeRecord | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-corporate", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: CorporateCard3Snapshot | undefined = query.data?.snapshot;
  const agreements = useMemo(() => snapshot?.agreements ?? [], [snapshot?.agreements]);
  const contractRates = useMemo(() => snapshot?.contractRates ?? [], [snapshot?.contractRates]);
  const companies = snapshot?.companies ?? [];
  const filteredAgreements = useMemo(
    () =>
      agreements.filter((row) =>
        matchesQuery(
          agreementSearch,
          row.code,
          row.name,
          row.contractNumber,
          row.companyLabel,
          row.currencyCode,
        ),
      ),
    [agreements, agreementSearch],
  );
  const filteredRates = useMemo(
    () =>
      contractRates.filter(
        (row) =>
          (selectedAgreementId === "all" || row.agreementId === selectedAgreementId) &&
          matchesQuery(
            rateSearch,
            row.agreementLabel,
            row.roomTypeLabel,
            row.rateKindLabel,
            String(row.amount),
          ),
      ),
    [contractRates, rateSearch, selectedAgreementId],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-corporate", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-contract-types", restaurantId] });
  }

  const contractTypesQuery = useQuery({
    queryKey: ["pms-contract-types", restaurantId],
    queryFn: () => fetchContractTypes({ data: { restaurantId } }),
  });
  const contractTypes = useMemo(() => contractTypesQuery.data ?? [], [contractTypesQuery.data]);
  const filteredContractTypes = useMemo(
    () =>
      contractTypes.filter((row) =>
        matchesQuery(contractTypeSearch, row.code, row.name, row.description ?? ""),
      ),
    [contractTypes, contractTypeSearch],
  );

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

  const contractTypeMutation = useMutation({
    mutationFn: (draft: { id?: string; code: string; name: string; description?: string; displayOrder: number; active: boolean }) =>
      saveContractTypeFn({ data: { restaurantId, draft } }),
    onSuccess: () => {
      toast.success("Contract type saved.");
      setContractTypeDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  void CARD3_CORPORATE_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading corporate and contract rates…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ??
            "Corporate & Contract Rates are unavailable."}
        </p>
      ) : (
        <div className="space-y-4" data-testid="pms-card3-corporate">
          <Card3InheritedStrip>
            Companies are inherited from Guest Profile. Room types are inherited from Card 2.
            Currencies come from Card 1 base plus Card 3 supported currencies. Authorized bookers
            are out of this workspace.
            <p className="mt-2">
              Payment terms and credit notes below are inherited read-only from Guest Profile. They
              are not stored on Corporate Agreements. This configuration makes no reservation or
              folio operational changes.
            </p>
            <ul className="space-y-2 text-sm">
              {companies.length === 0 ? (
                <li className="text-muted-foreground">No Guest Profile companies yet.</li>
              ) : (
                companies.map((row) => (
                  <li key={row.id} className="py-1">
                    <p className="font-medium text-[#251605]">
                      {row.code} — {row.name}
                    </p>
                    <p className="text-muted-foreground">
                      Inherited payment terms: {row.paymentTerms || "—"} · Inherited credit note:{" "}
                      {row.creditLimitNote || "—"}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </Card3InheritedStrip>

          <Card3ListSection
            title="Corporate agreements"
            icon="facility"
            search={agreementSearch}
            onSearch={setAgreementSearch}
            placeholder="Search corporate agreements"
            canEdit={canEdit}
            addLabel="Add corporate agreement"
            onAdd={() => setAgreementDraft("new")}
            columns={["Code", "Name", "Company", "Contract no.", "Dates", "Currency", "Status"]}
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
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setAgreementDraft(row),
            }))}
          />

          <div className="space-y-2">
            <Label htmlFor="filter-contract-rates">Filter contract rates by agreement</Label>
            <Select value={selectedAgreementId} onValueChange={setSelectedAgreementId}>
              <SelectTrigger id="filter-contract-rates" className={goldFocus}>
                <SelectValue />
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
          </div>
          <Card3ListSection
            title="Contract rates"
            icon="money"
            search={rateSearch}
            onSearch={setRateSearch}
            placeholder="Search contract rates"
            canEdit={canEdit}
            addLabel="Add contract rate"
            onAdd={() => setRateDraft("new")}
            columns={["Agreement", "Room type (Card 2)", "Kind", "Amount", "Dates", "Status"]}
            empty="No matching contract rates."
            rows={filteredRates.map((row) => ({
              id: row.id,
              cells: [
                row.agreementLabel,
                row.roomTypeLabel,
                row.rateKindLabel,
                String(row.amount),
                `${row.validFrom} → ${row.validTo}`,
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setRateDraft(row),
            }))}
          />

          <Card3ListSection
            title="Contract types"
            icon="facility"
            search={contractTypeSearch}
            onSearch={setContractTypeSearch}
            placeholder="Search contract types"
            canEdit={canEdit}
            addLabel="Add contract type"
            onAdd={() => setContractTypeDraft("new")}
            columns={["Code", "Name", "Description", "Display order", "Status"]}
            empty="No contract types saved yet."
            rows={filteredContractTypes.map((row) => ({
              id: row.id,
              cells: [
                row.code,
                row.name,
                row.description || "—",
                String(row.displayOrder),
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setContractTypeDraft(row),
            }))}
          />

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
            value={agreementDraft === "new" || agreementDraft === null ? null : agreementDraft}
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
            {...(selectedAgreementId === "all" ? {} : { initialAgreementId: selectedAgreementId })}
            value={rateDraft === "new" || rateDraft === null ? null : rateDraft}
            pending={rateMutation.isPending}
            onClose={() => setRateDraft(null)}
            onSave={(payload) => rateMutation.mutate({ restaurantId, ...payload })}
          />
          <ContractTypeSheet
            open={contractTypeDraft !== null}
            canEdit={canEdit}
            value={contractTypeDraft === "new" || contractTypeDraft === null ? null : contractTypeDraft}
            pending={contractTypeMutation.isPending}
            onClose={() => setContractTypeDraft(null)}
            onSave={contractTypeMutation.mutate}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
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
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit corporate agreement" : "Add corporate agreement"}
      description="Company identity stays on Guest Profile. Payment terms are not stored here."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save corporate agreement"
      onSubmit={() =>
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
        })
      }
    >
      <div className="space-y-3">
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
      </div>
    </Card3OverlapSheet>
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
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit contract rate" : "Add contract rate"}
      description="Amount is a setup figure in the agreement currency. Room types stay on Card 2."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save contract rate"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          agreementId,
          roomTypeId,
          rateKind,
          amount: Number(amount),
          validFrom,
          validTo,
          active,
        })
      }
    >
      <div className="space-y-3">
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
      </div>
    </Card3OverlapSheet>
  );
}

function ContractTypeSheet({
  open,
  canEdit,
  value,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: ContractTypeRecord | null;
  pending: boolean;
  onClose: () => void;
  onSave: (payload: { id?: string; code: string; name: string; description?: string; displayOrder: number; active: boolean }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(value?.displayOrder ?? 0));
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit contract type" : "Add contract type"}
      description="Property-specific catalogue of contract types used by Corporate Agreements."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save contract type"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          displayOrder: Number(displayOrder) || 0,
          active,
        })
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="type-code">Code</Label>
          <Input
            id="type-code"
            value={code}
            maxLength={30}
            disabled={!canEdit}
            className={goldFocus}
            placeholder="e.g. CORP, VOLUME, CREW"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="type-name">Name</Label>
          <Input
            id="type-name"
            value={name}
            maxLength={120}
            disabled={!canEdit}
            className={goldFocus}
            placeholder="e.g. Corporate Rate Agreement"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="type-description">Description</Label>
          <Textarea
            id="type-description"
            value={description}
            maxLength={500}
            disabled={!canEdit}
            className={goldFocus}
            placeholder="Optional description of contract terms or target client type"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="type-order">Display order</Label>
          <Input
            id="type-order"
            type="number"
            min={0}
            value={displayOrder}
            disabled={!canEdit}
            className={goldFocus}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </div>
        <ActiveField id="type-active" active={active} canEdit={canEdit} onChange={setActive} />
      </div>
    </Card3OverlapSheet>
  );
}
