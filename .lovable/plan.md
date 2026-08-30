# NORU Branding + UI Polish

Rebrand the platform from "The Garden Table" to **NORU** and polish the UI around a new brand palette. No schema, RLS, auth, routing, or business-logic changes. The demo restaurant tenant stays named "The Garden".

## 1. Brand palette in design tokens

Rewrite the token values in `src/styles.css` (light + dark) so every component picks up the new brand automatically — no per-component hex values.

- `--primary` → #251605 dark brown (converted to oklch), used for the sidebar, strong nav/text surfaces.
- `--accent` / `--brand` → #C89933 gold: active nav indicator, selected states, primary CTAs, highlights.
- New `--success` / `--success-foreground` → #436436 green for positive/ready/completed states.
- `--border`, `--muted`, `--secondary` → warm neutrals derived from #CCCCCC.
- Surfaces stay off-white/white for readability.
- Add sidebar-specific tokens (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, …) mapped to brown/gold so the restaurant shell is dark-sidebar / light-content.
- Register any new token in `@theme inline` so `bg-success`, `text-success` etc. exist.

Contrast targets: cream text on brown, dark brown text on gold, white text on green. Keep visible focus rings (gold ring on light surfaces, cream ring on brown).

## 2. Status colours stay semantic

Order/shift status styling keeps distinct meaning rather than being flattened to brand colours: green (ready/completed/active), gold/amber (in progress, needs attention), red/destructive (cancelled/errors), muted gray (inactive/disabled). Existing badge components are re-pointed at the new tokens only where the current colour is a hardcoded utility.

## 3. Logo

The uploaded logo is a circular white "noru" two-figure mark on a dark-brown disc, delivered as a JPEG with a dark grey surround outside the circle. Treatment plan:

- Crop tightly to the circular mark and produce a transparent-background PNG (the disc itself becomes the visible logo) so it sits cleanly on light and dark surfaces.
- Because the mark is white-on-brown, on the dark brown sidebar it renders inside a light/gold chip or with the disc kept as-is — whichever reads better at 28-32px; the word "NORU" is also set as text next to it for clarity.
- Store as a CDN asset pointer (`.asset.json`) and reference it through a small `NoruLogo` component with size variants:
  - desktop sidebar (mark + NORU wordmark)
  - mobile header (compact mark + wordmark)
  - auth pages (larger, centred)
  - public/customer header (restraint — the restaurant's own name stays dominant)
- Aspect ratio preserved, no redrawing.
- Favicon: downscale the same circular mark to a square `public/favicon.png` (real file, not a pointer), reference from `__root.tsx`, remove the default `favicon.ico`, and update root metadata/OG site name to NORU.

## 4. Text branding sweep

Replace user-facing "The Garden Table" / "Garden Table" platform wording with NORU across: landing page, site header/footer, customer login/register/forgot/reset, account pages, restaurant login/register and dashboard shell, kitchen, orders, menu, tables, staff, waiter, settings, admin screens, and every route `head()` title/description/og tag.

Left untouched (technical/internal): database rows, table and column names, migrations, server-function names, route paths, storage keys, and the "The Garden" tenant record itself.

## 5. Restaurant shell polish

Keep navigation order and routes. Update in `restaurant-shell.tsx` and shared UI:

- dark brown sidebar with NORU logo, gold active-item pill and left indicator
- lighter, calmer header with clear restaurant name hierarchy
- consistent card/table/tab/badge/modal/form-control styling on the new tokens
- friendlier empty and loading states with brand-consistent wording

No gradients, glass, neon, or added animation.

## 6. Customer experience

Apply the same tokens to the QR menu, category strip, item cards, item dialog, cart, review, confirmation, and tracking pages. Behaviour unchanged; menu imagery and restaurant content stay visually dominant, with NORU present only as a light footer/header signature.

## 7. Mobile

Verify no horizontal overflow and comfortable touch targets (min 44px) on `/restaurant/waiter`, kitchen, staff/schedule/attendance tabs, customer QR menu, cart/review, and all login screens.

## 8. Verification

Playwright pass over: login, restaurant dashboard, Menu, Kitchen, Orders, Tables & QR, Staff (+ Schedule/Attendance), Waiter, Settings, public QR ordering, order tracking, and admin — at desktop and phone widths. Then typecheck (`tsgo --noEmit`) and confirm the build log reports OK.

## Report at the end

Branding locations updated, token changes, logo placements, favicon/metadata, components polished, branding intentionally left as technical identifiers, and build/typecheck results.
