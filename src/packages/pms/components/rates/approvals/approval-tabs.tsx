import type { RevenueApprovalTab } from "@/packages/pms/lib/revenue/revenue-context";

const TABS: Array<{ id: RevenueApprovalTab; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "mine", label: "My Requests" },
  { id: "history", label: "History" },
];

export function ApprovalTabs({
  tab,
  onChange,
}: {
  tab: RevenueApprovalTab;
  onChange: (tab: RevenueApprovalTab) => void;
}) {
  return (
    <div className="flex items-end gap-1 border-b border-[#E8E1D7]">
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={[
            "relative h-9 px-2.5 text-xs font-medium transition-colors",
            tab === item.id ? "text-[#251605]" : "text-muted-foreground hover:text-[#251605]",
          ].join(" ")}
        >
          {item.label}
          {tab === item.id ? (
            <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
