# NORU Homepage Polish — Hospitality SaaS Layout

Rebuild only the public homepage (`/`) into a modern hospitality-SaaS landing page following the section flow and spacing of the reference site, adapted to NORU restaurant management. No schema, auth, server function, or app-route changes.

## Sections (top to bottom)

1. **Navbar** — NORU logo left; links Home / Features / How It Works / For Restaurants / Contact (in-page hash anchors on this page only); actions Sign In (`/restaurant/login`) and Get Started (`/restaurant/register`). Mobile: compact logo + sheet drawer menu, 44px touch targets. Sticky with subtle blur on scroll.
2. **Hero** — dark-brown premium band with gold eyebrow chip, headline "Run Your Restaurant Smarter with NORU", the supplied supporting line, primary gold CTA "Get Started" → `/restaurant/register`, secondary outline CTA "See How It Works" → `#how-it-works`. Visual: a composed product mock built from real app UI patterns (order cards, status chips, KPI tiles) rendered in JSX/Tailwind — no fabricated metrics or fake screenshots — sitting on a rounded card with soft shadow.
3. **Trust strip** — heading "Trusted by Modern Hospitality Businesses" with neutral placeholder logo cards (no invented company names), easy to swap later.
4. **Features** — heading + intro as specified, 8 cards in a responsive grid (1 / 2 / 4 columns) using existing `lucide-react` icons: QrCode, ChefHat, ConciergeBell/UtensilsCrossed, ClipboardList, Users, Table, BarChart3, Settings. Rounded cards, gold icon chip, muted border.
5. **How It Works** — 4 numbered steps with connecting line (horizontal on desktop, vertical on mobile): scan QR → customer or waiter orders → kitchen receives → restaurant manages in NORU.
6. **One Connected Restaurant Experience** — alternating image/text rows for Customer → Waiter → Kitchen → Manager, each with a small UI mock panel matching real app surfaces.
7. **Why NORU** — compact two-column benefits list with green check marks (the 8 supplied points).
8. **Testimonials** — carousel using the existing `@/components/ui/carousel`, populated with clearly labelled placeholder cards ("Restaurant testimonial — coming soon"), no invented names or quotes; data lives in one array for easy replacement.
9. **Final CTA** — dark-brown band, "Ready to Transform Your Restaurant?", CTAs Create Restaurant Account (`/restaurant/register`) and Sign In (`/restaurant/login`).
10. **Footer** — NORU logo, Product column (hash anchors), Account column (`/restaurant/login`, `/restaurant/register`, `/login`, `/register`), and "© 2026 NORU. All rights reserved." Legal links are omitted because no Privacy/Terms routes exist.

Signed-in shortcuts currently on the homepage (Restaurant Dashboard when the user has a restaurant, Admin Dashboard for platform admins, My Account, Scan QR Code) are preserved — kept in the navbar/hero area, still gated by the existing `getMyRestaurants` / `amIPlatformAdmin` queries.

## Design

Uses existing NORU tokens in `src/styles.css`; adds only homepage-scoped token/utility additions if a value is missing (e.g. a brand green surface token). Dark brown for hero/final CTA/footer, gold for primary CTAs and accents, green for success/benefit marks, gray for borders and muted surfaces. Generous vertical rhythm, rounded-3xl cards, subtle CSS-only fade/translate entrance transitions — no new animation libraries.

## Technical notes

- New file `src/components/home/*` for the section components (navbar, hero, features, steps, showcase, benefits, testimonials, CTA, footer); `src/routes/index.tsx` becomes composition only, keeping its existing `head()` metadata (title/description/OG) refreshed for the new positioning.
- No new dependencies; icons from `lucide-react`, carousel from existing shadcn component.
- Every link points to an existing route; hash links scroll within the homepage only.
- Verification: Playwright pass at desktop (1280) / tablet (834) / mobile (390) checking no horizontal overflow and that Sign In and Get Started land on the working auth routes, then typecheck and build log check.

## Report at the end

Homepage sections changed, components reused/created, responsive changes, CTA routes used, build/typecheck result.
