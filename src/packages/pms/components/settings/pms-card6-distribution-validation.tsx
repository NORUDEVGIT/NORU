import { Check, Circle, TriangleAlert } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import type { ValidationCheck } from "@/packages/pms/lib/distribution-card6.server";

export function Card6DistributionValidation({
  open,
  onOpenChange,
  checks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: ValidationCheck[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuration check</DialogTitle>
          <DialogDescription>
            Incomplete mappings can still be saved. They stay in Attention Required until they are
            finished.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              {check.passed ? (
                <Check className="mt-0.5 size-4 text-[#436436]" aria-hidden />
              ) : check.warning ? (
                <TriangleAlert className="mt-0.5 size-4 text-[#C89933]" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 text-destructive" aria-hidden />
              )}
              <span>
                <span className="font-medium text-[#251605]">{check.label}</span>
                {check.detail ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{check.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
