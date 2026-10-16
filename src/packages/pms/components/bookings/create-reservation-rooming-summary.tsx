export function CreateReservationRoomingSummary({
  headline,
  lines,
  onEditStep1,
}: {
  headline: string;
  lines: Array<{ title: string; detail: string }>;
  onEditStep1: () => void;
}) {
  return (
    <section
      className="rounded-[6px] border border-[#CCCCCC] bg-white px-3 py-2"
      data-testid="rooming-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#251605]">Rooming Summary</h3>
          <p className="text-xs text-[#6B5E4E]">{headline}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-[6px] border border-[#E4D3A8] bg-white px-2.5 text-xs font-medium text-[#8A6A24]"
          data-testid="edit-rooming-in-step-1"
          onClick={onEditStep1}
        >
          Edit in Step 1
        </button>
      </div>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {lines.map((line) => (
          <li key={line.title} className="min-w-0" data-testid="rooming-summary-room">
            <p className="truncate text-xs font-medium text-[#251605]">{line.title}</p>
            <p className="truncate text-[11px] text-[#6B5E4E]">{line.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
