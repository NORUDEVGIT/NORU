import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { X } from "lucide-react";
import { pmsHelpGuide } from "@/packages/pms/lib/pms-help-content";
import type { PmsModuleNavLabel } from "@/packages/pms/lib/pms-module-nav";
import { cn } from "@/shared/lib/utils";

export function PmsHelpPanel({
  open,
  onOpenChange,
  activeModule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeModule: PmsModuleNavLabel | null;
}) {
  const guide = pmsHelpGuide(activeModule);
  const defaultOpen = guide.sections.slice(0, 2).map((section) => section.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="pms-help-panel"
        className={cn(
          "flex w-[min(100vw,28rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[28rem]",
          "[&>button.absolute]:hidden",
        )}
      >
        <header className="relative shrink-0 bg-[#1F140A] px-4 py-3 pr-12 text-white">
          <SheetTitle className="text-sm font-semibold text-white">{guide.moduleName} Help</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs text-white/70">
            Quick guidance for this workspace
          </SheetDescription>
          <SheetClose
            className="absolute right-3 top-3 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]"
            aria-label="Close"
          >
            <X className="size-4" />
          </SheetClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
            {guide.sections.map((section) => (
              <AccordionItem key={section.id} value={section.id} className="border-[#E8E4DC]">
                <AccordionTrigger className="py-2.5 text-[13px] font-semibold text-[#251605] hover:no-underline">
                  {section.title}
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <ul className="space-y-2.5">
                    {section.topics.map((topic) => (
                      <li key={topic.title}>
                        <p className="text-[13px] font-medium text-[#251605]">{topic.title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-[#5C5346]">{topic.body}</p>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
