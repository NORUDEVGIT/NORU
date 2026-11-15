import { AlertTriangle, Info } from "lucide-react";

import {
  ACCESSIBILITY_FEATURE_ADDED_TO_ROOM,
  ACCESSIBILITY_FEATURES_EMPTY,
  ACCESSIBILITY_FEATURES_HELP,
  ACCESSIBILITY_FEATURES_TITLE,
  ACCESSIBILITY_REVIEW_HELP,
  ACCESSIBILITY_REVIEW_TITLE,
  accessibilityReadinessWarning,
  accessibilityReviewCountRows,
  accessibleRoomCount,
  accessibleRoomCountLabel,
  roomAccessibilityHint,
  roomTypeAccessibilityHint,
  type AccessibilityHint,
  type AccessibilityReview,
} from "@/packages/pms/lib/room-accessibility";
import { cn } from "@/shared/lib/utils";

export function AccessibilityHintNote({
  hint,
  testId,
}: {
  hint: AccessibilityHint | null;
  testId?: string;
}) {
  if (!hint) return null;
  const Icon = hint.tone === "warning" ? AlertTriangle : Info;
  return (
    <p
      data-testid={testId}
      data-tone={hint.tone}
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] leading-4",
        hint.tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-[#E6DFD3] bg-[#FBF9F5] text-[#5F554B]",
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      {hint.message}
    </p>
  );
}

export type RoomAccessibilityFeature = { name: string; addedToRoom: boolean };

/** Read-only. The features never change the Accessible room setting. */
export function RoomAccessibilityFeatures({
  accessible,
  features,
  loading = false,
  failed = false,
}: {
  accessible: boolean;
  features: RoomAccessibilityFeature[] | null;
  loading?: boolean;
  failed?: boolean;
}) {
  return (
    <section
      className="grid gap-1.5 rounded-lg border border-[#DDD4C5] bg-white p-3 text-xs"
      data-testid="room-accessibility-features"
    >
      <h4 className="font-semibold text-[#251605]">{ACCESSIBILITY_FEATURES_TITLE}</h4>
      {loading ? (
        <p className="text-[#756A5B]">Loading accessibility features…</p>
      ) : failed || !features ? (
        <p className="text-[#756A5B]">Accessibility features could not be loaded.</p>
      ) : features.length === 0 ? (
        <p className="text-[#756A5B]">{ACCESSIBILITY_FEATURES_EMPTY}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {features.map((feature, index) => (
            <li
              key={`${feature.name}-${index}`}
              className="inline-flex items-center gap-1 rounded border border-[#E8E1D7] bg-[#FBF9F5] px-2 py-0.5 text-[#3D352B]"
            >
              {feature.name}
              {feature.addedToRoom ? (
                <span className="text-[10px] text-[#756A5B]">· {ACCESSIBILITY_FEATURE_ADDED_TO_ROOM}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[#756A5B]">{ACCESSIBILITY_FEATURES_HELP}</p>
      {!loading && !failed && features ? (
        <AccessibilityHintNote
          hint={roomAccessibilityHint(accessible, features.length)}
          testId="room-accessibility-mismatch"
        />
      ) : null}
    </section>
  );
}

export function RoomTypeAccessibleRooms({
  containsAccessibleRooms,
  rooms,
}: {
  containsAccessibleRooms: boolean;
  rooms: ReadonlyArray<{ accessible: boolean; active: boolean }>;
}) {
  const count = accessibleRoomCount(rooms);
  return (
    <div className="grid gap-1.5" data-testid="room-type-accessible-rooms">
      <p className="text-[11px] font-medium text-[#251605]">{accessibleRoomCountLabel(count)}</p>
      <AccessibilityHintNote
        hint={roomTypeAccessibilityHint(containsAccessibleRooms, count.accessible)}
        testId="room-type-accessibility-mismatch"
      />
    </div>
  );
}

/**
 * `accessibilityRuleOn` follows the rule as shown on screen, so the readiness
 * warning reacts before the rule is saved.
 */
export function AccessibilityReviewPanel({
  review,
  accessibilityRuleOn,
  loading = false,
  failed = false,
}: {
  review: AccessibilityReview | null;
  accessibilityRuleOn: boolean;
  loading?: boolean;
  failed?: boolean;
}) {
  const readiness = review
    ? accessibilityReadinessWarning(accessibilityRuleOn, review.counts.accessibleRooms)
    : null;
  const groups = (review?.groups ?? []).filter(
    (group) => group.category !== "rule_without_accessible_rooms",
  );
  return (
    <section
      className="rounded-xl border border-[#E6DFD3] bg-[#FBF9F5] p-4"
      data-testid="accessibility-review"
    >
      <h3 className="text-sm font-semibold text-[#251605]">{ACCESSIBILITY_REVIEW_TITLE}</h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{ACCESSIBILITY_REVIEW_HELP}</p>
      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading accessibility review…</p>
      ) : failed || !review ? (
        <p className="mt-3 text-xs text-muted-foreground">The accessibility review could not be loaded.</p>
      ) : (
        <>
          {readiness ? (
            <p
              role="alert"
              data-testid="accessibility-readiness-warning"
              className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {readiness}
            </p>
          ) : null}
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accessibilityReviewCountRows(review).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#EDE6D8] bg-white px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-base font-semibold text-[#251605]">{value}</dd>
              </div>
            ))}
          </dl>
          {groups.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No accessibility mismatches to review.</p>
          ) : (
            <div className="mt-3 space-y-2" data-testid="accessibility-review-list">
              {groups.map((group) => (
                <details
                  key={group.category}
                  className="rounded-lg border border-[#EDE6D8] bg-white px-3 py-2 text-xs"
                >
                  <summary className="cursor-pointer font-medium text-[#251605]">
                    {group.label} ({group.items.length})
                  </summary>
                  <ul className="mt-2 grid gap-1 text-[#3D352B] sm:grid-cols-2">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
