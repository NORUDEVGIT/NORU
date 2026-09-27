import {
  ACTIVATION_STEPS,
  type CommercialActivationStep,
} from "@/packages/pms/lib/revenue/commercial-activation-workflow";

export function CommercialActivationStepper({ step }: { step: CommercialActivationStep }) {
  const current = ACTIVATION_STEPS.find((item) => item.id === step);
  return (
    <div>
      <p className="text-[10px] text-muted-foreground md:hidden">
        Step {step} of {ACTIVATION_STEPS.length} — {current?.label}
      </p>
      <ol className="hidden grid-cols-6 gap-1 md:grid">
        {ACTIVATION_STEPS.map((item) => {
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
                {item.label}
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
    </div>
  );
}
