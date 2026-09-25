# Rate & Revenue — Commercial Engine V1 backend complete

| Field | Value |
|---|---|
| **Classification** | Closeout record. Not a Functional Spec. |
| **Branch** | `feature/guest-preferences-workspace` |
| **Status** | **Commercial Engine V1 backend COMPLETE** |
| **Migrations** | `0104` foundation · `0105` promotion persist · `0106` package persist · `0107` activation apply |

`price_hotel_stay` remains the room quote in `0016`. `room_subtotal` and `nightly_rate_snapshot` remain pre-commercial.

## Supported

| Area | Promotions | Packages |
|---|---|---|
| Property Setup master | Yes (`pms_promotions`) | Yes (`pms_packages`) |
| Operational activation | Yes | Yes |
| Preview / apply | Yes (`0107`) | Yes (`0107`) |
| Edit / deactivate / reactivate | Yes | Yes |
| Room / rate scope | Yes (promo rates = any/all) | Yes (inherit/narrow master) |
| Eligibility | Yes | Yes |
| Commercial quote | Yes | Yes, additive after promotion |
| Reservation attribution | 0..1 | 0..n |
| Atomic priced create | Yes | Yes |
| Priced reprice / amend reevaluate | Yes | Yes |
| Immutable history + list/detail | Yes | Yes |

V1 execution: percent and fixed promotions; `per_stay` packages; explicit selection; no stacking; overlaps warn for promotions.

## Unsupported

- Free-night execution
- Day of week
- Source / channel / coupon
- Stacking configuration
- Predictive / forecast / RevPAR impact
- Approvals
- OTA / distribution publish
- Advanced package charge bases
- Cashiering / folio settlement of commercial amounts
- UI-20 activation wizard, UI-21 full history table
- Automatic reprice of booked reservations after activation edit/deactivate

## Official surfaces

Domain: `commercial-engine.ts`, `commercial-promotion.ts`, `commercial-package.ts`, `commercial-*-activation.ts`, `commercial-history.ts`.

Reads: `listPromotionActivations`, `listPackageActivations`, `listCommercialChangeHistory`, `getCommercialOverviewWorkspace`, `getPromotionsWorkspace`, `getPromotionPerformanceSummary`, `getPackagesWorkspace`, `getPackagePerformanceSummary`, plus quote/eligibility functions from P5A-02/03.

## UI implementation status

| Screen | Status |
|---|---|
| UI-17 Commercial Overview | **COMPLETE** |
| UI-18 Promotions | **COMPLETE** |
| UI-19 Packages | **COMPLETE** |
| UI-20 Activation wizard | **PENDING** |
| UI-21 Commercial History | **FOUNDATION** |

See [`rate-revenue-phase5-commercial-activation.md`](./rate-revenue-phase5-commercial-activation.md), [`rate-revenue-phase5-ui-commercial-overview-promotions.md`](./rate-revenue-phase5-ui-commercial-overview-promotions.md), and [`rate-revenue-phase5-ui-packages.md`](./rate-revenue-phase5-ui-packages.md).
