"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import type { Card5PipelineStage } from "../../lib/sales-events-card5.server";

export interface PipelineStageSavePayload {
  id?: string;
  name: string;
  description: string;
  defaultProbability: number;
  sortOrder: number;
  active: boolean;
}

export interface PipelineStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage?: Card5PipelineStage | null;
  onSave: (payload: PipelineStageSavePayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function PipelineStageDialog({
  open,
  onOpenChange,
  stage,
  onSave,
  isSubmitting = false,
}: PipelineStageDialogProps) {
  const isEdit = Boolean(stage?.id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultProbability, setDefaultProbability] = useState("");
  const [sortOrder, setSortOrder] = useState("1");
  const [active, setActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync form state when dialog opens or stage changes
  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      if (stage) {
        setName(stage.name ?? "");
        // Legacy records may have NULL description -> show empty input
        setDescription(stage.description ?? "");
        // Legacy records may have NULL probability -> show empty input
        setDefaultProbability(
          stage.defaultProbability != null ? String(stage.defaultProbability) : "",
        );
        setSortOrder(String(stage.sortOrder ?? 1));
        setActive(stage.active !== false);
      } else {
        setName("");
        setDescription("");
        setDefaultProbability("");
        setSortOrder("1");
        setActive(true);
      }
    }
  }, [open, stage]);

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const probNum = Number(defaultProbability);
  const sortNum = Number(sortOrder);

  const isNameValid = trimmedName.length >= 1 && trimmedName.length <= 80;
  const isDescValid = trimmedDesc.length >= 1 && trimmedDesc.length <= 500;
  const isProbValid =
    defaultProbability.trim() !== "" &&
    Number.isInteger(probNum) &&
    probNum >= 0 &&
    probNum <= 100;
  const isSortValid =
    sortOrder.trim() !== "" && Number.isInteger(sortNum) && sortNum >= 1;

  const isFormValid = isNameValid && isDescValid && isProbValid && isSortValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setErrorMessage(null);
    try {
      await onSave({
        ...(stage?.id ? { id: stage.id } : {}),
        name: trimmedName,
        description: trimmedDesc,
        defaultProbability: probNum,
        sortOrder: sortNum,
        active,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save pipeline stage.";
      setErrorMessage(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-[#FAF8F5] border-[#E6D7B8] text-[#251605]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#251605]">
            {isEdit ? "Edit Pipeline Stage" : "Add Pipeline Stage"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* Stage Name */}
          <div className="space-y-1.5">
            <Label htmlFor="pipeline-stage-name" className="text-sm font-medium text-[#251605]">
              Stage Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pipeline-stage-name"
              type="text"
              maxLength={80}
              placeholder="e.g. Qualified Lead"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white border-[#E6D7B8] focus-visible:ring-[#C89933] text-[#251605]"
              disabled={isSubmitting}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="pipeline-stage-desc" className="text-sm font-medium text-[#251605]">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="pipeline-stage-desc"
              maxLength={500}
              rows={3}
              placeholder="Describe this stage in the sales workflow"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white border-[#E6D7B8] focus-visible:ring-[#C89933] text-[#251605] resize-none"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Default Probability and Display Order */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="pipeline-stage-probability"
                className="text-sm font-medium text-[#251605]"
              >
                Default Probability <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="pipeline-stage-probability"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  placeholder="10"
                  value={defaultProbability}
                  onChange={(e) => setDefaultProbability(e.target.value)}
                  className="bg-white border-[#E6D7B8] focus-visible:ring-[#C89933] text-[#251605] pr-8"
                  disabled={isSubmitting}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="pipeline-stage-sort-order"
                className="text-sm font-medium text-[#251605]"
              >
                Display Order <span className="text-red-500">*</span>
              </Label>
              <Input
                id="pipeline-stage-sort-order"
                type="number"
                min={1}
                step={1}
                placeholder="1"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="bg-white border-[#E6D7B8] focus-visible:ring-[#C89933] text-[#251605]"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Status Switch */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <Label htmlFor="pipeline-stage-status" className="text-sm font-medium text-[#251605]">
                Status
              </Label>
              <p className="text-xs text-muted-foreground">
                Enabled stages appear across pipeline views
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#251605]">
                {active ? "Enabled" : "Disabled"}
              </span>
              <Switch
                id="pipeline-stage-status"
                checked={active}
                onCheckedChange={setActive}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter className="pt-4 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="border-[#E6D7B8] hover:bg-[#F3EBDD] text-[#251605]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="bg-[#251605] hover:bg-[#3D260F] text-white font-medium"
            >
              {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Save Stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
