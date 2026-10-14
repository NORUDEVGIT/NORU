/**
 * Expands one frozen invoice group into a source fiscal line plus any tax
 * that is mapped as its own item. Amounts come from the frozen tax lines.
 * Settings rates are not read here.
 */
import {
  FISCAL_ITEM_UNIT,
  fiscalItemCodeNumber,
  fiscalNatureOfSupplies,
  type FiscalNatureOfSupplies,
} from "./fiscal.types.ts";

function fiscalMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type FiscalTaxMap = {
  mappingKind: "TAX" | "NO_TAX";
  pmsTaxId: string | null;
  externalTaxCode: string;
  active: boolean;
  fiscalTreatment?: FiscalTaxTreatment | null;
  externalItemCode?: string | null;
  externalUnit?: string | null;
  natureOfSupplies?: string | null;
  harmonizationCode?: string | null;
};

export type FiscalLineDraft = {
  Unit: typeof FISCAL_ITEM_UNIT;
  TaxCode: string;
  Discount: number;
  ItemCode: number;
  Quantity: number;
  TaxAmount: number;
  UnitPrice: number;
  PreTaxValue: number;
  ExciseTaxValue: number;
  TotalLineAmount: number;
  NatureOfSupplies: FiscalNatureOfSupplies;
  HarmonizationCode: string | null;
  ProductDescription: string;
};

export type CorrectionSourceLine = {
  index: number;
  preTax: number;
  tax: number;
};

export const FISCAL_TAX_TREATMENTS = ["SAME_LINE_TAX", "SEPARATE_ITEM"] as const;
export type FiscalTaxTreatment = (typeof FISCAL_TAX_TREATMENTS)[number];

export type NoruFiscalLineLink = {
  lineNumber: number;
  role: "source" | "separate_tax";
  groupKey: string;
  taxId: string | null;
  taxTransactionId: string | null;
};

export type FiscalFrozenTaxLine = {
  transactionId: string | null;
  taxId: string | null;
  name: string;
  amount: number;
};

export type FiscalLinkDraft = Omit<NoruFiscalLineLink, "lineNumber">;

export function fiscalTaxTreatment(mapping: FiscalTaxMap | null | undefined): FiscalTaxTreatment {
  return mapping?.fiscalTreatment === "SEPARATE_ITEM" ? "SEPARATE_ITEM" : "SAME_LINE_TAX";
}

export function fiscalProviderPayload(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return snapshot;
  if (!("noruFiscalLines" in snapshot)) return snapshot;
  const copy = { ...(snapshot as Record<string, unknown>) };
  delete copy.noruFiscalLines;
  return copy;
}

export function readNoruFiscalLines(snapshot: unknown): NoruFiscalLineLink[] {
  const row = record(snapshot);
  const links = row?.noruFiscalLines;
  if (!Array.isArray(links)) return [];
  return links.flatMap((value) => {
    const link = record(value);
    if (!link) return [];
    const lineNumber = Number(link.lineNumber);
    const groupKey = text(link.groupKey);
    const role =
      link.role === "separate_tax" ? "separate_tax" : link.role === "source" ? "source" : null;
    if (!role || !groupKey || !Number.isInteger(lineNumber) || lineNumber < 1) return [];
    return [
      {
        lineNumber,
        role,
        groupKey,
        taxId: text(link.taxId),
        taxTransactionId: text(link.taxTransactionId),
      },
    ];
  });
}

export function numberFiscalLines(
  drafts: FiscalLineDraft[],
  links: FiscalLinkDraft[],
): { lines: Array<FiscalLineDraft & { LineNumber: number }>; links: NoruFiscalLineLink[] } {
  return {
    lines: drafts.map((draft, index) => ({ ...draft, LineNumber: index + 1 })),
    links: links.map((link, index) => ({ ...link, lineNumber: index + 1 })),
  };
}

