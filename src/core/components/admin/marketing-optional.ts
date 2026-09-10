/** exactOptionalPropertyTypes-safe optional string writes. */
export function setOptionalString<T extends object>(
  target: T,
  key: keyof T,
  value: string,
): void {
  const trimmed = value.trim();
  if (trimmed) {
    (target as Record<string, unknown>)[key as string] = trimmed;
  } else {
    delete (target as Record<string, unknown>)[key as string];
  }
}

export function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order), 0) + 10;
}
