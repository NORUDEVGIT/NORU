import { MoreHorizontal } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { setCompanyStatus } from "@/packages/pms/lib/guest-companies.functions";
import { COMPANIES_DISABLED } from "@/packages/pms/lib/guest-companies-workspace";

export function GuestCompanyHeader({
  restaurantId,
  company,
  businessType,
  settingsEnabled,
  onEdit,
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
  };
  businessType: { name: string; code: string; active: boolean } | null;
  settingsEnabled: boolean;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setCompanyStatus);
  const mutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, ids: [company.id], status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["company-detail", restaurantId, company.id] });
      toast.success(status === "active" ? "Company activated." : "Company deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const location = [company.addressLine1, company.city, company.country].filter(Boolean).join(", ");

  return (
    <header className="rounded-2xl border border-border bg-card p-5" data-testid="company-detail-header">
      {!settingsEnabled ? (
        <p className="mb-3 text-sm text-muted-foreground">{COMPANIES_DISABLED}</p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-lg font-semibold">
              {company.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl">{company.name}</h1>
              <Badge variant={company.accountStatus === "active" ? "default" : "secondary"}>
                {company.accountStatus}
              </Badge>
              {businessType ? (
                <Badge variant={businessType.active ? "outline" : "secondary"}>
                  {businessType.name}
                  {businessType.active ? "" : " (inactive type)"}
                </Badge>
              ) : null}
              {company.code ? <span className="text-sm text-muted-foreground">{company.code}</span> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {[company.phone, company.email, location, company.website].filter(Boolean).join(" · ") ||
                "No contact details yet."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onEdit} data-testid="company-edit">
            Edit Company
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="More company actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {company.accountStatus === "active" ? (
                <DropdownMenuItem onClick={() => mutation.mutate("inactive")}>Deactivate</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => mutation.mutate("active")}>Activate</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
