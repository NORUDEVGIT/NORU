This project was originally scaffolded with [Lovable](https://lovable.dev). It now runs against an independent Supabase project.

## Development

You need Node.js 22+ and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

Copy [.env.example](.env.example) to `.env` (public keys) and `.env.local` (server secrets). Do not commit `.env.local`.

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

The app listens on http://localhost:8080/ by default. Platform administration is at `/admin/login`.

## Vercel

This is a TanStack Start + Nitro SSR app, not a static Vite SPA.

- Framework: Other (`vercel.json` sets `"framework": null`)
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: leave unset (do not use `dist` or `.output`; Nitro writes `.vercel/output`)
- Node.js: 22.x (`engines` and `.nvmrc`)

Set every name in [.env.example](.env.example) that the app uses. Put `VITE_*` values on the Vercel project so they exist at **build** time. Put `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on the project for **runtime**. Never give the service role a `VITE_` prefix.
