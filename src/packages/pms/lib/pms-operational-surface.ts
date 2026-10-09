/**
 * Shared rectangular NORU PMS form controls — geometry aligned with
 * `guest-create-modal.tsx` (`MODAL_CONTROL_CLASS` / `MODAL_SELECT_TRIGGER_CLASS`).
 *
 * Uses important utilities where shadcn `Input` / `SelectTrigger` / `Button` defaults
 * (`rounded-md`, `border-input`, `shadow-sm`) would otherwise win in the cascade.
 */

/** Corner trim — matches Guest Profile create/edit modal controls (6px) */
export const PMS_OP_CONTROL_RADIUS = "!rounded-[6px]";

/** Section / form panel shell (not a field control) */
export const PMS_OP_PANEL = "rounded-md border border-[#DDD4C5] bg-white shadow-sm";

/** Selected summary inset inside a panel */
export const PMS_OP_INSET_PANEL = "rounded-md border border-[#DDD4C5] bg-[#FAF8F4]";

/** Field label — Guest Profile spacing */
export const PMS_OP_LABEL = "text-sm font-medium text-[#251605]";

/** Muted placeholder on warm neutral controls */
export const PMS_OP_PLACEHOLDER = "placeholder:text-[#8A7B68]";

/** Text / number / date — same geometry as Guest `MODAL_CONTROL_CLASS` */
export const PMS_OP_INPUT =
  "h-10 w-full !rounded-[6px] !border-[#CCCCCC] !bg-white px-3 py-2 text-sm text-[#251605] !shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:!border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 read-only:bg-[#FAF8F5]";

/** Radix `SelectTrigger` — same geometry as Guest `MODAL_SELECT_TRIGGER_CLASS` */
export const PMS_OP_SELECT_TRIGGER =
  "h-10 w-full !rounded-[6px] !border-[#CCCCCC] !bg-white px-3 text-sm text-[#251605] !shadow-none transition-colors hover:border-[#C89933]/70 focus:!border-[#C89933] focus:ring-1 focus:ring-[#C89933] justify-between disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70 data-[placeholder]:text-[#8A7B68]";

/** @deprecated Prefer `PMS_OP_SELECT_TRIGGER` with Radix Select for Guest-matched geometry */
export const PMS_OP_SELECT = PMS_OP_SELECT_TRIGGER;

/** Multiline — Guest `MODAL_TEXTAREA_CLASS` geometry */
export const PMS_OP_TEXTAREA =
  "min-h-[5rem] w-full !rounded-[6px] !border-[#CCCCCC] !bg-white px-3 py-2 text-sm text-[#251605] !shadow-none transition-colors hover:border-[#C89933]/70 focus-visible:!border-[#C89933] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:cursor-not-allowed disabled:bg-[#F7F4EE] disabled:opacity-70";

/** Native date picker normalization (radius/border come from `PMS_OP_INPUT`) */
export const PMS_OP_DATE = "[color-scheme:light]";

/** Outline action button aligned to input height */
export const PMS_OP_BTN_OUTLINE =
  "h-10 !rounded-[6px] !border-[#CCCCCC] !bg-white px-3 text-sm text-[#251605] !shadow-none transition-colors hover:border-[#C89933]/70 hover:!bg-white focus-visible:!border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]";

/** Compact table / row action button */
export const PMS_OP_BTN_COMPACT =
  "h-8 min-w-[4.5rem] !rounded-[6px] !border-[#CCCCCC] !bg-white px-2.5 text-xs font-medium !shadow-none transition-colors hover:border-[#C89933]/70 hover:!bg-white focus-visible:!border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]";

/** Pagination control */
export const PMS_OP_BTN_PAGINATION =
  "h-8 !rounded-[6px] !border-[#CCCCCC] !bg-white px-3 text-sm !shadow-none transition-colors hover:border-[#C89933]/70 hover:!bg-white focus-visible:!border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933] disabled:opacity-50";

/** Table outer frame */
export const PMS_OP_TABLE_SHELL = "overflow-x-auto rounded-md border border-[#DDD4C5] bg-white";

/** Table header row */
export const PMS_OP_TABLE_HEAD =
  "border-b border-[#DDD4C5] bg-[#F3EDE3] text-[10px] font-semibold uppercase tracking-[0.11em] text-[#6B5E4E]";

/** Table body row */
export const PMS_OP_TABLE_ROW =
  "border-b border-[#E7E0D4] transition-colors last:border-b-0 hover:bg-[#FAF8F4]/90";
