import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AdminShell } from "@/core/components/admin-shell";
import { MarketingEditorProvider, useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const SECTIONS = [
  { to: "/admin/marketing", label: "Overview", end: true },
  { to: "/admin/marketing/brand", label: "Brand & hero" },
  { to: "/admin/marketing/nav", label: "Navigation" },
  { to: "/admin/marketing/packages", label: "Packages" },
  { to: "/admin/marketing/pricing", label: "Pricing" },
  { to: "/admin/marketing/content", label: "Content" },
  { to: "/admin/marketing/site", label: "Site chrome" },
] as const;

function MarketingSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-wrap gap-2">
      {SECTIONS.map((item) => {
        const exact = "end" in item && item.end;
        const active = exact ? pathname === item.to || pathname === `${item.to}/` : pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              active ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MarketingToolbar() {
  const { dirty, report, publish, revertDraft } = useMarketingEditor();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {dirty ? "Unpublished draft changes (local stub only)." : "Draft matches the last published stub."}
        {report.ok ? null : (
          <span className="ml-2 font-medium text-destructive">
            {report.errors.length} validation issue{report.errors.length === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={revertDraft} disabled={!dirty}>
          Revert draft
        </Button>
        <Button type="button" size="sm" onClick={() => publish()} disabled={!report.ok}>
          Publish stub
        </Button>
      </div>
    </div>
  );
}

export function MarketingAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminShell active="Marketing">
      <MarketingEditorProvider>
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
            <p className="text-sm text-muted-foreground">
              Public-site copy and cards. This editor does not change restaurant entitlements or tenant approval.
            </p>
          </div>
          <MarketingSubnav />
          <MarketingToolbar />
          {children}
        </div>
      </MarketingEditorProvider>
    </AdminShell>
  );
}

export function MarketingPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
