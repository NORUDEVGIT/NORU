# NORU PMS — Guest Profile Module — Phase 4
## Property Setup → Guest Create / Edit / Check-In Field Rule Integration

**Branch:** `feature/guest-preferences-workspace`  
**Status:** Complete  
**Test Suite:** `src/packages/pms/lib/guest-workspace-phase4.test.ts` (74 passing tests)

---

### Executive Summary

Phase 4 bridges Property Setup (`pms_guest_fields`, `pms_guest_profile_types`, `pms_guest_id_types`) directly into operational guest creation, profile editing, identity document management, reservation confirmation, and front-office check-in.

Prior to Phase 4, field rules relied heavily on legacy SET3 fallback checks and local form heuristics. Phase 4 establishes **Property Setup as the authoritative source of truth** across both client-side UX forms and authoritative server-side mutation boundaries.

---

### 1. Architectural Source of Truth & Precedence

1. **Property Setup Configuration (Card 4)**
   - Authoritative operational field configurations (`pms_guest_fields`)
   - Profile type configurations (`pms_guest_profile_types`)
   - Identity document definitions (`pms_guest_id_types`)
2. **Technical Minimum Identity Constraints (Invariants)**
   - `FIRST_NAME`: Non-negotiable identity invariant that cannot be bypassed, omitted, or disabled even if unconfigured in Property Setup.
   - Preserved across creation and editing.
3. **Legacy SET3 Fallback**
   - Maintained exclusively for unseeded/empty Property Setup environments to preserve backward compatibility.
   - Completely bypassed once active Property Setup fields are configured.

---

### 2. Profile-Type Participation & Active State

- **Canonical Individual Profile Type Resolution:**
  - Resolved via `resolveIndividualProfileType(config)` querying `domain === "individual"` or code `INDIVIDUAL`.
  - The resolver operates on the canonical `GuestWorkspaceTypeConfig` entity (not an ad-hoc string identifier).
- **Profile Type Required Fields:**
  - `profile_create` requirements are evaluated from `(field.required || profileType.requiredFieldIds.includes(field.id)) && field.active`.
  - Profile types do not bleed into one another; corporate or travel agent required field IDs do not alter Individual rules.
- **Deactivated Individual Type Protection:**
  - When the Individual profile type is set to `active = false` in Property Setup:
    - Creation is blocked both in UX (`GuestFormDialog` alert + disabled submit) and server-side in `createGuest`.
    - Existing guest profiles remain completely readable and editable (`profile_edit` context).

---

### 3. Centralized Resolver & Context Engine

Defined in `src/packages/pms/lib/guest-field-rules.ts`:

```typescript
export type GuestFieldContext = "profile_create" | "profile_edit" | "reservation" | "check_in";
```

| Context | Enforcement Rules |
| :--- | :--- |
| `profile_create` | `(field.required \|\| profileType.requiredFieldIds.includes(field.id)) && field.active` + Technical Minimum (`firstName`) |
| `profile_edit` | Technical Minimum (`firstName`) only; existing profiles are not blocked by newly added create/reservation/check-in rules. |
| `reservation` | `field.reservation && field.active` |
| `check_in` | `field.checkIn && field.active` + unexpired matching identity document if `idDoc.requiredAtCheckIn` |

---

### 4. Authoritative Server-Side Enforcement Boundaries

Client-side validation provides immediate UX feedback, but authoritative server-side writers enforce the same central validator to prevent bypasses:

1. **`createGuest` (`guests.functions.ts`):**
   - Calls `loadGuestWorkspaceConfig(restaurantId)`.
   - Validates payload against `resolveGuestFieldRules(config, individualType, "profile_create")`.
   - Rejects missing required fields and inactive profile types.
2. **`saveGuestDocument` (`guests.functions.ts`):**
   - Verifies document type eligibility using `isDocumentTypeAllowedForProfileType`.
   - Enforces `validateDocumentFields` (`documentNumberRequired`, `issuingCountryRequired`, `expiryDateRequired`).
3. **Reservation Confirmation Boundaries (`reservations.functions.ts`):**
   - **`createReservation`** (when `status === "confirmed"`): Enforces `validateReservationGuestRequirements`.
   - **`setReservationStatus`** (when transitioning to `"confirmed"`): Enforces `validateReservationGuestRequirements`.
   - Draft and pending reservations remain permitted without blocking incomplete guest details.
4. **`completeFoCheckIn` (`fo-check-in.functions.ts`):**
   - Enforces `validateGuestCheckInRequirements` on the attached guest profile.
   - Evaluates `requiredAtCheckIn` document requirements. Direct server API invocations cannot bypass check-in guest rules.

---

### 5. Identity Type Relationships & Eligibility

Identity document types evaluate bidirectional eligibility deterministically via `isDocumentTypeAllowedForProfileType`:
1. `profileType.documentTypeIds`: If configured, document type ID must be present.
2. `docType.validForProfileTypeIds`: If configured, profile type ID must be present.
3. Both conditions must hold. Inactive document types are excluded from new creation while existing/historical documents remain visible and readable.

---

### 6. Option Normalization & Precedence

All selectable options are normalized into a stable shape inside `guest-workspace-config.functions.ts`:
```typescript
export type NormalizedFieldOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
};
```

**Precedence Hierarchy:**
1. Configured Property Setup options (`field.options`).
2. Authoritative shared NORU enums/catalogues (`GUEST_TITLES`, `GUEST_GENDERS`, `PREFERRED_CONTACT_METHODS`, `PREFERRED_CONTACT_TIMES`, `ISO_COUNTRIES`).
3. If no setup options and no authoritative catalogue exist, no invented choices are rendered.

---

### 7. Unmapped / Deferred Fields

- Fields configured in Property Setup with unmapped codes (e.g. `CUSTOM_TAX_INTERNAL_CODE`):
  - Retain their configuration metadata in `ResolvedGuestFieldRule` (`canonicalKey = null`, `isUnsupported = true`).
  - Do not crash the validator or resolver.
  - Do not render fake writable form controls that cannot persist.
  - Require zero database migrations in Phase 4.

---

### 8. Verification & Test Suite

The comprehensive test suite in `src/packages/pms/lib/guest-workspace-phase4.test.ts` verifies all 74 specifications:

- **Tests 1–15:** Canonical field mapping, invariant preservation, and technical minimums.
- **Tests 16–25:** Option normalization, stable object shape, and fallback precedence.
- **Tests 26–40:** Profile type resolution, context evaluation, and field validation.
- **Tests 41–61:** SET3 fallback, reservation validation, check-in requirements, and document fields.
- **Tests 62–74:** The 13 architectural amendments (Individual requiredFieldIds, corporate isolation, inactive type gate, server enforcement in `createGuest`, `createReservation`, `setReservationStatus`, `completeFoCheckIn`, `saveGuestDocument`, deterministic eligibility, and zero schema migrations).
