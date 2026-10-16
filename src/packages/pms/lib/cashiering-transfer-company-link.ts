export type TransferCompanyProfileRole = "employer" | "bill_to";

export type TransferCompanyProfileLink = {
  masterId: string;
  role: TransferCompanyProfileRole;
};

export type OpenCompanyTransferLink = {
  linked: boolean;
  label: string | null;
  rank: number;
};

/**
 * A company is linked for transfer only while its financial account is open.
 * The stay company comes first, then a guest-profile Bill-to, then Employer.
 */
export function openCompanyTransferLink(input: {
  masterId: string;
  accountOpen: boolean;
  stayMasterId: string | null;
  profileLinks: TransferCompanyProfileLink[];
}): OpenCompanyTransferLink {
  if (!input.accountOpen) return { linked: false, label: null, rank: 3 };
  const roles = input.profileLinks
    .filter((link) => link.masterId === input.masterId)
    .map((link) => link.role);
  const stay = input.stayMasterId != null && input.stayMasterId === input.masterId;
  if (!stay && roles.length === 0) return { linked: false, label: null, rank: 3 };
  const details: string[] = [];
  if (stay) details.push("this stay");
  if (roles.includes("bill_to")) details.push("Bill-to");
  if (roles.includes("employer")) details.push("Employer");
  return {
    linked: true,
    label: `Linked company · ${details.join(" · ")}`,
    rank: stay ? 0 : roles.includes("bill_to") ? 1 : 2,
  };
}
