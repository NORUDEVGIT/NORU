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
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#736B5E]">
            Approval Workflow
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#251605]">
              {loading ? "Loading policy…" : enabled ? "Workflow Enabled" : "Workflow Disabled"}
            </span>
            {!loading ? (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  enabled
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                    : "bg-[#F0EBE1] text-[#736B5E] border border-[#DDD4C5]"
                }`}
              >
                {enabled ? "Active" : "Inactive"}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {enabled ? APPROVAL_POLICY_ENABLED_HELP : APPROVAL_POLICY_DISABLED_HELP}
          </p>
        </div>
        <button
          type="button"
          className={enabled ? commercialOutlineButton() : commercialGoldButton(busy || loading)}
          disabled={busy || loading}
          onClick={() => onRequestChange(!enabled)}
        >
          {enabled ? "Disable Workflow" : "Enable Workflow"}
        </button>
      </div>
    </section>
  );
}

export { APPROVAL_POLICY_ENABLE_CONFIRM, APPROVAL_POLICY_DISABLE_CONFIRM };
