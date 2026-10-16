import { Link } from "@tanstack/react-router";

import { commercialOutlineButton } from "../commercial/commercial-ui";

export function ApprovalSubmittedNotice({
  message,
  approvalRequestId,
}: {
  message: string;
  approvalRequestId: string;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] p-3.5 shadow-2xs">
      <p className="text-sm font-medium text-[#251605]">{message}</p>
      <Link
        to="/restaurant/pms/rates-revenue"
        search={{ view: "approvals", approvalTab: "mine", approvalRequest: approvalRequestId }}
        className={commercialOutlineButton()}
      >
        View Request
      </Link>
    </div>
  );
}
