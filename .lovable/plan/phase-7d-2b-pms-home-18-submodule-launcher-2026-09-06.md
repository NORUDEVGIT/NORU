# Phase 7D.2B — PMS Home + 18 Submodule Launcher

Presentation and navigation only. No route migration, no redirects, no schema, RLS, permission or business-logic changes.

## What gets built

A new PMS Home at `/restaurant/pms`, opened by the PMS tile on Property Home (which stops pointing at Front Office). It lists the 18 GM-approved submodules in five visually distinct groups, each tile opening the existing working screen.

## The 18 submodules and where each tile goes

CORE HOTEL OPERATIONS
| Submodule | Opens | Visibility key |
| --- | --- | --- |
| Dashboard | `/restaurant/rooms?tab=dashboard` (existing hotel dashboard) | front_office |
| Reservations | `/restaurant/bookings/reservations` | front_office |
| Front Office | `/restaurant/rooms/arrivals` (arrivals / in-house / departures desk) | front_office |
| Cashiering | `/restaurant/cashiering?tab=dashboard` | accounting_finance |
| Housekeeping | `/restaurant/housekeeping?tab=dashboard` | housekeeping |
| Room & Inventory | `/restaurant/rooms?tab=rooms` (room types, rooms, closures — hotel rooms only) | configuration |
| Rate & Revenue Management | `/restaurant/bookings/rates` | configuration |
| Night Audit | `/restaurant/cashiering/night-audit` | accounting_finance |

GUEST & COMMERCIAL OPERATIONS
| Guest Services | new placeholder `/restaurant/pms/guest-services`, with a link to the existing Guest Profiles screen | front_office |
| Sales & Events | new placeholder `/restaurant/pms/sales-events` | front_office |
| Distribution | `/restaurant/bookings/distribution` | configuration |

MANAGEMENT & INTELLIGENCE
| Reports & Analytics | `/restaurant/reports` | reports_analytics |

SYSTEM MANAGEMENT
| Property Setup | `/restaurant/configuration` | configuration |
| Administration | `/restaurant/staff` (staff, roles, module access) | human_resources |
| Integrations | `/restaurant/settings` | property_settings |

SUPPORT, COMMUNICATION & CONTROL
| Maintenance / Engineering | `/restaurant/housekeeping?tab=maintenance` (existing maintenance requests) | housekeeping |
| Notifications & Communications | new placeholder `/restaurant/pms/communications` | property_settings |
| Security & Audit | new placeholder `/restaurant/pms/security-audit` | property_settings |

Placeholder pages are real routes in NORU styling: module title, short description, a "planned capability" list as plain text, and a back link to PMS Home. No forms, no mock data, no new tables or server functions.

## Visibility

Each tile is filtered with the existing `getMyModuleAccess` result using the keys above — the same resolver Property Home already uses. No new keys, no new grants, no server or RLS change. A tile only appears when the user can already reach the screen behind it. PMS Home itself is reachable when any hotel key is allowed, matching the existing PMS tile rule; a user with none is sent back to Property Home.

## Look and shell

PMS Home renders inside the existing `RestaurantShell`, so property context, currency, timezone, role-aware nav and logout are unchanged. Header shows "PMS" with the property name and a "Property Home → PMS" eyebrow. Group headings separate the five sections; cards use the existing NORU tokens (brown/gold/green/neutral) and current typography — no new design system, no hardcoded hex.

## Technical notes

- New files: `src/routes/restaurant/pms/index.tsx` plus four placeholder routes (`guest-services`, `sales-events`, `communications`, `security-audit`).
- `src/components/restaurant-shell.tsx`: add a `pms` workspace (title "PMS", nav label "PMS") so the shell can mark the page active; no other structural change.
- `src/routes/restaurant/home.tsx`: PMS tile `to` becomes `/restaurant/pms` and drops the interim search param.
- Verify: typecheck, production build, and a smoke test that PMS Home loads, all 18 tiles render in the five groups, and each existing-route tile opens its current workspace.

## Deferred to 7D.2C

Route migration under `/restaurant/pms/...`, legacy redirects, Platform Admin and PMS submodule entitlements, staff override UI, and real backends for Guest Services, Sales & Events, Communications and Security & Audit.
