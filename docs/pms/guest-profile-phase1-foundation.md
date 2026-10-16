# NORU PMS — Guest Profile Module — Phase 1 Foundation

## 1. Executive Summary

Phase 1 establishes the unified workspace shell, canonical URL contract, Property Setup configuration adapter, and centralized access model for the **Guest Profile Module** in NORU PMS.

Prior to Phase 1, Guest Profiles existed across fragmented listing components, separate detail workspaces, and hardcoded types that were partially decoupled from Property Setup rules. Phase 1 provides an architectural bridge that unifies the four operational domains into a persistent, cohesive workspace comparable to *Room & Inventory*, *Reservations*, and *Rate & Revenue*.

---

## 2. Architectural Ownership & System Principles

### 2.1 System Code vs. Property Setup
| Responsibility | Owner | Mechanism |
| :--- | :--- | :--- |
| **Domain Registry** | System Code | `SUPPORTED_GUEST_PROFILE_DOMAINS`, `GUEST_PROFILE_DOMAIN_REGISTRY` |
| **Operational Routes & Views** | System Code | `GuestProfileWorkspace`, `GuestProfileChrome`, Listing & Detail Workspaces |
| **Active / Inactive Status** | Property Setup (Card 4) | `pms_guest_profile_types.active`, `pms_business_profile_types.active`, etc. |
| **Field Requirements & Rules** | Property Setup (Card 4) | `pms_guest_fields`, `pms_guest_id_types`, `pms_guest_preference_*` |
| **Channels & Message Defaults**| Property Setup (Card 4) | `pms_communication_channels`, `pms_communication_defaults` |
| **User Role Permissions** | Centralized Access | `resolveGuestWorkspaceAccess(role)` |

### 2.2 Supported Domains & Deferred Placeholders
The system exclusively recognizes **four** operational domains:

1. **`individual`** — Individual guests (`IND`), master identity, contact details, identity documents, stay history, and guest preferences.
2. **`company`** — Corporate accounts (`COM`), contracted corporate rates, billing arrangements, company contacts, and linked travelers.
3. **`travel-agent`** — Travel agency masters (`TRA`), IATA codes, commission plans, agency agreements, and booking records.
4. **`group`** — Group accounts (`GRP`), group bookings, rooming rosters, and itineraries.

#### Placeholder & Deferred Type Degradation
Deferred types from early drafts or marketing taxonomies degrade safely into supported operational domains:
- `tour-operator` (`TOU`) → Degrades safely to `travel-agent` domain.
- `contact` (`CON`) → Degrades safely to `individual` domain.
- Custom / unknown setup types (`ORG`, etc.) → Degrade safely to `individual` and do **not** invent fake operational workspaces.

---

## 3. Canonical URL Contract & Compatibility Matrix

### 3.1 Primary Parameters
| Param | Canonical Values | Fallback / Legacy Source | Description |
| :--- | :--- | :--- | :--- |
| `section` | `guests`, `companies`, `travel-agencies`, `groups` | Inferred from `type` | Primary horizontal domain tab |
| `type` | `individual`, `company`, `travel-agent`, `group` | Inferred from `section` | Operational profile type (Wave 1-5 legacy compatibility) |
| `card` | `dashboard`, `information`, `identity`, `preferences`, `stay-history`, etc. | `tab`, `nav` | Active card / detail view |
| `nav` | `overview`, `personal`, `contact`, `identity`, `preferences`, `business`, etc. | `card`, `tab` | Sub-navigation tab within card |
| `tab` | String matching card or nav | `nav`, `card` | Unified sub-tab selector |
| `create` | `individual`, `company`, `travel-agent`, `group` | None | Staged create drawer / workflow indicator |
| `preview`| Record UUID | None | Quick drawer preview without full route transition |

### 3.2 Canonical URL Resolution
`normalizeGuestWorkspaceSearch(search)` parses any mixture of legacy or canonical query params and outputs a normalized state:
```ts
const canonical = normalizeGuestWorkspaceSearch(search);
// Returns: { section, type, card, nav, tab, create, preview }
```

---

## 4. Property Setup Config Adapter (`GuestWorkspaceConfig`)

### 4.1 Schema Overview
The adapter reads from all **11 Card 4 Property Setup tables** and normalizes them into a single read-only snapshot:
```ts
export interface GuestWorkspaceConfig {
  available: boolean;
  restaurantId: string;
  types: GuestWorkspaceTypeConfig[];
  fields: GuestWorkspaceFieldConfig[];
  idTypes: GuestWorkspaceIdTypeConfig[];
  preferenceCategories: GuestWorkspacePrefCategoryConfig[];
  preferenceTypes: GuestWorkspacePrefTypeConfig[];
  preferenceOptions: GuestWorkspacePrefOptionConfig[];
  businessTypes: GuestWorkspaceBusinessTypeConfig[];
  businessSettings: GuestWorkspaceBusinessSettingsConfig;
  groupTypes: GuestWorkspaceGroupTypeConfig[];
  communicationChannels: GuestWorkspaceCommChannelConfig[];
  communicationDefaults: GuestWorkspaceCommDefaultConfig | null;
}
```

