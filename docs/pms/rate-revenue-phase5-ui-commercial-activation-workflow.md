# Rate & Revenue — Phase 5 UI: Commercial Activation Workflow

| Field | Value |
|---|---|
| **Classification** | Implementation record for RR-P5-UI-03. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | UI-17 COMPLETE · UI-18 COMPLETE · UI-19 COMPLETE · UI-20 COMPLETE · UI-21 FOUNDATION |

## Entry points

UI-20 is a contextual overlay. It is not a top-level `view=activation` tab.

| Source | Launcher | Kind | Preselect |
|---|---|---|---|
| Commercial Overview | Create Activation | Chooser: Promotion or Package | None |
| Promotions header | Activate Promotion | Promotion | None |
| Promotion master-only row / drawer | Activate | Promotion | That promotion master |
| Packages header | Activate Package | Package | None |
| Package master-only row / drawer | Activate | Package | That package master |

Success stays on the originating workspace. The new activation is selected when the workspace already tracks a selected row.

## Step model

Select → Dates → Scope → Validate → Review → Activate.

This wizard is CREATE only. Compact edit / deactivate / reactivate sheets are unchanged.

## Promotion flow

1. Select a Property Setup promotion master (name, code, kind, value, master validity, active/inactive).
2. Enter stay window, booking window, and priority.
3. Optionally narrow room types and rate plans.
4. Call `previewPromotionActivation` with `operation: "CREATE"`.
5. Review snapshotted master terms from the preview response.
6. Call `applyPromotionActivation` with the proposed preview state and `expectedVersion: "absent"`.

`free_night` is visible and disabled: “Free Night is configured in Property Setup but is not executable in Commercial Engine V1.”

V1 note: only one promotion can be applied to a reservation.

## Package flow

1. Select a Property Setup package master (name, code, type, configured price, component count, active state).
2. Enter stay window only. No booking window.
3. Optionally narrow room types and rate plans (cannot broaden master scope).
4. Call `previewPackageActivation` with `operation: "CREATE"`.
5. Review snapshotted price, charge basis (`per_stay`), and component snapshot from preview.
6. Call `applyPackageActivation` with the proposed preview state and `expectedVersion: "absent"`.

The wizard activates one package master per run. Reservations may still attach multiple packages.

Inactive masters cannot advance.

## Preview and apply contracts

Preview is the authoritative validation. Client checks are convenience only (required dates, from ≤ to). Dates are not silently clipped to master validity.

Apply never reconstructs the payload from local form fields after preview. It sends `proposedActivation` plus `expectedVersion` and the optional reason.

One server apply owns the atomic write: activation + mappings + one logical history operation.

## Scope semantics

Activation may narrow Property Setup master scope. Empty selections inherit all eligible rooms/plans. Server preview returns effective scope (`roomTypeScope` / `ratePlanScope`). The UI shows counts and names from that response.

## Duplicate and overlap

| Result | Code | UX |
|---|---|---|
| Exact duplicate | `PROMOTION_ACTIVATION_DUPLICATE` / `PACKAGE_ACTIVATION_DUPLICATE` | Block. “An equivalent … activation already exists.” |
| Promotion overlap | `PROMOTION_ACTIVATION_OVERLAP` (warning) | Amber warning. Continue to Review is allowed. |
| Package overlap | Not invented | Packages may overlap; only exact duplicates fail. |

## Stale handling

If apply reports `COMMERCIAL_ACTIVATION_STALE` or a master-changed revalidation failure:

- Do not retry automatically.
- Show: “This activation changed since it was reviewed. Run validation again before activating.”
- Revalidate returns to Validate.

Changing Select, Dates, Scope, or priority after preview clears the cached preview. Reason does not invalidate preview.

## Master snapshots

Review shows the values that will be snapshotted:

- Promotion: name/code/kind/value + stay/booking windows, priority, scopes
- Package: name/code/type/price/charge basis + components (`Breakfast × 2`)

The wizard does not re-read the live master after preview.

## Deep links

Shared exports from `pms-property-setup-card3.ts`:

- Promotions: `/restaurant/settings?card3Domain=revenue-commercial-rules#financial-commercial` (`CARD3_PROMOTIONS_HREF`)
- Packages: `/restaurant/settings?card3Domain=meal-plans-packages#financial-commercial` (`CARD3_PACKAGES_HREF`)

Card 3 hydrates `activeDomain` from `card3Domain` on mount.

## Unsupported V1 targeting

No OTA, source, channel, market segment, company, corporate, coupon, or day-of-week targeting.

## No forecast / approval / OTA

Review is configuration review only. No Expected Bookings, Revenue, Occupancy, RevPAR, uplift, or ROI. No approval UI. No OTA publish. No cashiering posting. Property Setup masters are not mutated.
