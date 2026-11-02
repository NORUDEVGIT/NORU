import { Label } from "@/shared/components/ui/label";
import { cn } from "@/shared/lib/utils";

/**
 * Dark brown border for inputs, dropdowns and text areas of required (*) fields.
 * The thin ring makes the border look slightly bolder without changing field size.
 */
const REQUIRED_GOLD = [
  "[&_input]:border-[#B8860B] [&_button]:border-[#B8860B] [&_textarea]:border-[#B8860B]",
  "[&_input]:ring-1 [&_input]:ring-[#B8860B]/40 [&_button]:ring-1 [&_button]:ring-[#B8860B]/40 [&_textarea]:ring-1 [&_textarea]:ring-[#B8860B]/40",
].join(" ");

/** Red border + soft ring when the field has an error (wins over the brown border). */
const ERROR_RED =
  "[&_input]:!border-destructive [&_input]:ring-1 [&_input]:!ring-destructive/30 [&_button]:!border-destructive [&_button]:ring-1 [&_button]:!ring-destructive/30 [&_textarea]:!border-destructive [&_textarea]:ring-1 [&_textarea]:!ring-destructive/30";

/**
 * Label + input wrapper shared by all four create forms
 * (individual, company, travel agency, group).
 */
export function Field({
  label,
  required: isRequired,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className={cn(error ? "!text-destructive font-semibold" : undefined)}>
        {label}
        {isRequired ? <span className="font-bold text-destructive"> *</span> : null}
      </Label>
      <div className={error ? ERROR_RED : isRequired ? REQUIRED_GOLD : undefined}>{children}</div>
      {error ? <p className="mt-1 text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
