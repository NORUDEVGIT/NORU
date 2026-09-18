import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { MappingPairStatus } from "@/packages/pms/components/settings/pms-card6-distribution-bits";
import { IntegrationNotice } from "@/packages/pms/components/settings/pms-card6-integration-bits";
import type { MappingPair, NamedEntity } from "@/packages/pms/lib/distribution-card6.server";
import type { CatalogEntity } from "@/packages/pms/lib/distribution-catalog";

export function Card6MappingSection({
  title,
  description,
  noruLabel,
  externalLabel,
  noruOptions,
  externalOptions,
  pairs,
  onChange,
  canEdit,
}: {
  title: string;
  description: string;
  noruLabel: string;
  externalLabel: string;
  noruOptions: readonly NamedEntity[];
  externalOptions: readonly CatalogEntity[];
  pairs: MappingPair[];
  onChange: (next: MappingPair[]) => void;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [noruId, setNoruId] = useState("");
  const [externalId, setExternalId] = useState("");

  const usedNoru = new Set(pairs.map((row) => row.noruId));
  const usedExternal = new Set(pairs.map((row) => row.externalId));
  const availableNoru = noruOptions.filter((row) => !usedNoru.has(row.id));
  const availableExternal = externalOptions.filter((row) => !usedExternal.has(row.id));

  function add() {
    if (!noruId || !externalId) return;
    onChange([...pairs, { noruId, externalId }]);
    setNoruId("");
    setExternalId("");
    setOpen(false);
  }

  return (
    <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-[#251605]">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-3.5" /> Add mapping
          </Button>
        ) : null}
      </div>

      {externalOptions.length === 0 ? (
        <IntegrationNotice>
          No {externalLabel.toLowerCase()}s were provided by this channel. Check the channel
          connection.
        </IntegrationNotice>
      ) : pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mappings yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{noruLabel}</TableHead>
              <TableHead>{externalLabel}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pairs.map((row) => (
              <TableRow key={`${row.noruId}:${row.externalId}`}>
                <TableCell>
                  {noruOptions.find((item) => item.id === row.noruId)?.name ?? row.noruId}
                </TableCell>
                <TableCell>
                  {externalOptions.find((item) => item.id === row.externalId)?.label ??
                    row.externalId}
                </TableCell>
                <TableCell>
                  <MappingPairStatus mapped />
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Mapping actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            onChange(pairs.filter((item) => item.noruId !== row.noruId))
                          }
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {title.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{noruLabel} *</Label>
              <Select value={noruId} onValueChange={setNoruId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${noruLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {availableNoru.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{externalLabel} *</Label>
              <Select value={externalId} onValueChange={setExternalId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${externalLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {availableExternal.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!noruId || !externalId} onClick={add}>
              Add mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
