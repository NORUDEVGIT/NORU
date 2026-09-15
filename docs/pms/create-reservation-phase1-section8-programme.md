# Create Reservation — Phase 1 Section 8 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section8.md`](./specs/create-reservation-phase1-section8.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan **APPROVE** |
| **Implemented** | **No** |
| **Section** | 8 of 8 — Packages (**conditional / GATE**). **Not** full Create Reservation DONE |
| **Catalog finding** | Setup stay-package catalogue **EXISTS** (`pms_packages` + SET3 UI). Create bind + `quoteStay` package lines **DO NOT EXIST**. **GATE** create picker/bind — do **not** fake packages |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer). **No** package arg — **do not invent one** |
| **Quote / sticky** | CURRENT `quoteStay` is room-rate only. Sticky: honest **not in quote**. **Do not** invent a package pricing engine |
| **Programme rule** | Reference packages function + modern NORU UI **only if CURRENT supports** (create does **not**). **Do not** clone legacy chrome |
| **Migration** | **LIKELY NONE.** Eng confirms. Dual-lane APPLY HELD only if SECURITY DEFINER create/pricing RPCs replaced (not required for this gate). Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen |
| **Parallel** | Section 6 coding ([#145](https://github.com/NORUDEVGIT/NORU/issues/145)) and Section 7 Spec drafting **OK** — do not block |
| **Out** | Bind/quote invent; FO extras as packages; meal plans on create; commission; LIVE OTA/RMS; email/SMS; Group/CR-100 |
| **Phase 1 COMPLETE** | **NO** |
