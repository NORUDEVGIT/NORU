import { buildDocumentHeader, type DocumentHeaderInput } from "@/packages/pms/lib/pms-set1-foundation";

export function PmsDocumentHeader({
  identity,
  className,
}: {
  identity: DocumentHeaderInput;
  className?: string;
}) {
  const header = buildDocumentHeader(identity);
  return (
    <aside
      data-testid="pms-document-header"
      className={className ?? "flex items-center gap-3 rounded-xl border border-[#CCCCCC] bg-card px-4 py-3"}
    >
      {header.logoUrl ? (
        <img src={header.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
      ) : (
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#251605]/5 text-xs text-muted-foreground">
          Logo
        </div>
      )}
      <div className="min-w-0">
        <p className="font-display text-base text-[#251605]">{header.name}</p>
        {header.lines.map((line) => (
          <p key={line} className="truncate text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </aside>
  );
}
