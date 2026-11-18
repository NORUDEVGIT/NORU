import { useMemo, useState, type ReactNode } from "react";
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
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { PmsPropertySetupCard3Workspace } from "@/packages/pms/components/settings/pms-property-setup-card3-workspace";
import {
  Card3ListSection,
  Card3OverlapSheet,
  Card3StatusDot,
} from "@/packages/pms/components/settings/pms-property-setup-card3-primitives";
import type { Card3Domain } from "@/packages/pms/lib/pms-property-setup-card3";
import { CARD6_HREF } from "@/packages/pms/lib/pms-property-setup-card6";
import { PROPERTY_SETUP_CONTROL_CLASS, PROPERTY_SETUP_TEXTAREA_CLASS } from "@/packages/pms/lib/pms-property-setup-ui";
import { suggestPaymentMethodCode } from "@/packages/pms/lib/payments-card3-code";
import { taxSetupCodeIsTaken } from "@/packages/pms/lib/taxes-card3-code";
import {
  getPaymentsCard3,
  savePaymentMethodCard3,
} from "@/packages/pms/lib/payments-card3.functions";
import {
  CARD3_PAYMENTS_TABS,
  DEPOSIT_POLICY_TYPE_LABELS,
  DEPOSIT_POLICY_TYPES,
  PAYMENT_PROCESSING_MODE_LABELS,
  PAYMENT_PROCESSING_MODES,
  PAYMENT_TYPE_CLASS_LABELS,
  PAYMENT_TYPE_CLASSES,
  type DepositPolicyCard3Row,
  type DepositPolicyType,
  type PaymentIntegrationOption,
  type PaymentMethodCard3Row,
  type PaymentProcessingMode,
  type PaymentTypeClass,
  type PaymentsCard3Snapshot,
} from "@/packages/pms/lib/payments-card3.server";

/** Rectangular NORU field — match Rate Plan / Taxes treatment. */
const PAY_FIELD_CLASS = cn(
  PROPERTY_SETUP_CONTROL_CLASS,
  "h-9 rounded-[6px] shadow-none focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const PAY_SELECT_CLASS = cn(PAY_FIELD_CLASS, "justify-between [&>span]:line-clamp-1");

const PAY_SELECT_CONTENT_CLASS = "z-[100] rounded-[6px] border border-[#E6E1D8]";

const PAY_TEXTAREA_CLASS = cn(
  PROPERTY_SETUP_TEXTAREA_CLASS,
  "min-h-[4.5rem] rounded-[6px] shadow-none focus:border-[#C89933] focus:outline-none focus:ring-1 focus:ring-[#C89933]",
);

const PAY_TOGGLE_ROW_CLASS =
  "flex items-center justify-between rounded-[6px] border border-[#E6E1D8] bg-white px-3 py-2";

const PAY_CODE_CONFLICT =
  "That code is already used. Change the name to generate a different one.";

type PaymentMethodInput = {
  restaurantId: string;
  id?: string;
  code: string;
  name: string;
  typeClass?: PaymentTypeClass | "";
  notes?: string;
  active: boolean;
};

function matchesQuery(query: string, ...values: string[]) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value.toLowerCase().includes(normalized));
}

function readIssueMessages(raw: string): string | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const issues = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(issues) || issues.length === 0) return null;
    const messages = issues
      .map((issue) => (typeof issue?.message === "string" ? issue.message.trim() : ""))
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : "Please check the form and try again.";
  } catch {
    return null;
  }
}

