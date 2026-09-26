import { useState } from "react";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import type {
  CompetitorProviderMapping,
  CompetitorRoomMapping,
  CompetitorSetupRow,
  RateShoppingRoomType,
} from "@/packages/pms/lib/revenue/rate-shopping";
import {
  RATE_SHOPPING_PROVIDER_HELPER,
  RATE_SHOPPING_ROOM_HELPER,
  RATE_SHOPPING_ROOM_REQUIRES_PROVIDER,
} from "@/packages/pms/lib/revenue/rate-shopping";
import { commercialGoldButton, commercialOutlineButton } from "../commercial/commercial-ui";

type DrawerTab = "overview" | "provider" | "rooms";

function formatStamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        active
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-2 text-[11px] font-medium ${
        active ? "border-b-2 border-[#C89933] text-[#251605]" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function CompetitorDetailDrawer({
  row,
  providerMappings,
  roomMappings,
  roomTypes,
  canManage,
  onClose,
  onEdit,
  onToggleActive,
  onAddProvider,
  onEditProvider,
  onToggleProvider,
  onAddRoom,
  onEditRoom,
  onToggleRoom,
}: {
  row: CompetitorSetupRow | null;
  providerMappings: CompetitorProviderMapping[];
  roomMappings: CompetitorRoomMapping[];
  roomTypes: RateShoppingRoomType[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onAddProvider: () => void;
  onEditProvider: (mapping: CompetitorProviderMapping) => void;
  onToggleProvider: (mapping: CompetitorProviderMapping) => void;
  onAddRoom: () => void;
  onEditRoom: (mapping: CompetitorRoomMapping) => void;
  onToggleRoom: (mapping: CompetitorRoomMapping) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const roomNames = new Map(roomTypes.map((room) => [room.id, room.name]));
  const body = row ? (
    <div className="flex h-full min-h-[32rem] flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[#251605]">{row.name}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{row.setupLabel}</p>
        </div>
        <button type="button" aria-label="Close competitor" onClick={onClose} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-[#E8E1D7] px-3">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "provider"} onClick={() => setTab("provider")}>
          Provider Mapping
        </TabButton>
        <TabButton active={tab === "rooms"} onClick={() => setTab("rooms")}>
          Room Mapping
        </TabButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-[11px]">
        {tab === "overview" ? (
          <div className="space-y-3">
            <Row label="Name" value={row.name} />
            <Row label="Location" value={row.locationLabel || "—"} />
            <div>
              <div className="text-muted-foreground">Active</div>
              <StatusChip active={row.active} />
            </div>
            <Row label="Notes" value={row.notes || "—"} />
            <Row label="Created" value={formatStamp(row.createdAt)} />
            <Row label="Updated" value={formatStamp(row.updatedAt)} />
            {canManage ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" className={commercialGoldButton()} onClick={onEdit}>
                  Edit Competitor
                </button>
                <button type="button" className={commercialOutlineButton()} onClick={onToggleActive}>
                  {row.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {tab === "provider" ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">{RATE_SHOPPING_PROVIDER_HELPER}</p>
            {canManage ? (
              <button type="button" className={commercialGoldButton()} onClick={onAddProvider}>
                Add Mapping
              </button>
            ) : null}
            {providerMappings.length === 0 ? (
              <p className="text-muted-foreground">No provider mappings yet.</p>
            ) : (
              <div className="space-y-2">
                {providerMappings.map((mapping) => (
                  <div key={mapping.id} className="rounded-lg border border-[#E8E1D7] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-[#251605]">{mapping.provider}</div>
                        <div className="text-muted-foreground">{mapping.externalPropertyId}</div>
                        <div>{mapping.externalPropertyName || "—"}</div>
                        <div className="mt-1">Last verified: {formatStamp(mapping.lastVerifiedAt)}</div>
                      </div>
                      <StatusChip active={mapping.active} />
                    </div>
                    {canManage ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className={commercialOutlineButton()}
                          onClick={() => onEditProvider(mapping)}
                        >
                          Edit Mapping
                        </button>
                        <button
                          type="button"
                          className={commercialOutlineButton()}
                          onClick={() => onToggleProvider(mapping)}
                        >
                          {mapping.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {tab === "rooms" ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">{RATE_SHOPPING_ROOM_HELPER}</p>
            {row.activeProviderCount === 0 ? (
              <p className="text-muted-foreground">{RATE_SHOPPING_ROOM_REQUIRES_PROVIDER}</p>
            ) : canManage ? (
              <button type="button" className={commercialGoldButton()} onClick={onAddRoom}>
                Add Room Mapping
              </button>
            ) : null}
            {roomMappings.length === 0 ? (
              <p className="text-muted-foreground">No room mappings yet.</p>
            ) : (
              <div className="space-y-2">
                {roomMappings.map((mapping) => (
                  <div key={mapping.id} className="rounded-lg border border-[#E8E1D7] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-[#251605]">
                          {roomNames.get(mapping.ourRoomTypeId) ?? "Room type"}
                        </div>
                        <div className="text-muted-foreground">
                          {mapping.externalRoomId}
                          {mapping.externalRoomName ? ` · ${mapping.externalRoomName}` : ""}
                        </div>
                        <div>Provider: {mapping.provider}</div>
                        <div>Status: manual</div>
                      </div>
                      <StatusChip active={mapping.active} />
                    </div>
                    {canManage ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className={commercialOutlineButton()}
                          onClick={() => onEditRoom(mapping)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={commercialOutlineButton()}
                          onClick={() => onToggleRoom(mapping)}
                        >
                          {mapping.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-[32rem] items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
      Select a competitor to review setup.
    </div>
  );

  return (
    <>
      <aside className="hidden min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {body}
      </aside>
      <Sheet open={Boolean(row)} onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="text-[#251605]">{value}</div>
    </div>
  );
}
