# NORU PMS — Guest Profile Module
## Phase 2: Access Hardening + Guest Directory / Search / Filters / Quick View

### 1. Overview & Objective

Phase 2 elevates the Guest Profile directory from a preliminary listing into a dense, high-efficiency NORU PMS operational workspace matching the visual and operational standards of **Rooms & Inventory**, **Reservations**, and **Rate & Revenue**.

Key deliverables accomplished in Phase 2:
1. **Authorization Hardening**: Removed client-supplied `role` overrides from `getGuestWorkspaceAccess`; roles are derived strictly on the server via `callerMembership`. Create permissions fail closed.
2. **Backend Search & Read Model**: Enhanced `guestSearchOrFilter` with multi-token full-name matching (`first_name` + `last_name`), `confirmation_number` lookup across `hotel_reservations` (capped at 50), and company/agency master links lookup across `guest_account_masters` + `guest_account_links` (capped at 50). Loaded `upcomingStayAt` via `loadStayDatesMap`.
3. **Canonical URL State Contract**: Extended `GuestProfileSearch`, `parseGuestProfileSearch`, and `guestProfileSearch` to support `q`, `status`, `vip`, `lastStay`, `nationality`, `sort`, `page`, `pageSize`, and `preview`.
4. **Guest Quick View Drawer (`GuestQuickViewDrawer`)**: A non-disruptive, focused right-side slide-out drawer providing immediate operational context without navigating away from the directory. Contains four tabs (*Overview*, *Preferences*, *Identity*, *Relations*), key contact/stay snapshot, and deep links to *Open Full Profile* and *New Reservation*.
5. **Redesigned Guest Directory Workspace (`GuestDirectoryWorkspace`)**: Dense, calm luxury UI adhering to NORU design tokens (warm cream `#FAF8F5`, bronze `#8C6D23`, deep espresso `#251605`). Includes a compact 4-KPI summary band, active filter chips with one-click removal and "Clear All", truthful search placeholder, and dense table with custom column widths.

---

### 2. Phase 1 Hardening Implementation

#### A. Server-Side Role Derivation
In Phase 1, `getGuestWorkspaceAccess` accepted an optional client-supplied `role` parameter. In Phase 2:
- The input schema now requires only `{ restaurantId: idSchema }`.
- The handler derives the user's role directly from the authenticated session using `await callerMembership(context, data.restaurantId)`.
- Client role spoofing is strictly impossible.

#### B. Fail-Closed Creation Gate
The create capability is evaluated fail-closed:
```typescript
const canCreate = accessQuery.data?.canCreate === true && !isTypeInactive;
```
If `accessQuery.data` is loading, undefined, or false, all create actions (primary toolbar button, "+ New Guest" dropdown items, and Quick View actions) are completely disabled.

---

### 3. Backend Search & Read Model

#### A. Multi-Token Search (`guestSearchOrFilter`)
Staff often search by full name (e.g. "John Smith" or "Abebe Kebede"). `guestSearchOrFilter` splits terms by whitespace and builds bidirectional combinations:
- `and(first_name.ilike.%John%,last_name.ilike.%Smith%)`
- `and(first_name.ilike.%Smith%,last_name.ilike.%John%)`

#### B. Reservation Confirmation Number Lookup (Capped at 50)
When staff paste or type a confirmation number, `listGuests` executes a fast indexed lookup on `hotel_reservations`:
```typescript
const { data: resRows } = await supabase
  .from("hotel_reservations")
  .select("guest_id")
  .eq("restaurant_id", data.restaurantId)
  .ilike("confirmation_number", `%${termClean}%`)
  .limit(50);
```
Matching guest IDs are injected into the PostgREST `or` clause as `id.in.(...)`.

#### C. Linked Company / Agency Account Lookup (Capped at 50)
When staff search for a corporate account or travel agency name (e.g. "Acme Corp"), `listGuests` finds matching masters in `guest_account_masters` and retrieves linked individuals from `guest_account_links`:
```typescript
const { data: accMasters } = await supabase
  .from("guest_account_masters")
  .select("id")
  .eq("restaurant_id", data.restaurantId)
  .ilike("name", `%${termClean}%`)
  .limit(50);
```
Both intermediate lookups are strictly capped at 50 records to prevent HTTP header/URL size overflow in PostgREST query strings.

#### D. Stay Dates Map (`loadStayDatesMap`)
The helper computes both:
- `lastStayAt`: latest checkout date strictly less than or equal to property today.
- `upcomingStayAt`: earliest check-in date strictly greater than or equal to property today.

---

### 4. URL State Contract Expansion

The URL schema on `/restaurant/pms/guests` cleanly serializes and parses:

| Query Param | Type | Description |
| :--- | :--- | :--- |
| `q` | `string` | Search query term |
| `status` | `"active" \| "inactive"` | Profile status filter |
| `vip` | `"vip" \| "non-vip"` | VIP status filter |
| `lastStay` | `"never" \| "d30" \| "d90" \| "y1"` | Last stay window filter |
| `nationality` | `string` | Guest nationality filter |
| `sort` | `"updated_at" \| "name" \| "status" \| "last_stay"` | Directory sort column |
| `page` | `number` | Zero-indexed page number (omitted if 0) |
| `pageSize` | `25 \| 50` | Items per page (omitted if 25) |
| `preview` | `string (UUID)` | Selected guest ID for Quick View drawer |

When closing the Quick View drawer, only `preview: undefined` is updated, preserving all active searches, filters, and page selections.

---

### 5. Guest Quick View Drawer (`GuestQuickViewDrawer`)

Rendered as a slide-out right sheet (`w-full sm:max-w-lg lg:max-w-xl`):
- **Header**: Initials avatar, guest name, VIP crown badge, short profile number badge, and guest status badge.
- **Tabs**:
  1. **Overview**: Key contact (phone, email, language), stay snapshot (Last Stay, Upcoming, Total Stays, Total Nights), primary preferences preview, identity document status, and linked accounts (Company / Travel Agency).
  2. **Preferences**: Operational room preferences, dietary requirements, and staff service notes.
  3. **Identity**: Masked passport / ID document numbers, expiry date, issuing country, and document verification status.
  4. **Relations**: Linked corporate employers, travel agents, and billing accounts.
- **Action Footer**:
  - `Open Full Profile`: Navigates to `/restaurant/pms/guests/$guestId`.
  - `New Reservation`: Navigates to `/restaurant/bookings/new?guestId=$guestId`.
  - `Edit Guest`: Opens `GuestFormDialog` prefilled with guest data.

---

### 6. Design & Density Polish

- **Compact Summary Band**: The 4 KPIs (`Total Guests`, `Active Guests`, `VIP Guests`, `Returning Guests`) are rendered in a minimal, compact horizontal band (`data-testid="guest-directory-summary-band"`), avoiding bulky dashboard cards.
- **Truthful Search Placeholder**: `"Search name, phone, email, profile, document, reservation or company..."` reflects actual backend capabilities.
- **No Extraneous UI**: "More Filters" button is omitted because all implemented filters (Status, VIP, Last Stay, Nationality, Sort) are directly accessible in the toolbar.
- **Active Filter Chips**: Rendered below the toolbar with clear badges and a "Clear All" action.
- **Dense Table**: Custom widths for Profile No., Guest & badges, Contact, Nationality, Last Stay, Upcoming, VIP, Status, and Actions. Row click opens Quick View; explicit action menu opens Full Profile.