function SetupField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[#251605]">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {!error && hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PmsPropertySetupCard3Payments({
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
  const load = useServerFn(getPaymentsCard3);
  const saveMethod = useServerFn(savePaymentMethodCard3);

  const [methodSearch, setMethodSearch] = useState("");
  const [methodDraft, setMethodDraft] = useState<PaymentMethodCard3Row | "new" | null>(null);

  const query = useQuery({
    queryKey: ["pms-card3-payments", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const snapshot: PaymentsCard3Snapshot | undefined = query.data?.snapshot;
  const paymentMethods = useMemo(() => snapshot?.paymentMethods ?? [], [snapshot?.paymentMethods]);
  const paymentIntegrations = useMemo(
    () => snapshot?.paymentIntegrations ?? [],
    [snapshot?.paymentIntegrations],
  );
  const filteredMethods = useMemo(
    () =>
      paymentMethods.filter((row) =>
        matchesQuery(
          methodSearch,
          row.code,
          row.name,
          row.typeClassLabel,
          row.notes,
          PAYMENT_PROCESSING_MODE_LABELS[row.processingMode ?? "manual"],
          row.providerLabel ?? "",
        ),
      ),
    [paymentMethods, methodSearch],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-card3-payments", restaurantId] });
  }

  function friendlyValidationError(error: Error): string {
    const raw = error.message?.trim() ?? "";
    const issues = readIssueMessages(raw);
    if (issues) return issues;
    if (/duplicate key|unique constraint|already used|23505/i.test(raw)) {
      return PAY_CODE_CONFLICT;
    }
    if (/check constraint|invalid input|zod/i.test(raw)) {
      return "Please check the form and try again.";
    }
    return raw || "Please check the form and try again.";
  }

  const methodMutation = useMutation({
    mutationFn: (input: PaymentMethodInput) => saveMethod({ data: input }),
    onSuccess: () => {
      toast.success("Payment method saved.");
      setMethodDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(friendlyValidationError(error)),
  });

  void CARD3_PAYMENTS_TABS;

  return (
    <PmsPropertySetupCard3Workspace domain={domain}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      ) : query.isError || !snapshot ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Payments are unavailable."}
        </p>
      ) : (
        <div className="space-y-3" data-testid="pms-card3-payments">
          <p className="text-sm text-muted-foreground">
            Configure payment methods accepted for guest charges. Deposit policies are managed in
            Rate Plan → Policies.
          </p>
          <Card3ListSection
            title="Payment methods"
            icon="payment"
            search={methodSearch}
            onSearch={setMethodSearch}
            placeholder="Search payment methods"
            canEdit={canEdit}
            addLabel="Add payment method"
            onAdd={() => setMethodDraft("new")}
            columns={["Name", "Code", "Type", "Processing", "Provider", "Status"]}
            empty="No payment methods saved yet."
            rows={filteredMethods.map((row) => ({
              id: row.id,
              cells: [
                row.name,
                row.code,
                row.typeClassLabel,
                PAYMENT_PROCESSING_MODE_LABELS[row.processingMode ?? "manual"],
                row.providerLabel || "—",
                <Card3StatusDot active={row.active} />,
              ],
              onEdit: () => setMethodDraft(row),
            }))}
          />

          <PaymentMethodSheet
            key={methodDraft === "new" ? "method-new" : (methodDraft?.id ?? "method-closed")}
            open={methodDraft !== null}
            canEdit={canEdit}
            value={methodDraft === "new" || methodDraft === null ? null : methodDraft}
            existingCodes={paymentMethods.map((row) => row.code)}
            paymentIntegrations={paymentIntegrations}
            pending={methodMutation.isPending}
            onClose={() => setMethodDraft(null)}
            onSave={(payload) => methodMutation.mutate({ restaurantId, ...payload })}
          />
        </div>
      )}
    </PmsPropertySetupCard3Workspace>
  );
}

function ActiveField({
  id,
  label,
  checked,
  canEdit,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={PAY_TOGGLE_ROW_CLASS}>
      <Label htmlFor={id} className="text-[#251605]">
        {label}
      </Label>
      <Switch id={id} checked={checked} disabled={!canEdit} onCheckedChange={onChange} />
    </div>
  );
}

function PaymentMethodSheet({
  open,
  canEdit,
  value,
  existingCodes,
  paymentIntegrations,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  value: PaymentMethodCard3Row | null;
  existingCodes: string[];
  paymentIntegrations: PaymentIntegrationOption[];
  pending: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    typeClass?: PaymentTypeClass | "";
    notes?: string;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState(value?.name ?? "");
  const [typeClass, setTypeClass] = useState<PaymentTypeClass | "">(value?.typeClass || "");
  const [processingMode, setProcessingMode] = useState<PaymentProcessingMode>(
    value?.processingMode ?? "manual",
  );
  const [providerIntegrationId, setProviderIntegrationId] = useState(
    value?.providerIntegrationId ?? "",
  );
  const [notes, setNotes] = useState(value?.notes ?? "");
  const [active, setActive] = useState(value?.active ?? true);
  const [typeTouched, setTypeTouched] = useState(false);

  const code = value ? value.code : suggestPaymentMethodCode(name);
  const codeConflict = !value && taxSetupCodeIsTaken(code, existingCodes, value?.code);
  const typeMissing = !typeClass;
  const showTypeError = typeTouched && typeMissing;
  const showProviderField = processingMode === "integrated";
  const hasPaymentIntegrations = paymentIntegrations.length > 0;

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      title={value ? "Edit payment method" : "Add payment method"}
      description="Operational tender for guest charges. Gateway credentials stay in Connectivity."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save payment method"
      onSubmit={() => {
        setTypeTouched(true);
        if (!name.trim() || !code.trim()) {
          toast.error("Enter a name before saving.");
          return;
        }
        if (typeMissing) {
          toast.error("Choose a payment type.");
          return;
        }
        if (codeConflict) {
          toast.error(PAY_CODE_CONFLICT);
          return;
        }
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          typeClass,
          notes,
          active,
        });
      }}
    >
      <div className="space-y-3">
        <SetupField label="Name" htmlFor="method-name" required>
          <Input
            id="method-name"
            value={name}
            disabled={!canEdit}
            className={PAY_FIELD_CLASS}
            placeholder="e.g. Bank Transfer"
            onChange={(event) => setName(event.target.value)}
          />
        </SetupField>

        <SetupField
          label="Code"
          htmlFor="method-code"
          error={codeConflict ? PAY_CODE_CONFLICT : null}
          hint={
            value
              ? "Saved with this record. Editing the name will not change it."
              : "Generated from the name. Letters, numbers, and underscores only."
          }
        >
          <div className="relative">
            <Input
              id="method-code"
              value={code}
              readOnly
              aria-readonly="true"
              aria-invalid={codeConflict ? true : undefined}
              autoComplete="off"
              tabIndex={0}
              className={cn(
                PAY_FIELD_CLASS,
                "cursor-default font-mono uppercase read-only:cursor-default",
                !value && code && "pr-14",
              )}
              onChange={() => {}}
              onBeforeInput={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              onDrop={(event) => event.preventDefault()}
            />
            {!value && code ? (
              <span
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-[#EDE6D8] px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-[#5C4528]"
                data-testid="payment-code-auto"
              >
                Auto
              </span>
            ) : null}
          </div>
        </SetupField>

        <SetupField
          label="Type"
          required
          error={showTypeError ? "Choose a payment type." : null}
        >
          <Select
            value={typeClass || undefined}
            onValueChange={(next) => {
              setTypeTouched(true);
              setTypeClass(next as PaymentTypeClass);
            }}
            disabled={!canEdit}
          >
            <SelectTrigger
              id="method-type"
              className={cn(PAY_SELECT_CLASS, showTypeError && "border-red-500")}
              aria-invalid={showTypeError ? true : undefined}
            >
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className={PAY_SELECT_CONTENT_CLASS}>
              {PAYMENT_TYPE_CLASSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {PAYMENT_TYPE_CLASS_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>

        <SetupField label="Processing Mode">
          <Select
            value={processingMode}
            onValueChange={(next) => {
              const mode = next as PaymentProcessingMode;
              setProcessingMode(mode);
              if (mode === "manual") setProviderIntegrationId("");
            }}
            disabled={!canEdit}
          >
            <SelectTrigger id="method-processing" className={PAY_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={PAY_SELECT_CONTENT_CLASS}>
              {PAYMENT_PROCESSING_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {PAYMENT_PROCESSING_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>

        {showProviderField ? (
          <SetupField label="Provider Integration">
            {hasPaymentIntegrations ? (
              <Select
                value={providerIntegrationId || undefined}
                onValueChange={setProviderIntegrationId}
                disabled={!canEdit}
              >
                <SelectTrigger id="method-provider" className={PAY_SELECT_CLASS}>
                  <SelectValue placeholder="Select connected provider" />
                </SelectTrigger>
                <SelectContent className={PAY_SELECT_CONTENT_CLASS}>
                  {paymentIntegrations.map((integration) => (
                    <SelectItem key={integration.id} value={integration.id}>
                      {integration.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className="space-y-2 rounded-[6px] border border-[#E6E1D8] bg-[#FBF9F5] px-3 py-3"
                data-testid="payment-provider-empty"
              >
                <p className="text-sm text-[#251605]">No payment provider is connected yet.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-[6px] border-[#CCCCCC] text-[#251605]"
                  asChild
                >
                  <a href={CARD6_HREF}>Manage integrations</a>
                </Button>
              </div>
            )}
          </SetupField>
        ) : null}

        <SetupField label="Notes" htmlFor="method-notes">
          <Textarea
            id="method-notes"
            value={notes}
            maxLength={240}
            disabled={!canEdit}
            className={PAY_TEXTAREA_CLASS}
            onChange={(event) => setNotes(event.target.value)}
          />
        </SetupField>

        <ActiveField
          id="method-active"
          label="Active"
          checked={active}
          canEdit={canEdit}
          onChange={setActive}
        />
      </div>
    </Card3OverlapSheet>
  );
}

/**
 * Kept for Rate Plan → Policies inline create. Not shown on Financial & Commercial → Payments.
 */
export function DepositPolicySheet({
  open,
  canEdit,
  currencyCode,
  value,
  pending,
  className,
  onClose,
  onSave,
}: {
  open: boolean;
  canEdit: boolean;
  currencyCode: string;
  value: DepositPolicyCard3Row | null;
  pending: boolean;
  className?: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    required: boolean;
    depositType: DepositPolicyType;
    depositValue: number;
    isDefault: boolean;
    active: boolean;
  }) => void;
}) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [depositType, setDepositType] = useState<DepositPolicyType>(
    value?.depositType ?? "percent",
  );
  const [depositValue, setDepositValue] = useState(String(value?.depositValue ?? 0));
  const [required, setRequired] = useState(value?.required ?? false);
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);
  const [active, setActive] = useState(value?.active ?? true);

  return (
    <Card3OverlapSheet
      open={open}
      onClose={onClose}
      className={className ?? "z-[60]"}
      title={value ? "Edit deposit policy" : "Add deposit policy"}
      description="Not a posted deposit."
      canEdit={canEdit}
      pending={pending}
      submitLabel="Save deposit policy"
      onSubmit={() =>
        onSave({
          ...(value ? { id: value.id } : {}),
          code,
          name,
          description,
          required,
          depositType,
          depositValue: Number(depositValue),
          isDefault,
          active,
        })
      }
    >
      <div className="space-y-3">
        <SetupField label="Code" htmlFor="policy-code">
          <Input
            id="policy-code"
            value={code}
            maxLength={20}
            disabled={!canEdit}
            className={PAY_FIELD_CLASS}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </SetupField>
        <SetupField label="Name" htmlFor="policy-name">
          <Input
            id="policy-name"
            value={name}
            disabled={!canEdit}
            className={PAY_FIELD_CLASS}
            onChange={(event) => setName(event.target.value)}
          />
        </SetupField>
        <SetupField label="Description" htmlFor="policy-description">
          <Textarea
            id="policy-description"
            value={description}
            maxLength={500}
            disabled={!canEdit}
            className={PAY_TEXTAREA_CLASS}
            onChange={(event) => setDescription(event.target.value)}
          />
        </SetupField>
        <SetupField label="Deposit type">
          <Select
            value={depositType}
            onValueChange={(next) => {
              const type = next as DepositPolicyType;
              setDepositType(type);
              if (type === "none") setDepositValue("0");
            }}
            disabled={!canEdit}
          >
            <SelectTrigger id="policy-type" className={PAY_SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={PAY_SELECT_CONTENT_CLASS}>
              {DEPOSIT_POLICY_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {DEPOSIT_POLICY_TYPE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SetupField>
        <SetupField
          label={depositType === "percent" ? "Percent" : `Value (${currencyCode})`}
          htmlFor="policy-value"
        >
          <Input
            id="policy-value"
            type="number"
            min={0}
            max={depositType === "percent" ? 100 : undefined}
            step="0.01"
            value={depositValue}
            disabled={!canEdit || depositType === "none"}
            className={PAY_FIELD_CLASS}
            onChange={(event) => setDepositValue(event.target.value)}
          />
        </SetupField>
        <ActiveField
          id="policy-required"
          label="Required"
          checked={required}
          canEdit={canEdit}
          onChange={setRequired}
        />
        <ActiveField
          id="policy-default"
          label="Default policy"
          checked={isDefault}
          canEdit={canEdit}
          onChange={setIsDefault}
        />
        <ActiveField
          id="policy-active"
          label="Active"
          checked={active}
          canEdit={canEdit}
          onChange={setActive}
        />
      </div>
    </Card3OverlapSheet>
  );
}
