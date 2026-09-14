import { useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  GUEST_DOCUMENT_KIND_LABELS,
  GUEST_DOCUMENT_KINDS,
  STAFF_VERIFY_COPY,
  type GuestDocumentKind,
} from "@/packages/pms/lib/guest-profile-wave2";
import {
  INDIVIDUAL_IDENTITY_UPLOAD_COPY,
  INDIVIDUAL_STAGED_IDENTITY_COPY,
} from "@/packages/pms/lib/guest-profile-individual";
import {
  IDENTITY_UPLOAD_ACCEPT,
  IDENTITY_UPLOAD_MAX_BYTES,
} from "@/packages/pms/components/guests/guest-form-identity-upload";

export type StagedIdentityFile = {
  key: string;
  file: File;
  kind: GuestDocumentKind;
};

export function GuestFormStagedIdentity({
  files,
  onChange,
}: {
  files: StagedIdentityFile[];
  onChange: (files: StagedIdentityFile[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<GuestDocumentKind>("passport");

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!(IDENTITY_UPLOAD_ACCEPT as readonly string[]).includes(file.type)) continue;
      if (file.size > IDENTITY_UPLOAD_MAX_BYTES) continue;
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${next.length}`, file, kind });
    }
    onChange(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-3" data-testid="individual-identity-staged">
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_STAGED_IDENTITY_COPY}</p>
      <p className="text-xs text-muted-foreground">{INDIVIDUAL_IDENTITY_UPLOAD_COPY}</p>
      <p className="text-xs text-muted-foreground">{STAFF_VERIFY_COPY}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1.5">
          <Label htmlFor="individual-staged-doc-kind">Document kind</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as GuestDocumentKind)}>
            <SelectTrigger id="individual-staged-doc-kind" data-testid="individual-staged-doc-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUEST_DOCUMENT_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {GUEST_DOCUMENT_KIND_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          data-testid="individual-identity-stage-button"
          onClick={() => fileRef.current?.click()}
        >
          Stage file
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={IDENTITY_UPLOAD_ACCEPT.join(",")}
          className="hidden"
          data-testid="individual-identity-stage-input"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((item) => (
            <li
              key={item.key}
              data-testid="individual-identity-staged-row"
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>
                {item.file.name} · {GUEST_DOCUMENT_KIND_LABELS[item.kind]}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="individual-identity-staged-remove"
                onClick={() => onChange(files.filter((row) => row.key !== item.key))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
