export type BulkWizardStep = 1 | 2 | 3 | 4;

const STEPS: Array<{ id: BulkWizardStep; label: string }> = [
  { id: 1, label: "Select" },
  { id: 2, label: "Set Rate" },
  { id: 3, label: "Review" },
  { id: 4, label: "Confirm" },
];

export function BulkWizardProgress({ step }: { step: BulkWizardStep }) {
  return (
    <ol className="grid grid-cols-4 gap-2 rounded-xl border border-[#DDD4C5] bg-white p-3">
      {STEPS.map((item) => {
        const active = step === item.id;
        const done = step > item.id;
        return (
          <li key={item.id} className="min-w-0">
            <p
              className={[
                "truncate text-xs font-semibold",
                active ? "text-[#8A641A]" : done ? "text-[#251605]" : "text-[#756A5B]",
              ].join(" ")}
            >
              {item.id}. {item.label}
            </p>
            <span
              className={[
                "mt-1.5 block h-1 rounded-full",
                active ? "bg-[#C89933]" : done ? "bg-[#251605]" : "bg-[#E8E1D7]",
              ].join(" ")}
            />
          </li>
        );
      })}
    </ol>
  );
}
