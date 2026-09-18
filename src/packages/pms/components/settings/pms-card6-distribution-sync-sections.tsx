import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { IntegrationNotice } from "./pms-card6-integration-bits";
import type { DistributionSyncConfig } from "../../lib/distribution-card6.server";
import type { DistributionSyncCapabilities } from "../../lib/distribution-catalog";

function Option({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

export function Card6DistributionSyncSections({
  config,
  capabilities,
  canEdit,
  onChange,
}: {
  config: DistributionSyncConfig;
  capabilities: DistributionSyncCapabilities;
  canEdit: boolean;
  onChange: (config: DistributionSyncConfig) => void;
}) {
  const update = <K extends keyof DistributionSyncConfig>(
    key: K,
    value: DistributionSyncConfig[K],
  ) => onChange({ ...config, [key]: value });

  return (
    <>
      {capabilities.inventory.supported ? (
        <section className="space-y-3 rounded-2xl border border-[#CCCCCC] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#251605]">Inventory Sync</h3>
              <p className="text-xs text-muted-foreground">Control outbound availability data.</p>
            </div>
            <Switch
              aria-label="Enable inventory sync"
              checked={config.inventory.enabled}
              disabled={!canEdit}
              onCheckedChange={(enabled) => update("inventory", { ...config.inventory, enabled })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sync direction</Label>
            <Select value="outbound" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outbound">Noru PMS → Channel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {capabilities.inventory.availability ? (
            <Option
              id="sync-availability"
              label="Sync availability"
              checked={config.inventory.availability}
              disabled={!canEdit || !config.inventory.enabled}
              onChange={(availability) =>
                update("inventory", { ...config.inventory, availability })
              }
            />
          ) : null}
        </section>
      ) : null}

      {capabilities.rates.supported ? (
        <section className="space-y-3 rounded-2xl border border-[#CCCCCC] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#251605]">Rate Sync</h3>
              <p className="text-xs text-muted-foreground">
                Uses the existing Phase 2 rate plan mappings.
              </p>
            </div>
            <Switch
              aria-label="Enable rate sync"
              checked={config.rates.enabled}
              disabled={!canEdit}
              onCheckedChange={(enabled) => update("rates", { ...config.rates, enabled })}
            />
          </div>
          {capabilities.rates.rateUpdates ? (
            <Option
              id="sync-rate-updates"
              label="Rate updates"
              checked={config.rates.rateUpdates}
              disabled={!canEdit || !config.rates.enabled}
              onChange={(rateUpdates) => update("rates", { ...config.rates, rateUpdates })}
            />
          ) : null}
          {capabilities.rates.baseRates ? (
            <Option
              id="sync-base-rates"
              label="Base rates"
              checked={config.rates.baseRates}
              disabled={!canEdit || !config.rates.enabled}
              onChange={(baseRates) => update("rates", { ...config.rates, baseRates })}
            />
          ) : null}
        </section>
      ) : null}

      {capabilities.restrictions.supported ? null : (
        <IntegrationNotice>
          Restriction sync is unavailable because no current provider capability or backend service
          confirms support.
        </IntegrationNotice>
      )}

      <section className="space-y-3 rounded-2xl border border-[#CCCCCC] bg-white p-4">
        <h3 className="text-sm font-medium text-[#251605]">Sync Settings</h3>
        <div className="space-y-1.5">
          <Label>Sync frequency</Label>
          <Select value={config.frequency} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>Automatic sync</span>
          <Switch checked={false} disabled aria-label="Automatic sync unavailable" />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>Retry failed sync</span>
          <Switch checked={false} disabled aria-label="Retry unavailable" />
        </div>
        <IntegrationNotice>
          The external sync service is not connected. These settings configure operational intent
          only; they do not send data to the channel.
        </IntegrationNotice>
      </section>
    </>
  );
}