export function expandFiscalGroup(input: {
  groupKey: string;
  description: string;
  subtotal: number;
  taxTotal: number;
  taxLines: FiscalFrozenTaxLine[];
  taxMappings: FiscalTaxMap[];
  noTaxCode: string | null;
  source: {
    itemCode: number;
    nature: FiscalNatureOfSupplies;
    harmonizationCode: string | null;
    quantity: number;
    unitPrice: number;
  };
}):
  | {
      ok: true;
      lines: FiscalLineDraft[];
      links: FiscalLinkDraft[];
      sameLineTax: number;
      separatePretax: number;
    }
  | { ok: false; reason: string; missingTax: string | null } {
  const active = input.taxMappings.filter((mapping) => mapping.active);
  if (input.taxLines.length === 0) {
    if (!input.noTaxCode) {
      return { ok: false, reason: 'Missing tax mapping for "No tax".', missingTax: "No tax" };
    }
    const taxAmount = fiscalMoney(input.taxTotal);
    return {
      ok: true,
      sameLineTax: taxAmount,
      separatePretax: 0,
      lines: [sourceLine(input, input.noTaxCode, taxAmount)],
      links: [sourceLink(input.groupKey, null, null)],
    };
  }

  const frozenTax = fiscalMoney(input.taxLines.reduce((sum, tax) => sum + tax.amount, 0));
  if (Math.abs(frozenTax - fiscalMoney(input.taxTotal)) > 0.01) {
    return {
      ok: false,
      reason: `The frozen tax for "${input.description}" does not match the line tax.`,
      missingTax: null,
    };
  }

  const sameLine: FiscalFrozenTaxLine[] = [];
  const separate: Array<{ tax: FiscalFrozenTaxLine; mapping: FiscalTaxMap }> = [];
  for (const tax of input.taxLines) {
    const mapping = active.find(
      (row) => row.mappingKind === "TAX" && row.pmsTaxId && row.pmsTaxId === tax.taxId,
    );
    if (!mapping) {
      return {
        ok: false,
        reason: `Tax '${tax.name}' requires a fiscal mapping.`,
        missingTax: tax.name,
      };
    }
    if (fiscalTaxTreatment(mapping) === "SEPARATE_ITEM") separate.push({ tax, mapping });
    else sameLine.push(tax);
  }
  if (sameLine.length > 1) {
    return {
      ok: false,
      reason: "Multiple same-line fiscal taxes are not supported.",
      missingTax: null,
    };
  }

  const same = sameLine[0] ?? null;
  const sameMapping = same
    ? active.find((row) => row.mappingKind === "TAX" && row.pmsTaxId === same.taxId)
    : null;
  const sameCode = sameMapping?.externalTaxCode.trim() ?? "";
  if (same && sameCode.length === 0) {
    return {
      ok: false,
      reason: `Tax '${same.name}' requires a fiscal mapping.`,
      missingTax: same.name,
    };
  }
  if (!same && !input.noTaxCode) {
    return { ok: false, reason: 'Missing tax mapping for "No tax".', missingTax: "No tax" };
  }

  const separateLines: FiscalLineDraft[] = [];
  const separateLinks: FiscalLinkDraft[] = [];
  for (const entry of separate) {
    const itemCode = fiscalItemCodeNumber(entry.mapping.externalItemCode ?? "");
    if (itemCode == null) {
      return {
        ok: false,
        reason: `Tax '${entry.tax.name}' is configured as a separate fiscal item but has no fiscal ItemCode.`,
        missingTax: entry.tax.name,
      };
    }
    const nature = fiscalNatureOfSupplies((entry.mapping.natureOfSupplies ?? "service").trim());
    if (!nature) {
      return {
        ok: false,
        reason: `Tax '${entry.tax.name}' is configured as a separate fiscal item but has no nature of supplies.`,
        missingTax: entry.tax.name,
      };
    }
    const amount = fiscalMoney(entry.tax.amount);
    separateLines.push({
      Unit: FISCAL_ITEM_UNIT,
      TaxCode: entry.mapping.externalTaxCode.trim(),
      Discount: 0,
      ItemCode: itemCode,
      Quantity: 1,
      TaxAmount: 0,
      UnitPrice: amount,
      PreTaxValue: amount,
      ExciseTaxValue: 0,
      TotalLineAmount: amount,
      NatureOfSupplies: nature,
      HarmonizationCode: entry.mapping.harmonizationCode?.trim() || null,
      ProductDescription: entry.tax.name,
    });
    separateLinks.push({
      role: "separate_tax",
      groupKey: input.groupKey,
      taxId: entry.tax.taxId,
      taxTransactionId: entry.tax.transactionId,
    });
  }

  const sameLineTax = fiscalMoney(same?.amount ?? 0);
  const separatePretax = fiscalMoney(
    separateLines.reduce((sum, line) => sum + line.PreTaxValue, 0),
  );
  const source = sourceLine(input, same ? sameCode : (input.noTaxCode as string), sameLineTax);
  const economic = fiscalMoney(source.TotalLineAmount + separatePretax);
  const expected = fiscalMoney(input.subtotal + input.taxTotal);
  if (Math.abs(economic - expected) > 0.01) {
    return {
      ok: false,
      reason: "Fiscal item totals do not reconcile to the issued invoice total.",
      missingTax: null,
    };
  }
  return {
    ok: true,
    lines: [source, ...separateLines],
    links: [
      sourceLink(input.groupKey, same?.taxId ?? null, same?.transactionId ?? null),
      ...separateLinks,
    ],
    sameLineTax,
    separatePretax,
  };
}

