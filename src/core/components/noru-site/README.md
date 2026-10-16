# Noru Digital Solutions public site

The new public website, shown at `/` (see `src/routes/index.tsx`). It replaces the old home sections.

| Path | What it holds |
|---|---|
| `NoruSite.tsx` | Page shell: header, current page, call-to-action band, footer |
| `noru-site.css` | All site styles, scoped to `.noru-site` with `@scope`, so nothing leaks into the app |
| `lib/router.ts` | Small hash router (`/#product/pms`, `/#resources/contact`). No new TanStack routes are needed |
| `data/content.ts` | Products, solutions, pricing plans, FAQ, partners and events. Replace with database reads when the admin is built |
| `components/HeroAnimation.tsx` | Logo animation (two people walk, bow and form the logo) |
| `components/EventsMarquee.tsx`, `PartnersMarquee.tsx` | Sliding strips for events and partners |
| `components/Header.tsx` | Menu. Sign In goes to `/login`. When signed in it shows an Account menu (Dashboard, My Account, Sign Out) |
| `pages/` | Home, Product, Solutions, Pricing, Resources |

## Connecting the admin later

- Products and solutions: `PRODUCTS` and `SOLUTIONS` in `data/content.ts`
- Events (from blog posts): `EVENTS`, read by `EventsMarquee`
- Partners: `PARTNERS`, read by `PartnersMarquee`
- Testimonials, About Us, Blogs: the placeholders in `pages/Resources.tsx`
- Request Demo form: `components/ContactForm.tsx` only shows a thank-you message for now

## Notes

- `@scope` is supported in current Chrome, Edge, Safari and Firefox.
- The old home components in `src/core/components/home/` are no longer used by the home route. They can be deleted once the admin content is moved over.
