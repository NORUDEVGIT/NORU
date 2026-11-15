import { useId, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";
import { type IntegrationStatus } from "@/packages/pms/lib/integrations-card6.server";

export type NoruStatusTone =
  | "connected"
  | "error"
  | "pending"
  | "disabled"
  | "mapped"
  | "not_mapped";

const NORU_STATUS_LABEL: Record<NoruStatusTone, string> = {
  connected: "Connected",
  error: "Error",
  pending: "Pending",
  disabled: "Disabled",
  mapped: "Mapped",
  not_mapped: "Not mapped",
};

const NORU_STATUS_STYLE: Record<NoruStatusTone, string> = {
  connected: "bg-[#FBF3DE] text-[#8A641A]",
  error: "bg-[#F8E6E1] text-[#8C3B2A]",
  pending: "bg-[#F7F4EE] text-[#5C5346]",
  disabled: "bg-[#F4EDE0] text-[#7A6A55]",
  mapped: "bg-[#FBF3DE] text-[#8A641A]",
  not_mapped: "bg-[#F4EDE0] text-[#7A6A55]",
};

const INTEGRATION_TONE: Record<IntegrationStatus, NoruStatusTone> = {
  connected: "connected",
  pending: "pending",
  not_configured: "pending",
  error: "error",
  disabled: "disabled",
};

export function NoruStatusChip({
  tone,
  testId,
}: {
  tone: NoruStatusTone;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        NORU_STATUS_STYLE[tone],
      )}
      {...(testId ? { "data-testid": testId } : {})}
    >
      {NORU_STATUS_LABEL[tone]}
    </span>
  );
}

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <NoruStatusChip tone={INTEGRATION_TONE[status]} testId={`card6-status-${status}`} />
  );
}

export function IntegrationSummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  return (
    <article className="rounded-xl border border-[#E6E1D8] bg-white px-3 py-2">
      <p className="text-[11px] text-[#7A6A55]">{label}</p>
      <p
        className={cn(
          "font-display text-xl leading-tight",
          tone === "positive" && "text-[#436436]",
          tone === "warning" && "text-[#7A5511]",
          tone === "danger" && "text-destructive",
          tone === "neutral" && "text-[#251605]",
        )}
      >
        {value}
      </p>
    </article>
  );
}

/**
 * Credential input. Phase 1 never receives a stored value back from the
 * server, so this is always empty on open and the caller explains why.
 */
export function SecretInput({
  id,
  value,
  placeholder,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={revealed ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        className={cn("pr-10", invalid && "border-destructive")}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => setRevealed((open) => !open)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={revealed ? "Hide value" : "Show value"}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Read-only generated value, such as the inbound webhook URL. */
export function CopyableReadOnlyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-[#436436]" /> : <Copy className="size-4" />}
        </Button>
      </div>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function IntegrationNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-2 text-xs",
        tone === "warning"
          ? "border-[#C89933]/50 bg-[#C89933]/10 text-[#7A5511]"
          : "border-[#CCCCCC] bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function SettingsEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#E6E1D8] bg-[#FBF7EE] px-4 py-5 text-center">
      <p className="text-sm font-medium text-[#251605]">{title}</p>
      <p className="mt-1 text-xs text-[#7A6A55]">{body}</p>
    </div>
  );
}

export function FieldShell({
  id,
  label,
  required,
  help,
  error,
  dense,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  dense?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={dense ? "space-y-1" : "space-y-2"}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