### 4.2 Inactive Type Governance
When a profile type is set to `active: false` in Property Setup:
1. **Historical Records Remain Visible**: The listing and search continue to display all existing profiles.
2. **Advisory Banner Displayed**: A gold warning banner (`data-testid="guest-inactive-type-banner"`) informs staff:
   > *"Company is marked inactive in Property Setup. Existing historical records remain visible, but new record creation is blocked."*
   Includes a direct link to `Review Setup Rules` in Property Setup.
3. **Creation Blocked**:
   - The "New [Profile]" button in the chrome header is disabled.
   - Server functions and validation enforce `isDomainCreateAllowed(config, domain)`.
   - Direct navigation to `?create=<domain>` triggers a clean disabled notice.

---

## 5. Centralized Access Model (`GuestWorkspaceAccess`)

User capabilities are decoupled from setup configuration and evaluated strictly by staff role:

```ts
export interface GuestWorkspaceAccess {
  role: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  canManageAccounts: boolean;
  canMerge: boolean;
  canPrivacy: boolean;
  canExport: boolean;
}
```

### 5.1 Role Matrix
| Capability | `owner` / `manager` | `receptionist` / `front_desk` | `staff` / `waiter` |
| :--- | :---: | :---: | :---: |
| `canView` | Yes | Yes | Yes |
| `canCreate` | Yes | Yes | No |
| `canEdit` | Yes | Yes | No |
| `canVerifyIdentity` | Yes | Yes | No |
| `canManageAccounts` | Yes | No | No |
| `canMerge` | Yes | No | No |
| `canPrivacy` | Yes | No | No |
| `canExport` | Yes | No | No |

---

## 6. Centralized Cache Invalidation Strategy

Property Setup changes and operational updates use separate invalidation channels:

### 6.1 Configuration Invalidation (`invalidateGuestWorkspaceConfigQueries`)
Triggered whenever any Card 4 setup component saves or modifies configuration:
- `guest-workspace-config`
- `guest-create-context`
- `pms-card4-profile-types`
- `pms-card4-required-fields`
- `pms-card4-identity-documents`
- `pms-card4-preferences`
- `pms-preference-options`
- `guest-preference-catalogues`
- `pms-card4-company-business`
- `pms-card4-group-types`
- `pms-card4-communication-channels`
- `pms-card4-communication-defaults`

Wired into all 8 Card 4 setup components:
1. `pms-card4-profile-types.tsx`
2. `pms-card4-required-fields.tsx`
3. `pms-card4-identity-documents.tsx`
4. `pms-card4-preferences.tsx`
5. `pms-card4-company-business.tsx`
6. `pms-card4-group-types.tsx`
7. `pms-card4-communication-channels.tsx`
8. `pms-card4-communication-defaults.tsx`

### 6.2 Operational Record Invalidation (`invalidateGuestOperationalQueries`)
Triggered on guest record mutations (creation, updates, account linking, merges):
- `guests`
- `guest`
- `guest-directory-stats`
- `guest-accounts`
- `guest-account`
- `guest-companies`
- `guest-account-links`
- (Optional scoped `guestId` caches: `company-detail`, `travel-agent-detail`, `group-detail`, etc.)

---

## 7. Visual Design & Aesthetics

The Guest Profile workspace adheres strictly to the NORU design tokens:
- **Canvas / Background**: Warm off-white / light cream (`#FAF8F5`).
- **Primary Text**: Dark espresso brown (`#251605`).
- **Secondary / Muted Text**: Warm taupe (`#7A6B58`).
- **Borders & Dividers**: Subtle warm stone (`#E8E4DC`, `#D8D2C5`).
- **Active Navigation Indicator**: NORU Gold underline (`#C89933`), 2px rounded indicator.
- **Master Identity Badge**: Light gold tint (`#F4EFE6`) with `#8C6D23` typography and subtle `#C89933/30` border.
- **Density**: Compact typography, dense enterprise spacing, no oversized marketing hero cards.

---

## 8. Transitional Status: Card 4 vs SET3

### Background & Resolution
Earlier iterations of Property Setup included prototype switches in `SET3` (`companyRelationshipEnabled`, etc.).
- **Card 4 is Authoritative**: Operational Guest Profile features exclusively inspect Card 4 database tables (`pms_guest_profile_types`, `pms_business_profile_types`, etc.).
- **SET3 is Soft Advisory**: Any lingering SET3 controls are treated as non-binding display preferences and do not gate operational capabilities or override Card 4 active flags.
- **No Migration Required**: The architecture leverages existing tables without introducing breaking database migrations.
