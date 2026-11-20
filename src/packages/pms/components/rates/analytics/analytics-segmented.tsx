import { cn } from "@/shared/lib/utils";

export type AnalyticsSegmentedOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
};

export function AnalyticsSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: AnalyticsSegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center rounded-lg border border-[#E8E1D7] bg-[#F7F4EE] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors",
            option.disabled
              ? "cursor-not-allowed text-[#756A5B]/40"
              : value === option.value
                ? "bg-white text-[#251605] shadow-xs"
                : "text-[#756A5B] hover:text-[#251605]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