export type NoteComponent = { id: string | null; kind: string; credited: number };

export function noteComponents(group: Record<string, unknown> | null): NoteComponent[] {
  if (!group || !Array.isArray(group.components)) return [];
  return group.components.flatMap((value) => {
    const row = record(value);
    if (!row) return [];
    return [
      {
        id: text(row.id),
        kind: text(row.kind) ?? "",
        credited: fiscalMoney(Math.abs(numberValue(row.credited))),
      },
    ];
  });
}

export type CorrectionPart = {
  line: CorrectionSourceLine & Record<string, unknown>;
  pretax: number;
  tax: number;
  role: "source" | "separate_tax";
};

export function fiscalNoTaxCode(mappings: FiscalTaxMap[]): string | null {
  const code =
    mappings
      .find((mapping) => mapping.active && mapping.mappingKind === "NO_TAX")
      ?.externalTaxCode.trim() ?? "";
  return code.length > 0 ? code : null;
}

export function reconcileFiscalInvoice(input: {
  lines: Array<{ PreTaxValue: number; TaxAmount: number; TotalLineAmount: number }>;
  links: Array<{ role: "source" | "separate_tax" }>;
  subtotal: number;
  tax: number;
  total: number;
}):
  | { ok: true; sourcePretax: number; taxValue: number; totalValue: number }
  | { ok: false; reason: string } {
  const reason = "Fiscal item totals do not reconcile to the issued invoice total.";
  if (input.lines.length !== input.links.length) return { ok: false, reason };
  let sourcePretax = 0;
  let separatePretax = 0;
  let taxValue = 0;
  let totalValue = 0;
  input.lines.forEach((line, index) => {
    taxValue += line.TaxAmount;
    totalValue += line.TotalLineAmount;
    if (input.links[index]?.role === "separate_tax") separatePretax += line.PreTaxValue;
    else sourcePretax += line.PreTaxValue;
  });
  sourcePretax = fiscalMoney(sourcePretax);
  separatePretax = fiscalMoney(separatePretax);
  taxValue = fiscalMoney(taxValue);
  totalValue = fiscalMoney(totalValue);
  if (Math.abs(sourcePretax - fiscalMoney(input.subtotal)) > 0.01) return { ok: false, reason };
  if (Math.abs(fiscalMoney(taxValue + separatePretax) - fiscalMoney(input.tax)) > 0.01) {
    return { ok: false, reason };
  }
  if (Math.abs(totalValue - fiscalMoney(input.total)) > 0.01) return { ok: false, reason };
  return { ok: true, sourcePretax, taxValue, totalValue };
}

