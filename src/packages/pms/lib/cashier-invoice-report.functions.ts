import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCashieringAccess } from "@/packages/pms/lib/cashiering.server";
import { formatDateTimeInZone } from "@/shared/lib/property-time";
import {
  CASHIER_DOCUMENT_TYPES,
  CASHIER_REPORT_GRAINS,
  type CashierInvoiceReportResult,
} from "@/packages/pms/lib/cashier-invoice-report";
import {
  cashierAccessSnapshot,
  cashierExcelFileName,
  cashierWorkbookRows,
  recordCashierReportAccess,
  releaseCashierDelivery,
  releaseCashierWorkbook,
} from "@/packages/pms/lib/cashier-invoice-export";
import {
  loadCashierInvoiceReport,
  type CashierInvoiceDb,
} from "@/packages/pms/lib/cashier-invoice-report.server";
import { writePoliceStayWorkbook } from "@/packages/pms/lib/police-stay-workbook.server";
import type { PoliceAccessDb } from "@/packages/pms/lib/police-stay-export";
import { REPORT_PAGE_SIZES } from "@/packages/pms/lib/reports-shell";
import { guardedPoliceRelease } from "@/packages/pms/lib/police-stay-export";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/**
 * Cashier Invoice issued-document register. Accounting roles only.
 * After authorization, reads use the trusted server client.
 */
export const getCashierInvoiceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        grain: z.enum(CASHIER_REPORT_GRAINS).optional(),
        documentType: z.enum(CASHIER_DOCUMENT_TYPES).optional(),
        query: z.string().trim().max(120).optional(),
        issuerId: idSchema.optional(),
        page: z.number().int().min(1).max(10000).optional(),
        pageSize: z
          .union([
            z.literal(REPORT_PAGE_SIZES[0]),
            z.literal(REPORT_PAGE_SIZES[1]),
            z.literal(REPORT_PAGE_SIZES[2]),
          ])
          .optional(),
        export: z.boolean().optional(),
        action: z.enum(["print", "excel_export"]).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.export === true && !value.action) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A print or export action is required.",
            path: ["action"],
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CashierInvoiceReportResult> => {
    const db = await cashierTrustedDb();
    return guardedPoliceRelease({
      authorize: () => authorizeCashier(context, data.restaurantId),
      release: (actor) =>
        releaseCashierDelivery({
          exporting: data.export === true,
          load: () => loadCashierInvoiceReport(db, data.restaurantId, data),
          audit: (result) =>
            recordCashierReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              action: data.action === "excel_export" ? "excel_export" : "print",
              filters: snapshotFilters(data),
              rowCount: result.total,
            }),
        }),
    });
  });

export const exportCashierInvoiceWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        grain: z.enum(CASHIER_REPORT_GRAINS).optional(),
        documentType: z.enum(CASHIER_DOCUMENT_TYPES).optional(),
        query: z.string().trim().max(120).optional(),
        issuerId: idSchema.optional(),
        propertyName: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fileName: string; base64: string }> => {
    const db = await cashierTrustedDb();
    const filters = {
      from: data.from,
      to: data.to,
      grain: data.grain ?? "summary",
      documentType: data.documentType ?? "INV",
      export: true as const,
      ...(data.query ? { query: data.query } : {}),
      ...(data.issuerId ? { issuerId: data.issuerId } : {}),
    };
    return guardedPoliceRelease({
      authorize: () => authorizeCashier(context, data.restaurantId),
      release: (actor) =>
        releaseCashierWorkbook({
          load: () => loadCashierInvoiceReport(db, data.restaurantId, filters),
          build: async (result) => {
            const sheet = cashierWorkbookRows(
              result,
              data.propertyName ?? "",
              formatDateTimeInZone(new Date().toISOString(), result.context.timezone),
            );
            const bytes = await writePoliceStayWorkbook(sheet);
            return {
              fileName: cashierExcelFileName({
                from: result.context.from,
                to: result.context.to,
                grain: result.grain,
              }),
              base64: Buffer.from(bytes).toString("base64"),
            };
          },
          audit: (result) =>
            recordCashierReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              action: "excel_export",
              filters: cashierAccessSnapshot(filters),
              rowCount: result.total,
            }),
        }),
    });
  });

async function cashierTrustedDb(): Promise<CashierInvoiceDb & PoliceAccessDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as CashierInvoiceDb & PoliceAccessDb;
}

async function authorizeCashier(
  context: { userId?: string },
  restaurantId: string,
): Promise<{ id: string; userId: string | null }> {
  const membership = await requireCashieringAccess(context as never, restaurantId);
  return { id: membership.id, userId: context.userId ?? null };
}

function snapshotFilters(data: {
  from: string;
  to: string;
  grain?: string | undefined;
  documentType?: string | undefined;
  query?: string | undefined;
  issuerId?: string | undefined;
}) {
  return {
    from: data.from,
    to: data.to,
    grain: data.grain ?? "summary",
    documentType: data.documentType ?? "INV",
    query: data.query,
    issuerId: data.issuerId,
  };
}
