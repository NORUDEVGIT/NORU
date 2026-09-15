# Create Reservation — Phase 1 Section 2 programme note

| Field | Value |
|---|---|
| **STATUS** | **ACCEPTED for Engineering** / **READY FOR PLANNING** (Rekik AUTHORIZED 2026-09-15 via Advisor) |
| **Spec** | [`docs/pms/specs/create-reservation-phase1-section2.md`](./specs/create-reservation-phase1-section2.md) |
| **ENGINEERING** | **NOT STARTED** — no code until TIP + Rekik plan approval |
| **Implemented** | **No** |
| **Section** | 2 of 8 — Company / Travel Agency on create only. **Not** full Create Reservation DONE |
| **Route** | Extend `/restaurant/bookings/new` (additive — do **not** rebuild a second product) |
| **Writer** | `createReservation` → `create_hotel_reservation_priced` (walk-in stays a mode of the same writer) |
| **Closes** | **AC-W4-5 for create** (Company + TA master IDs on create; detail attach remains) |
| **Migration** | Columns `company_master_id` / `travel_agent_master_id` **already exist**. RPC signature change **likely**. Dual-lane APPLY HELD if SECURITY DEFINER RPC replaced. Flag Abel if RLS **model** must change |
| **Guest Waves 1–5 + GE1–GE3** | Stay **OPERATIONALLY ACCEPTED** / closed — do **not** reopen; reuse GE1/GE3 pickers + modals |
| **Phase 1 COMPLETE** | **NO** |
