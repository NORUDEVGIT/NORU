import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { applyGroupTemplate } from "@/packages/pms/lib/guest-group-detail.functions";
import { deleteGroupTemplate, listGroupTemplates, saveGroupTemplate } from "@/packages/pms/lib/guest-group-templates";
import { GROUP_TEMPLATE_COPY } from "@/packages/pms/lib/guest-group-templates";
import { GUEST_PROFILE_DETAIL_PATH, GUEST_PROFILE_DIRECTORY_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupTemplatesDialog({
  restaurantId,
  open,
  onOpenChange,
  mode,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "apply" | "manage";
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(listGroupTemplates);
  const apply = useServerFn(applyGroupTemplate);
  const save = useServerFn(saveGroupTemplate);
  const remove = useServerFn(deleteGroupTemplate);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");

  const query = useQuery({
    queryKey: ["group-templates", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    enabled: open,
  });
  const active = (query.data ?? []).filter((row) => row.active);

  const applyMutation = useMutation({
    mutationFn: () => apply({ data: { restaurantId, templateId, name } }),
    onSuccess: (result) => {
      toast.success("Group created from template.");
      onOpenChange(false);
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: result.id },
        search: guestProfileSearch({ type: "group" }),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMutation = useMutation({
    mutationFn: () => save({ data: { restaurantId, name: templateName, payload: {} } }),
    onSuccess: () => {
      toast.success("Template saved.");
      setTemplateName("");
      void queryClient.invalidateQueries({ queryKey: ["group-templates", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { restaurantId, templateId: id } }),
    onSuccess: () => {
      toast.success("Template removed.");
      void queryClient.invalidateQueries({ queryKey: ["group-templates", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "apply" ? "Create group from template" : "Manage group templates"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{GROUP_TEMPLATE_COPY}</p>
        {mode === "apply" ? (
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {active.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>New group name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" />
              <Button type="button" disabled={!templateName.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Save
              </Button>
            </div>
            {(query.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.active ? "Active" : "Inactive"}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => deleteMutation.mutate(row.id)}>
                  Delete
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigate({
                  to: GUEST_PROFILE_DIRECTORY_PATH,
                  search: guestProfileSearch({ type: "group", create: "group" }),
                })
              }
            >
              Open create workspace
            </Button>
          </div>
        )}
        {mode === "apply" ? (
          <DialogFooter>
            <Button
              type="button"
              disabled={!templateId || !name.trim() || applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              Create group
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
