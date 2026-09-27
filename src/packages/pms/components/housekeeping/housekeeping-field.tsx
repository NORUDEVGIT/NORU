import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import {
  HK_DESKTOP_ONLY_CLASS,
  HK_FIELD_STACK_CLASS,
} from "@/packages/pms/lib/housekeeping-shell";

export function HkFieldStack({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className={HK_FIELD_STACK_CLASS} data-testid={testId}>
      {children}
    </div>
  );
}

export function HkDesktopOnly({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(HK_DESKTOP_ONLY_CLASS, className)}>{children}</div>;
}

export function HkFieldCard({
  children,
  testId,
  onClick,
  selected,
}: {
  children: ReactNode;
  testId?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const className = cn(
    "w-full space-y-2 rounded-2xl border border-border bg-card p-4 text-left",
    selected && "ring-1 ring-[#C89933]",
    onClick && "hover:border-[#C89933]",
  );
  if (onClick) {
    return (
      <button type="button" className={className} data-testid={testId} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className={className} data-testid={testId}>
      {children}
    </div>
  );
}

export function HkFieldActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">{children}</div>;
}