export function expandCorrectionGroup(input: {
  groupKey: string;
  pretax: number;
  tax: number;
  components: NoteComponent[];
  links: NoruFiscalLineLink[];
  lines: Array<CorrectionSourceLine & Record<string, unknown>>;
  documentLabel?: string;
}): { ok: true; parts: CorrectionPart[] } | { ok: false; reason: string } {
  const label = input.documentLabel ?? "Credit Note";
  const unmatched = `${label} line cannot be matched to an original fiscal invoice line.`;
  const exceeds = `${label} amount exceeds the original fiscal line.`;
  const unidentified =
    label === "Debit Note"
      ? "This debit note does not identify the separate tax amounts."
      : "This credit note does not identify the separate tax amounts.";
  const groupLinks = input.links
    .filter((link) => link.groupKey === input.groupKey)
    .sort((left, right) => left.lineNumber - right.lineNumber);
  if (groupLinks.length === 0) {
    return { ok: false, reason: unmatched };
  }
  const separateLinks = groupLinks.filter((link) => link.role === "separate_tax");
  const sourceLinkRow = groupLinks.find((link) => link.role === "source") ?? null;
  if (!sourceLinkRow && separateLinks.length === 0) {
    return { ok: false, reason: unmatched };
  }
  const separateIds = new Set(
    separateLinks.map((link) => link.taxTransactionId).filter((id): id is string => Boolean(id)),
  );
  if (separateLinks.length > 0 && input.components.length === 0) {
    return { ok: false, reason: unidentified };
  }

  const parts: CorrectionPart[] = [];
  if (sourceLinkRow) {
    const line = input.lines[sourceLinkRow.lineNumber - 1];
    if (!line) {
      return { ok: false, reason: unmatched };
    }
    const pretax =
      input.components.length > 0
        ? fiscalMoney(
            input.components
              .filter((component) => component.kind === "parent")
              .reduce((sum, component) => sum + component.credited, 0),
          )
        : input.pretax;
    const tax =
      input.components.length > 0
        ? fiscalMoney(
            input.components
              .filter(
                (component) =>
                  component.kind === "tax" &&
                  (sourceLinkRow.taxTransactionId
                    ? component.id === sourceLinkRow.taxTransactionId
                    : component.id == null || !separateIds.has(component.id)),
              )
              .reduce((sum, component) => sum + component.credited, 0),
          )
        : input.tax;
    if (pretax > line.preTax + 0.01 || tax > line.tax + 0.01) {
      return { ok: false, reason: exceeds };
    }
    if (pretax > 0.009 || tax > 0.009) parts.push({ line, pretax, tax, role: "source" });
  }

  for (const link of separateLinks) {
    const line = input.lines[link.lineNumber - 1];
    if (!line) {
      return { ok: false, reason: unmatched };
    }
    const component = input.components.find(
      (row) =>
        row.kind === "tax" && link.taxTransactionId != null && row.id === link.taxTransactionId,
    );
    if (!component) {
      return { ok: false, reason: unidentified };
    }
    if (component.credited > line.preTax + 0.01) {
      return { ok: false, reason: exceeds };
    }
    if (component.credited > 0.009) {
      parts.push({ line, pretax: component.credited, tax: 0, role: "separate_tax" });
    }
  }

  if (parts.length === 0) {
    return { ok: false, reason: `${label} line has no pretax amount.` };
  }
  const covered = fiscalMoney(parts.reduce((sum, part) => sum + part.pretax + part.tax, 0));
  if (Math.abs(covered - fiscalMoney(input.pretax + input.tax)) > 0.01) {
    return {
      ok: false,
      reason: "Fiscal item totals do not reconcile to the issued invoice total.",
    };
  }
  return { ok: true, parts };
}

export type DebitTaxComponent = {
  id: string | null;
  kind: string;
  amount: number;
  taxId: string | null;
};

export function debitTaxComponents(snapshot: unknown, sourceGroupId: string): DebitTaxComponent[] {
  const row = record(snapshot);
  if (!row || !Array.isArray(row.lines)) return [];
  return row.lines.flatMap((value) => {
    const line = record(value);
    if (!line || text(line.sourceGroupId) !== sourceGroupId) return [];
    const snap = record(line.snapshot);
    const direct = text(record(snap?.taxSnapshot)?.taxId);
    const componentId = text(line.componentTransactionId) ?? text(line.id);
    let taxId = direct;
    if (!taxId && Array.isArray(snap?.taxLines)) {
      const match = snap.taxLines
        .map(record)
        .find((taxLine) => taxLine != null && text(taxLine.id) === componentId);
      taxId = text(record(match?.taxSnapshot)?.taxId);
    }
    return [
      {
        id: componentId,
        kind: text(line.kind) ?? "",
        amount: fiscalMoney(Math.abs(numberValue(line.amount))),
        taxId,
      },
    ];
  });
}

