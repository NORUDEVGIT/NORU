# NORU PMS — Guest Profile Dynamic Fields & Fixed Operational Domains

## 1. Fixed Operational Profile Types (Part A)

### System-Defined Canonical Domains
Profile types in NORU PMS are strictly fixed to four operational domains:
1. `IND` — Individual Guest (`guest_profiles`)
2. `COM` — Company (`guest_companies`)
3. `TRA` — Travel Agency (`guest_travel_agencies`)
4. `GRP` — Group (`guest_groups`)

### Why Arbitrary Profile Types Are Blocked
Operational workflows across reservations, folios, billing, housekeeping, and front office bind directly to these four discrete domains. Allowing arbitrary profile types introduces invalid execution pathways with undefined billing and stay rules.

- **UI Hardening**:
  - The "+ Add Profile Type" action has been removed from `pms-card4-profile-types.tsx`.
  - The profile type code field is locked and read-only (`disabled={true}`).
  - Deletion controls are completely removed from the UI.
- **Server-Side Hardening**:
  - `savePmsCard4ProfileType` validates that `draft.code` belongs to `["IND", "COM", "TRA", "GRP"]` and rejects any attempts to create a 5th profile type.
  - `deletePmsCard4ProfileType` blocks the deletion of system profile types with an actionable message prompting deactivation instead.
  - Configurable attributes (`name`, `description`, `icon`, `active`, `required_field_ids`, `document_type_ids`, `preference_type_ids`, `defaults`) remain fully editable.
- **Database Hardening**:
  - Migrations `0116_pms_guest_profile_types_fixed.sql` clean up non-canonical profile types, remap dangling references in `guest_profiles` to `IND`, and add a database `CHECK (code IN ('IND', 'COM', 'TRA', 'GRP'))` constraint.

---

## 2. Dynamic Guest Fields Pipeline (Part B)

### Storage & Schema
- **Field Definitions**: Configured in `pms_guest_fields` (Card 4 Property Setup: Required Fields).
- **Core Attributes**: Known fields (`FIRST_NAME`, `LAST_NAME`, `PHONE`, `EMAIL`, `NATIONALITY`, `ADDRESS_LINE1`, etc.) map to primary columns on `guest_profiles`.
- **Custom Field Values**: Dynamic/unmapped fields persist in `guest_custom_field_values`:
  - `id` (UUID PK)
  - `guest_id` (FK to `guest_profiles.id`, `ON DELETE CASCADE`)
  - `field_id` (FK to `pms_guest_fields.id`, `ON DELETE RESTRICT`)
  - `restaurant_id` (Tenant isolation)
  - `value_text` (String representation for text/select)
  - `value_number` (Numeric value for number)
  - `value_date` (Date representation for date)
  - `value_json` (Full normalized payload including multi-select arrays)
  - `created_at`, `updated_at`, `updated_by`
  - Unique constraint on `(guest_id, field_id)`.
  - Row Level Security (RLS) policies matching existing `guest_profiles` operational access.

### Lifecycle Pipeline
1. **Classification**:
   - `classifyGuestField(field)` categorizes fields into `core_mapped`, `document`, `lookup`, or `custom_value`.
   - `isUnsupported` returns `false` for valid dynamic custom fields.
2. **Normalization**:
   - `normalizeCustomFieldValue(fieldType, rawValue)` trims text, casts numbers, validates `YYYY-MM-DD` date patterns, and filters valid array selections.
3. **Validation**:
   - `validateCustomFieldValue(field, normalizedValue, isNewEntry)` validates configured options, numeric min/max constraints, and active flags. Inactive fields cannot accept new values.
4. **Context Rules**:
   - `required = true`: Enforced during guest profile creation (`profile_create`).
   - `reservation = true`: Enforced during reservation creation and confirmation (`reservation`).
   - `check_in = true`: Enforced during Front Office check-in (`check_in`).
   - `active = false`: Unavailable for new entry. Existing values remain visible with an `(Inactive)` badge.

---

## 3. Operational Integration

### New Guest Registration & Edit Dialogs
- `<GuestDynamicFieldsSection>` renders dynamic custom fields under "Additional Information".
- On New Guest registration, dynamic preference types configured for `IND` are rendered via `<GuestRegistrationPreferences>`.
- Focused preference saving (`saveGuestPreferenceAnswers`) writes answers directly to `guest_preference_values` without overwriting contact defaults or reservation linkage states.
- On save, `saveGuestCustomFieldValues` writes normalized values to `guest_custom_field_values` and records audit events.

### Personal & Contact View
- Displays "Additional Information" panel listing all custom field values.
- Formats values cleanly for display (handling text, numbers, dates, single select, and multi-select badges).
- Inactive fields with existing values display with an `(Inactive)` status badge.

### Reservation Confirmation & Check-In Gates
- `createReservation`, `updateReservation`, and `setReservationStatus` load `guest_custom_field_values` and invoke `validateReservationGuestRequirements`. Confirmation is blocked server-side if any `reservation = true` requirement is missing.
- `saveCheckInRegistration` persists custom fields entered during the registration step.
- `completeFoCheckIn` validates `check_in = true` requirements against `guest_custom_field_values` and blocks check-in completion if unmet.

---

## 4. Privacy, Merge & Retention Lifecycles

### Privacy & Export
- `exportGuestProfile`: Includes a `customFields` array containing `{ code, label, value, formattedValue }` for all held custom data.
- `anonymiseGuest`: Cleanses and deletes all associated rows in `guest_custom_field_values`.

### Guest Merge Handling
- When merging two guest profiles:
  - Non-conflicting custom field values from the retired profile are migrated to the survivor.
  - If both profiles contain conflicting non-empty values for the same field:
    - The survivor's value is preserved as the operational value.
    - The retired guest's conflicting value is preserved in `guest_merge_ledger.payload.customFieldConflicts` and recorded in the audit event `recordGuestEvent("merged_from")`.
  - All retired guest custom field values are then deleted to prevent orphaned records.
