import type { DietaryTag } from "@/data/menu";
import { Badge } from "@/shared/components/ui/badge";

export function DietaryBadges({ tags }: { tags?: DietaryTag[] | undefined }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
