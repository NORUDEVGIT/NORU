/** Persisted appearance key. Dark is stored historically but is not a live product option. */
export const NORU_THEME_KEY = "noru-theme";

/**
 * NORU is light-only for now. Unsupported values (including `dark`) normalize to light
 * so a prior preference cannot leave the workspace in a broken dark appearance.
 */
export function ensureLightAppearance() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("dark");
  }
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(NORU_THEME_KEY) !== "light") {
      localStorage.setItem(NORU_THEME_KEY, "light");
    }
  } catch {
    /* storage can be unavailable */
  }
}
