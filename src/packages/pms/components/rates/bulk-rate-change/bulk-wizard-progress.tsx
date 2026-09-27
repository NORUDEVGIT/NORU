export type BulkWizardStep = 1 | 2 | 3 | 4;

const STEPS: Array<{ id: BulkWizardStep; label: string }> = [
  { id: 1, label: "Select" },
  { id: 2, label: "Set Rate" },
  { id: 3, label: "Review" },
  { id: 4, label: "Confirm" },
];

export function BulkWizardProgress({ step }: { step: BulkWizardStep }) {
  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map((item) => {
        const active = step === item.id;
        const done = step > item.id;
        return (
          <li key={item.id} className="min-w-0">
            <p
              className={[
                "truncate text-[10px] font-medium",
                active ? "text-[#6B4A0A]" : done ? "text-[#251605]" : "text-muted-foreground",
              ].join(" ")}
            >
              {item.id} {item.label}
            </p>
            <span
              className={[
                "mt-1 block h-0.5 rounded-full",
                active ? "bg-[#C89933]" : done ? "bg-[#251605]" : "bg-[#E8E1D7]",
              ].join(" ")}
            />
          </li>
        );
      })}
    </ol>
  );
}
