export function commercialGoldButton(disabled?: boolean) {
  return [
    "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] shadow-sm transition-colors hover:bg-[#B5882D] disabled:opacity-50",
    disabled ? "opacity-50" : "",
  ].join(" ");
}

export function commercialOutlineButton() {
  return "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DED7CD] bg-white px-3.5 text-xs font-semibold text-[#251605] shadow-sm transition-colors hover:bg-[#FAF6F0] disabled:opacity-50";
}

export function isCommercialStaleMessage(message: string): boolean {
  return /COMMERCIAL_ACTIVATION_STALE|changed since you reviewed/i.test(message);
}
