/**
 * Shared social platform options for Property Setup. Brand logos live in the
 * select component via simple-icons — not Lucide generics.
 */
export const PROPERTY_SETUP_SOCIAL_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "telegram", label: "Telegram" },
] as const;

export type PropertySetupSocialPlatformId = (typeof PROPERTY_SETUP_SOCIAL_PLATFORMS)[number]["id"];

export function propertySetupSocialPlatform(id: string) {
  return PROPERTY_SETUP_SOCIAL_PLATFORMS.find((row) => row.id === id) ?? null;
}
