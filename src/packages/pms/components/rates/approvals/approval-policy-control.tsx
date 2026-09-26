import {
  APPROVAL_POLICY_DISABLE_CONFIRM,
  APPROVAL_POLICY_DISABLED_HELP,
  APPROVAL_POLICY_ENABLE_CONFIRM,
  APPROVAL_POLICY_ENABLED_HELP,
} from "@/packages/pms/lib/revenue/revenue-approval-ui";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

export function ApprovalPolicyControl({
  enabled,
  loading,
  busy,
  onRequestChange,
}: {
  enabled: boolean;
  loading?: boolean;
  busy?: boolean;
  onRequestChange: (next: boolean) => void;
}) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Approval Workflow
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-[#251605]">
            {loading ? "Loading policy…" : enabled ? "Enabled" : "Disabled"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {enabled ? APPROVAL_POLICY_ENABLED_HELP : APPROVAL_POLICY_DISABLED_HELP}
          </p>
        </div>
        <button
          type="button"
          className={enabled ? commercialOutlineButton() : commercialGoldButton(busy || loading)}
          disabled={busy || loading}
          onClick={() => onRequestChange(!enabled)}
        >
          {enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </section>
  );
}

export { APPROVAL_POLICY_ENABLE_CONFIRM, APPROVAL_POLICY_DISABLE_CONFIRM };
