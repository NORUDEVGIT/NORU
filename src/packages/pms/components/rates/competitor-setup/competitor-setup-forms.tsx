import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import type { CompetitorProviderMapping, CompetitorRoomMapping, HotelCompetitor, RateShoppingRoomType } from "@/packages/pms/lib/revenue/rate-shopping";
import { RATE_SHOPPING_PROVIDER_HELPER, RATE_SHOPPING_ROOM_HELPER } from "@/packages/pms/lib/revenue/rate-shopping";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

const fieldClass =
  "h-8 w-full rounded-md border border-[#DED7CD] bg-white px-2 text-[11px] text-[#251605]";
const labelClass = "mb-1 block text-[10px] font-medium text-[#251605]";

export function CompetitorFormDialog({
  open,
  competitor,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  competitor: HotelCompetitor | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    locationLabel: string;
    notes: string;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(competitor?.name ?? "");
    setLocationLabel(competitor?.locationLabel ?? "");
    setNotes(competitor?.notes ?? "");
    setActive(competitor?.active ?? true);
  }, [open, competitor]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md border-[#E8E1D7] bg-[#F7F4EE]">
        <DialogHeader>
          <DialogTitle className="font-display text-[#251605]">
            {competitor ? "Edit Competitor" : "Add Competitor"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className={labelClass}>Name</span>
            <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Location label</span>
            <input
              className={fieldClass}
              value={locationLabel}
              onChange={(event) => setLocationLabel(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-[#DED7CD] bg-white px-2 py-1.5 text-[11px] text-[#251605]"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#251605]">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        </div>
        <DialogFooter>
          <button type="button" className={commercialOutlineButton()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={commercialGoldButton(busy || !name.trim())}
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name, locationLabel, notes, active })}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProviderMappingFormDialog({
  open,
  mapping,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  mapping: CompetitorProviderMapping | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    provider: string;
    externalPropertyId: string;
    externalPropertyName: string;
    active: boolean;
  }) => void;
}) {
  const [provider, setProvider] = useState("");
  const [externalPropertyId, setExternalPropertyId] = useState("");
  const [externalPropertyName, setExternalPropertyName] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setProvider(mapping?.provider ?? "");
    setExternalPropertyId(mapping?.externalPropertyId ?? "");
    setExternalPropertyName(mapping?.externalPropertyName ?? "");
    setActive(mapping?.active ?? true);
  }, [open, mapping]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md border-[#E8E1D7] bg-[#F7F4EE]">
        <DialogHeader>
          <DialogTitle className="font-display text-[#251605]">
            {mapping ? "Edit Mapping" : "Add Mapping"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">{RATE_SHOPPING_PROVIDER_HELPER}</p>
        <div className="space-y-3">
          <label className="block">
            <span className={labelClass}>Provider</span>
            <input
              className={fieldClass}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="provider identifier"
            />
          </label>
          <label className="block">
            <span className={labelClass}>External Property ID</span>
            <input
              className={fieldClass}
              value={externalPropertyId}
              onChange={(event) => setExternalPropertyId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>External Property Name</span>
            <input
              className={fieldClass}
              value={externalPropertyName}
              onChange={(event) => setExternalPropertyName(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#251605]">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        </div>
        <DialogFooter>
          <button type="button" className={commercialOutlineButton()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={commercialGoldButton(busy || !provider.trim() || !externalPropertyId.trim())}
            disabled={busy || !provider.trim() || !externalPropertyId.trim()}
            onClick={() => onSave({ provider, externalPropertyId, externalPropertyName, active })}
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoomMappingFormDialog({
  open,
  mapping,
  providers,
  roomTypes,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  mapping: CompetitorRoomMapping | null;
  providers: string[];
  roomTypes: RateShoppingRoomType[];
  busy?: boolean;
  onClose: () => void;
  onSave: (input: {
    provider: string;
    ourRoomTypeId: string;
    externalRoomId: string;
    externalRoomName: string;
    notes: string;
    active: boolean;
  }) => void;
}) {
  const [provider, setProvider] = useState("");
  const [ourRoomTypeId, setOurRoomTypeId] = useState("");
  const [externalRoomId, setExternalRoomId] = useState("");
  const [externalRoomName, setExternalRoomName] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setProvider(mapping?.provider ?? providers[0] ?? "");
    setOurRoomTypeId(mapping?.ourRoomTypeId ?? roomTypes[0]?.id ?? "");
    setExternalRoomId(mapping?.externalRoomId ?? "");
    setExternalRoomName(mapping?.externalRoomName ?? "");
    setNotes(mapping?.notes ?? "");
    setActive(mapping?.active ?? true);
  }, [open, mapping, providers, roomTypes]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md border-[#E8E1D7] bg-[#F7F4EE]">
        <DialogHeader>
          <DialogTitle className="font-display text-[#251605]">
            {mapping ? "Edit Room Mapping" : "Add Room Mapping"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">{RATE_SHOPPING_ROOM_HELPER}</p>
        <div className="space-y-3">
          <label className="block">
            <span className={labelClass}>Provider</span>
            <select className={fieldClass} value={provider} onChange={(event) => setProvider(event.target.value)}>
              {providers.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>NORU Room Type</span>
            <select
              className={fieldClass}
              value={ourRoomTypeId}
              onChange={(event) => setOurRoomTypeId(event.target.value)}
            >
              {roomTypes.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>External Room ID</span>
            <input
              className={fieldClass}
              value={externalRoomId}
              onChange={(event) => setExternalRoomId(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>External Room Name</span>
            <input
              className={fieldClass}
              value={externalRoomName}
              onChange={(event) => setExternalRoomName(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-[#DED7CD] bg-white px-2 py-1.5 text-[11px] text-[#251605]"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#251605]">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        </div>
        <DialogFooter>
          <button type="button" className={commercialOutlineButton()} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={commercialGoldButton(busy || !provider || !ourRoomTypeId || !externalRoomId.trim())}
            disabled={busy || !provider || !ourRoomTypeId || !externalRoomId.trim()}
            onClick={() =>
              onSave({ provider, ourRoomTypeId, externalRoomId, externalRoomName, notes, active })
            }
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
