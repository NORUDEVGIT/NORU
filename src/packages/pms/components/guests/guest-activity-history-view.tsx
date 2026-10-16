import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  WAVE5_MIGRATION_UNAVAILABLE,
} from "@/packages/pms/lib/guest-profile-wave5";
import {
  getGuestAccountActivityHub,
  getGuestActivityHub,
} from "@/packages/pms/lib/guest-privacy.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

type ActivityCategoryFilter =
  | "all"
  | "profile_changes"
  | "notes"
  | "communication"
  | "identity"
  | "relationship"
  | "privacy"
  | "status";

const EVENT_LABELS: Record<string, string> = {
  created: "Profile Created",
  profile_updated: "Profile Updated",
  vip_changed: "VIP Recognition Changed",
  status_changed: "Status Changed",
  preference_updated: "Preferences Updated",
  note_added: "Internal Note Added",
  document_uploaded: "Identity Document Uploaded",
  document_verified: "Document Verified",
  document_rejected: "Document Rejected",
  merged_from: "Merged from Duplicate",
  merged_into: "Merged into Profile",
  consent_updated: "Consent Preferences Updated",
  relationship_linked: "Relationship Linked",
  relationship_unlinked: "Relationship Unlinked",
  comms_logged: "Communication Recorded",
  comms_sent: "Email Sent",
  exported: "Data Exported",
  anonymised: "Profile Anonymised",
  unmerged: "Profile Unmerged",
  unmerge_blocked: "Unmerge Blocked",
};

function formatAuditDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function GuestActivityHistoryView({
  restaurantId,
  guestId,
  accountId,
  partyName,
}: {
  restaurantId: string;
  guestId?: string | undefined;
  accountId?: string | undefined;
  partyName: string;
}) {
  const fetchGuestHub = useServerFn(getGuestActivityHub);
  const fetchAccountHub = useServerFn(getGuestAccountActivityHub);

  const [activeCategory, setActiveCategory] = useState<ActivityCategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const hubQuery = useQuery({
    queryKey: ["guest-activity-hub", restaurantId, guestId, accountId],
    queryFn: () =>
      guestId
        ? fetchGuestHub({ data: { restaurantId, guestId } })
        : fetchAccountHub({ data: { restaurantId, accountId: accountId! } }),
    enabled: Boolean(guestId || accountId),
    retry: false,
  });

  const rawEntries = hubQuery.data?.entries ?? [];

  const filteredEvents = useMemo(() => {
    return rawEntries.filter((item) => {
      // Category filter
      if (activeCategory === "profile_changes") {
        if (!["created", "profile_updated", "preference_updated"].includes(item.eventType))
          return false;
      } else if (activeCategory === "notes") {
        if (item.source !== "note" && item.eventType !== "note_added") return false;
      } else if (activeCategory === "communication") {
        if (item.source !== "comms" && !item.eventType.startsWith("comms_")) return false;
      } else if (activeCategory === "identity") {
        if (!item.eventType.includes("document_")) return false;
      } else if (activeCategory === "relationship") {
        if (!item.eventType.includes("relationship_")) return false;
      } else if (activeCategory === "privacy") {
        if (!["consent_updated", "exported", "anonymised", "unmerged", "unmerge_blocked"].includes(item.eventType))
          return false;
      } else if (activeCategory === "status") {
        if (!["vip_changed", "status_changed"].includes(item.eventType)) return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const text = [
          EVENT_LABELS[item.eventType] ?? item.eventType,
          item.actorName,
          item.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [rawEntries, activeCategory, search]);

  if (hubQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-activity-loading">
        <div className="h-14 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (hubQuery.isError) {
    const message = hubQuery.error instanceof Error ? hubQuery.error.message : "Activity history could not be loaded.";
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]"
        data-testid="guest-activity-history"
      >
        <h2 className="font-display text-base font-semibold text-[#251605]">Activity & History</h2>
        <p className="mt-1 font-medium text-[#251605]">{partyName}</p>
        <p className="mt-2 text-[#756A5B]">
          {message.includes("0054") ? WAVE5_MIGRATION_UNAVAILABLE : message}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
          onClick={() => void hubQuery.refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-activity-history">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div>
          <h2 className="font-display text-base font-semibold text-[#251605]">
            Activity & Profile History
          </h2>
          <p className="text-[11px] text-[#756A5B]">
            Chronological audit trail of profile modifications, communications, and system events.
          </p>
        </div>

        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
          <Input
            placeholder="Search activity, actor, details…"
            className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#DDD4C5] pb-2 text-xs">
        {(
          [
            { id: "all", label: "All Activity" },
            { id: "profile_changes", label: "Profile Changes" },
            { id: "notes", label: "Notes" },
            { id: "communication", label: "Communication" },
            { id: "identity", label: "Identity" },
            { id: "relationship", label: "Relationship" },
            { id: "privacy", label: "Privacy" },
            { id: "status", label: "Status" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveCategory(f.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 font-medium transition-colors",
              activeCategory === f.id
                ? "bg-[#C89933]/15 text-[#8A641A] font-semibold"
                : "text-[#756A5B] hover:bg-[#F7F4EE] hover:text-[#251605]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Dense Chronological Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-medium text-[#251605]">No activity records found.</p>
            <p className="text-[11px] text-[#756A5B]">
              Changes to this guest profile, notes, and communications will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="guest-activity-table">
              <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                <tr>
                  <th className="w-6 px-2 py-2.5"></th>
                  <th className="px-3 py-2.5">Date & Time</th>
                  <th className="px-3 py-2.5">Event</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-right">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {filteredEvents.map((item) => {
                  const isExpanded = expandedRowId === item.id;
                  const hasDetails = Boolean(item.notes && item.notes.length > 60);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "transition-colors",
                        hasDetails ? "cursor-pointer hover:bg-[#F7F4EE]/60" : "",
                        isExpanded ? "bg-[#FAF8F5]" : "bg-white",
                      )}
                      onClick={() => {
                        if (hasDetails) setExpandedRowId(isExpanded ? null : item.id);
                      }}
                    >
                      <td className="px-2 py-2 text-center text-[#756A5B]">
                        {hasDetails ? (
                          isExpanded ? (
                            <ChevronDown className="size-3 text-[#8A641A]" />
                          ) : (
                            <ChevronRight className="size-3 text-[#756A5B]" />
                          )
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-[#756A5B] whitespace-nowrap">
                        {formatAuditDateTime(item.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#251605]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-[#8A641A]" />
                          {EVENT_LABELS[item.eventType] ?? item.eventType.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#251605] max-w-[400px]">
                        <p className={cn("text-xs", !isExpanded && "line-clamp-1")}>
                          {item.notes || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right text-[#756A5B] whitespace-nowrap">
                        {item.actorName || "Staff / System"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
