import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { setCompanyStatus } from "@/packages/pms/lib/guest-companies.functions";
import { COMPANIES_DISABLED } from "@/packages/pms/lib/guest-companies-workspace";
import { exportGuestAccount } from "@/packages/pms/lib/guest-privacy.functions";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";

export function GuestCompanyHeader({
  restaurantId,
  company,
  businessType,
  settingsEnabled,
  onEdit,
  showBackButton = true,
}: {
  restaurantId: string;
  company: {
    id: string;
    name: string;
    code: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    website: string | null;
    accountStatus: string;
    logoUrl: string | null;
    creditAccountEnabled?: boolean;
    primaryContactName?: string | null;
    primaryContactTitle?: string | null;
  };
  businessType: { name: string; code: string; active: boolean; creditAccountAllowed?: boolean } | null;
  settingsEnabled: boolean;
  onEdit: () => void;
  showBackButton?: boolean;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setCompanyStatus);
  const exportAccount = useServerFn(exportGuestAccount);

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, ids: [company.id], status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, company.id] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, company.id] });
      toast.success(status === "active" ? "Company activated." : "Company deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportAccount({ data: { restaurantId, accountId: company.id } }),
    onSuccess: (result) => {
      const blob = new Blob([result.jsonText], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Company profile export downloaded.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const location = [company.addressLine1, company.city, company.country].filter(Boolean).join(", ");
  const isCreditAllowed = company.creditAccountEnabled ?? businessType?.creditAccountAllowed ?? false;

  return (
    <div className="space-y-3" data-testid="company-detail-header-wrapper">
      {showBackButton && (
        <div>
          <Link
            to={GUEST_PROFILE_DIRECTORY_PATH}
            search={guestProfileSearch({ type: "company" })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756A5B] hover:text-[#251605] transition-colors"
            data-testid="company-header-back-button"
          >
            <ArrowLeft className="size-3.5" /> Back to Companies
          </Link>
        </div>
      )}

      <header
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 sm:p-5 shadow-sm"
        data-testid="company-detail-header"
      >
        {!settingsEnabled ? (
          <p className="mb-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            {COMPANIES_DISABLED}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Avatar + Primary Identity Metadata */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="relative shrink-0">
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="size-16 rounded-xl object-cover ring-2 ring-[#E5DECE]"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-xl bg-[#F4E9D0] font-display text-xl font-bold text-[#8A641A] ring-2 ring-[#E5DECE]">
                  {company.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              {/* Name + Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
                  {company.name}
                </h1>

                {company.accountStatus === "active" ? (
                  <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2.5 py-0.5 text-xs font-medium text-[#2E7D32]">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[#F5F5F5] px-2.5 py-0.5 text-xs font-medium text-[#616161]">
                    Inactive
                  </span>
                )}

                {businessType ? (
                  <span className="inline-flex items-center rounded-full border border-[#DDD4C5] bg-[#FAF8F5] px-2.5 py-0.5 text-xs font-medium text-[#756A5B]">
                    {businessType.name}
                    {businessType.active ? "" : " (inactive)"}
                  </span>
                ) : null}

                {isCreditAllowed ? (
                  <span className="inline-flex items-center rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-medium text-[#0369A1]">
                    Credit Eligible
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-medium text-[#6B7280]">
                    Pay in Advance
                  </span>
                )}

                {company.code ? (
                  <span className="font-mono text-xs font-medium text-[#8A641A] bg-[#FBF7EE] px-2 py-0.5 rounded border border-[#EADBBD]">
                    {company.code}
                  </span>
                ) : null}
              </div>

              {/* Sub-row 1: Contact Details */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#756A5B]">
                {company.phone ? <span className="font-medium text-[#251605]">{company.phone}</span> : null}
                {company.phone && (company.email || location || company.website) ? <span>·</span> : null}
                {company.email ? <span>{company.email}</span> : null}
                {company.email && (location || company.website) ? <span>·</span> : null}
                {location ? <span>{location}</span> : null}
                {location && company.website ? <span>·</span> : null}
                {company.website ? (
                  <a
                    href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline text-[#8A641A]"
                  >
                    {company.website}
                  </a>
                ) : null}
                {!company.phone && !company.email && !location && !company.website ? (
                  <span className="italic text-[#8C827A]">No contact details yet</span>
                ) : null}
              </div>

              {/* Sub-row 2: Primary Contact Person */}
              {company.primaryContactName ? (
                <div className="text-xs text-[#756A5B]">
                  <span>Primary Contact: </span>
                  <span className="font-medium text-[#251605]">{company.primaryContactName}</span>
                  {company.primaryContactTitle ? (
                    <span className="text-[#756A5B]"> · {company.primaryContactTitle}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: Operational Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
              data-testid="company-new-reservation"
            >
              <Link to="/restaurant/pms/reservations" search={{ create: "new", companyId: company.id }}>
                <Plus className="mr-1.5 size-4" />
                New Reservation
              </Link>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              data-testid="company-edit"
            >
              <Pencil className="mr-1.5 size-3.5" />
              Edit Company
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                  aria-label="More company actions"
                  data-testid="company-more-actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {company.accountStatus === "active" ? (
                  <DropdownMenuItem
                    onClick={() => statusMutation.mutate("inactive")}
                    disabled={statusMutation.isPending}
                  >
                    Deactivate Company
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => statusMutation.mutate("active")}
                    disabled={statusMutation.isPending}
                  >
                    Activate Company
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  <Download className="mr-2 size-3.5 text-muted-foreground" />
                  Export Profile (JSON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </div>
  );
}
