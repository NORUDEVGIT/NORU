// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only; this repo pins preset vercel), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel sets VERCEL=1. A dashboard NITRO_PRESET/SERVER_PRESET (e.g. cloudflare from Lovable)
// would ignore nitro.preset below and emit the wrong output, so Production fails after vite.
if (process.env.VERCEL) {
  delete process.env.NITRO_PRESET;
  delete process.env.SERVER_PRESET;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Pin Nitro to Vercel Build Output API (not the Cloudflare default).
  // Lovable sandbox still overrides this with LOVABLE_NITRO_PRESET.
  nitro: { preset: "vercel" },
});
