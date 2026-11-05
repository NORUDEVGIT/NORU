import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import {
  clockHands,
  clockOptionLabel,
  formatClockDigital,
  loadWorldClocks,
  saveCustomWorldClocks,
  searchWorldClockOptions,
  type PmsWorldClock,
} from "@/packages/pms/lib/pms-world-clocks";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

function AnalogFace({ timeZone, now }: { timeZone: string; now: Date }) {
  const { hour, minute, second } = clockHands(now, timeZone);
  return (
    <svg viewBox="0 0 100 100" className="size-[6.5rem] sm:size-[7.5rem]" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="#FFFEFB" stroke="#C4A46A" strokeWidth="2.25" />
      <circle cx="50" cy="50" r="43.5" fill="none" stroke="#E8DCC6" strokeWidth="0.75" />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * 30 * Math.PI) / 180;
        const inner = index % 3 === 0 ? 34 : 36.5;
        return (
          <line
            key={index}
            x1={50 + Math.sin(angle) * inner}
            y1={50 - Math.cos(angle) * inner}
            x2={50 + Math.sin(angle) * 40}
            y2={50 - Math.cos(angle) * 40}
            stroke={index % 3 === 0 ? "#8A6A24" : "#C9B48A"}
            strokeWidth={index % 3 === 0 ? 1.4 : 0.8}
            strokeLinecap="round"
          />
        );
      })}
      <line
        x1="50"
        y1="50"
        x2={50 + Math.sin((hour * Math.PI) / 180) * 22}
        y2={50 - Math.cos((hour * Math.PI) / 180) * 22}
        stroke="#251605"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="50"
        x2={50 + Math.sin((minute * Math.PI) / 180) * 30}
        y2={50 - Math.cos((minute * Math.PI) / 180) * 30}
        stroke="#3D2A12"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="54"
        x2={50 + Math.sin((second * Math.PI) / 180) * 32}
        y2={50 - Math.cos((second * Math.PI) / 180) * 32}
        stroke="#C89933"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="2.1" fill="#251605" />
    </svg>
  );
}

export function PmsWorldClocks({ restaurantId }: { restaurantId: string }) {
  const [now, setNow] = useState(() => new Date());
  const [clocks, setClocks] = useState<PmsWorldClock[]>(() => loadWorldClocks(restaurantId));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = useMemo(() => searchWorldClockOptions(query, clocks), [query, clocks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setClocks(loadWorldClocks(restaurantId));
  }, [restaurantId]);

  function persist(next: PmsWorldClock[]) {
    setClocks(next);
    saveCustomWorldClocks(restaurantId, next);
  }

  return (
    <div
      className="flex flex-wrap items-start justify-center gap-x-8 gap-y-8 px-2"
      data-testid="pms-world-clocks"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {clocks.map((clock) => (
        <div key={clock.timeZone} className="relative w-[7.5rem] text-center sm:w-[8.25rem]">
          {clock.pinned ? null : (
            <button
              type="button"
              aria-label={`Remove ${clock.city} clock`}
              className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-[#DDD4C5] bg-white text-[#756A5B] shadow-sm hover:text-[#251605]"
              onClick={() => persist(clocks.filter((item) => item.timeZone !== clock.timeZone))}
            >
              <X className="size-3" />
            </button>
          )}
          <div className="mx-auto drop-shadow-[0_8px_16px_rgba(37,22,5,0.08)]">
            <AnalogFace timeZone={clock.timeZone} now={now} />
          </div>
          <p className="mt-2 truncate text-[11px] font-semibold tracking-wide text-[#251605]">
            {clock.city}
          </p>
          {clock.region ? (
            <p className="truncate text-[10px] text-[#8A8176]">{clock.region}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] tabular-nums text-[#5A4833]">
            {formatClockDigital(now, clock.timeZone)}
          </p>
        </div>
      ))}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="pms-add-clock"
            className="flex w-[6.5rem] flex-col items-center text-[#A89878] sm:w-[7rem]"
          >
            <span className="grid size-[5.25rem] place-items-center rounded-full border border-dashed border-[#D4C6A8]/80 bg-white/20 text-[#C4A46A]/70 transition-colors hover:border-[#C4A46A] hover:bg-white/35 hover:text-[#8A6A24] sm:size-[6rem]">
              <Plus className="size-5" />
            </span>
            <span className="mt-2 text-[10px] font-medium tracking-wide">Add Clock</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-72 rounded-xl border-[#DDD4C5] p-3"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <p className="mb-2 text-xs font-semibold text-[#251605]">Add a city clock</p>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search city or timezone"
            aria-label="Search city or timezone"
            className="h-9 text-xs"
          />
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <li className="px-1 py-3 text-xs text-[#756A5B]">No matching cities.</li>
            ) : (
              options.map((clock) => (
                <li key={clock.timeZone}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-[#F7F4EE]",
                    )}
                    onClick={() => {
                      persist([...clocks, clock]);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="text-xs font-medium text-[#251605]">{clockOptionLabel(clock)}</span>
                    <span className="text-[10px] text-[#8A8176]">{clock.timeZone}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
