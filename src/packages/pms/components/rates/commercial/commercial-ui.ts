export function commercialGoldButton(disabled?: boolean) {
  return [
    "inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D] disabled:opacity-50",
    disabled ? "opacity-50" : "",
  ].join(" ");
}

export function commercialOutlineButton() {
  return "inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-[10px] text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50";
}

export function isCommercialStaleMessage(message: string): boolean {
  return /COMMERCIAL_ACTIVATION_STALE|changed since you reviewed/i.test(message);
}
