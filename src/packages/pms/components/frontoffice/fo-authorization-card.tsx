import { useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  foAuthorizationButtonLabel,
  type FoApprovalRequirement,
} from "@/packages/pms/lib/fo-approvals";

export function FoAuthorizationCard({
  requirement,
  guestLine,
  reason,
  onReasonChange,
  pending,
  confirmLabel,
  onAuthorize,
  reasonId,
  confirmDisabled,
}: {
  requirement: FoApprovalRequirement | undefined;
  guestLine?: string;
  reason: string;
  onReasonChange: (value: string) => void;
  pending?: boolean;
  confirmLabel: string;
  onAuthorize: () => void;
  reasonId: string;
  confirmDisabled?: boolean;
}) {
  if (!requirement) {
    return <p className="text-sm text-muted-foreground">Loading authorization…</p>;
  }

  const canRun = requirement.foCommand && requirement.canCurrentUserAuthorize;
  const label = foAuthorizationButtonLabel(requirement);

  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-testid="fo-authorization-card">
      <p className="text-sm font-medium">{requirement.title}</p>
      {guestLine ? <p className="text-xs text-muted-foreground">{guestLine}</p> : null}
      <p className="text-xs text-muted-foreground">{requirement.reason}</p>
      {requirement.permissionCode ? (
        <p className="text-xs text-muted-foreground">Permission: {requirement.permissionCode}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Live authorizers: {requirement.liveAuthorizerRoles.join(", ")}
        {requirement.approverRoleName ? ` · Configured hotel role: ${requirement.approverRoleName}` : ""}
      </p>
      {requirement.thresholdSummary ? (
        <p className="text-xs text-muted-foreground">{requirement.thresholdSummary}</p>
      ) : null}
      {requirement.unavailableMessage ? (
        <p className="text-xs text-destructive">{requirement.unavailableMessage}</p>
      ) : null}
      <p className="text-xs font-medium capitalize">{requirement.state.replaceAll("_", " ")}</p>
      {canRun ? (
        <>
          <Label htmlFor={reasonId}>Authorization reason</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason for the override or waiver"
            rows={3}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!reason.trim() || pending || confirmDisabled}
            onClick={onAuthorize}
          >
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {label}. An owner or manager must authorize this from their session. Front Office will not queue a request.
        </p>
      )}
    </div>
  );
}

export function useAuthorizationReason() {
  const [reason, setReason] = useState("");
  return { reason, setReason };
}
