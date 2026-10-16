export const MARKETING_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const MARKETING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MARKETING_MEDIA_BUCKET = "marketing-media";

export function marketingUploadFailureMessage(storageMessage: string): string {
  return isMissingMarketingMedia(storageMessage)
    ? "Image storage is unavailable. Please try again later."
    : "Could not start the image upload.";
}

/** True when the marketing-media bucket from migration 0166 is not available yet. */
export function isMissingMarketingMedia(message: string): boolean {
  const text = message.toLowerCase();
  const mentionsBucket = text.includes(MARKETING_MEDIA_BUCKET) || text.includes("bucket not found");
  if (!mentionsBucket) return false;
  return (
    text.includes("not found") ||
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("bucket not found")
  );
}
