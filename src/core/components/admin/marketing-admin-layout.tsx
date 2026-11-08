import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AdminShell } from "@/core/components/admin-shell";
import { MarketingEditorProvider, useMarketingEditor } from "@/core/components/admin/marketing-editor-provider";
import { MARKETING_ADMIN_SECTIONS } from "@/core/lib/marketing";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function MarketingSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Marketing sections"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
    >
      {MARKETING_ADMIN_SECTIONS.map((item) => {
        const exact = "end" in item && item.end;
        const active = exact ? pathname === item.to || pathname === `${item.to}/` : pathname === item.to;
        const legacy = item.label === "Advanced / Legacy";
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
              active
                ? "bg-[#2b1a0e] text-[#FAF6EE] ring-1 ring-[#C89933]"
                : legacy
                  ? "border border-[#C89933]/30 bg-[#FAF6EE]/70 text-[#6b5344] hover:bg-[#F3E6C8]"
                  : "border border-[#C89933]/40 bg-[#FAF6EE] text-[#2b1a0e] hover:bg-[#F3E6C8]",
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
  const { dirty, report, publish, revertDraft, resetToSeed } = useMarketingEditor();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {dirty ? "Unpublished draft changes." : "Draft matches the last published document."}
        {report.ok ? null : (
          <span className="ml-2 font-medium text-destructive">
            {report.errors.length} validation issue{report.errors.length === 1 ? "" : "s"}
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void revertDraft()} disabled={!dirty}>
          Revert Draft
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void resetToSeed()}>
          Reset to Seed
        </Button>
        <Button type="button" size="sm" onClick={() => void publish()} disabled={!report.ok}>
          Publish
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