export function expandLinkedDebitGroup(input: {
  groupKey: string;
  pretax: number;
  tax: number;
  components: DebitTaxComponent[];
  links: NoruFiscalLineLink[];
  lines: Array<CorrectionSourceLine & Record<string, unknown>>;
  invoiceGroupCount: number;
}): { ok: true; parts: CorrectionPart[]; explicit: boolean } | { ok: false; reason: string } {
  const unmatched = "Debit Note line cannot be matched to an original fiscal invoice line.";
  const unidentified = "This debit note does not identify the separate tax amounts.";
  const groupKeys = [...new Set(input.links.map((link) => link.groupKey))];
  let groupLinks = input.links
    .filter((link) => link.groupKey === input.groupKey)
    .sort((left, right) => left.lineNumber - right.lineNumber);
  const explicit = groupLinks.length > 0;
  if (!explicit) {
    if (input.invoiceGroupCount === 1 && groupKeys.length === 1) {
      groupLinks = input.links
        .filter((link) => link.groupKey === groupKeys[0])
        .sort((left, right) => left.lineNumber - right.lineNumber);
    } else {
      return { ok: false, reason: unmatched };
    }
  }
  const separateLinks = groupLinks.filter((link) => link.role === "separate_tax");
  const sourceLinkRow = groupLinks.find((link) => link.role === "source") ?? null;
  if (!sourceLinkRow) return { ok: false, reason: unmatched };
  const source = input.lines[sourceLinkRow.lineNumber - 1];
  if (!source) return { ok: false, reason: unmatched };

  if (input.components.length === 0) {
    if (separateLinks.length > 0) return { ok: false, reason: unidentified };
    if (input.pretax <= 0.009 && input.tax <= 0.009) {
      return { ok: false, reason: "Debit Note line has no pretax amount." };
    }
    return {
      ok: true,
      explicit,
      parts: [{ line: source, pretax: input.pretax, tax: input.tax, role: "source" }],
    };
  }

  const used = new Set<number>();
  const separateParts: CorrectionPart[] = [];
  for (const link of separateLinks) {
    const line = input.lines[link.lineNumber - 1];
    if (!line) return { ok: false, reason: unmatched };
    const index = input.components.findIndex(
      (component, componentIndex) =>
        !used.has(componentIndex) &&
        component.kind === "tax" &&
        ((link.taxTransactionId != null && component.id === link.taxTransactionId) ||
          (link.taxId != null && component.taxId != null && component.taxId === link.taxId)),
    );
    if (index < 0) continue;
    used.add(index);
    const amount = fiscalMoney(input.components[index]?.amount ?? 0);
    if (amount > 0.009) separateParts.push({ line, pretax: amount, tax: 0, role: "separate_tax" });
  }
  for (const [index, component] of input.components.entries()) {
    if (component.kind !== "tax" || used.has(index)) continue;
    if (
      component.taxId &&
      sourceLinkRow.taxId &&
      component.taxId !== sourceLinkRow.taxId &&
      !separateLinks.some((link) => link.taxId === component.taxId)
    ) {
      return { ok: false, reason: unidentified };
    }
  }
  const hasParent = input.components.some((component) => component.kind === "parent");
  const pretax = hasParent
    ? fiscalMoney(
        input.components
          .filter((component) => component.kind === "parent")
          .reduce((sum, component) => sum + component.amount, 0),
      )
    : input.pretax;
  const sourceTax = fiscalMoney(
    input.components
      .filter((component, index) => component.kind === "tax" && !used.has(index))
      .reduce((sum, component) => sum + component.amount, 0),
  );
  const parts: CorrectionPart[] = [];
  if (pretax > 0.009 || sourceTax > 0.009) {
    parts.push({ line: source, pretax, tax: sourceTax, role: "source" });
  }
  parts.push(...separateParts);
  if (parts.length === 0) return { ok: false, reason: "Debit Note line has no pretax amount." };
  const covered = fiscalMoney(parts.reduce((sum, part) => sum + part.pretax + part.tax, 0));
  if (Math.abs(covered - fiscalMoney(input.pretax + input.tax)) > 0.01) {
    return {
      ok: false,
      reason: "Fiscal item totals do not reconcile to the issued invoice total.",
    };
  }
  return { ok: true, explicit, parts };
}

function sourceLine(
  input: {
    description: string;
    subtotal: number;
    source: {
      itemCode: number;
      nature: FiscalNatureOfSupplies;
      harmonizationCode: string | null;
      quantity: number;
      unitPrice: number;
    };
  },
  taxCode: string,
  taxAmount: number,
): FiscalLineDraft {
  return {
    Unit: FISCAL_ITEM_UNIT,
    TaxCode: taxCode,
    Discount: 0,
    ItemCode: input.source.itemCode,
    Quantity: input.source.quantity,
    TaxAmount: taxAmount,
    UnitPrice: input.source.unitPrice,
    PreTaxValue: fiscalMoney(input.subtotal),
    ExciseTaxValue: 0,
    TotalLineAmount: fiscalMoney(input.subtotal + taxAmount),
    NatureOfSupplies: input.source.nature,
    HarmonizationCode: input.source.harmonizationCode,
    ProductDescription: input.description,
  };
}

function sourceLink(
  groupKey: string,
  taxId: string | null,
  taxTransactionId: string | null,
): FiscalLinkDraft {
  return { role: "source", groupKey, taxId, taxTransactionId };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
