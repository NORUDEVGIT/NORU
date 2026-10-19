/**
 * Step 4 section icons. Sections carry no icon key, so the icon is chosen from the
 * section id first and the title second. Custom sections use the neutral fallback.
 */
import {
  CigaretteOff,
  CreditCard,
  FileText,
  IdCard,
  LockKeyhole,
  LogIn,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const AGREEMENT_SECTION_FALLBACK_ICON: LucideIcon = FileText;

const ICON_BY_ID: Record<string, LucideIcon> = {
  check_in_time: LogIn,
  check_out_time: LogOut,
  identification: IdCard,
  guest_responsibility: ShieldCheck,
  smoking_policy: CigaretteOff,
  privacy_data_use: LockKeyhole,
  payment_incidental: CreditCard,
};

const ICON_BY_TITLE: Array<[RegExp, LucideIcon]> = [
  [/check[\s-]?in/i, LogIn],
  [/check[\s-]?out/i, LogOut],
  [/identif|passport|\bid\b/i, IdCard],
  [/responsib/i, ShieldCheck],
  [/smok/i, CigaretteOff],
  [/privacy|data use/i, LockKeyhole],
  [/payment|incidental|charge/i, CreditCard],
];

export function agreementSectionIcon(section: { id: string; title: string }): LucideIcon {
  const byId = ICON_BY_ID[section.id];
  if (byId) return byId;
  for (const [pattern, icon] of ICON_BY_TITLE) {
    if (pattern.test(section.title)) return icon;
  }
  return AGREEMENT_SECTION_FALLBACK_ICON;
}
