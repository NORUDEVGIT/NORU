import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCashieringAccess } from "@/packages/pms/lib/cashiering.server";
import { formatDateTimeInZone } from "@/shared/lib/property-time";
import {
  FISCAL_REPORT_DOCUMENT_TYPES,
  FISCAL_REPORT_MODES,
  FISCAL_REPORT_STATUSES,
  type FiscalRegistrationReportResult,
} from "@/packages/pms/lib/fiscal-registration-report";
import {
  fiscalAccessSnapshot,
  fiscalExcelFileName,
  fiscalWorkbookRows,
  recordFiscalReportAccess,
  releaseFiscalDelivery,
  releaseFiscalWorkbook,
} from "@/packages/pms/lib/fiscal-registration-export";
import {
  loadFiscalRegistrationReport,
  type FiscalRegistrationDb,
} from "@/packages/pms/lib/fiscal-registration-report.server";
import { writePoliceStayWorkbook } from "@/packages/pms/lib/police-stay-workbook.server";
import type { PoliceAccessDb } from "@/packages/pms/lib/police-stay-export";
import { REPORT_PAGE_SIZES } from "@/packages/pms/lib/reports-shell";
import { guardedPoliceRelease } from "@/packages/pms/lib/police-stay-export";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/**
 * Fiscal Registration provider outbox register. Accounting roles only.
 * After authorization, reads use the trusted server client.
 */
export const getFiscalRegistrationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        documentType: z.enum(FISCAL_REPORT_DOCUMENT_TYPES).optional(),
        mode: z.enum(FISCAL_REPORT_MODES).optional(),
        status: z.enum(FISCAL_REPORT_STATUSES).optional(),
        query: z.string().trim().max(120).optional(),
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
  .handler(async ({ data, context }): Promise<FiscalRegistrationReportResult> => {
    const db = await fiscalTrustedDb();
    return guardedPoliceRelease({
      authorize: () => authorizeFiscal(context, data.restaurantId),
      release: (actor) =>
        releaseFiscalDelivery({
          exporting: data.export === true,
          load: () => loadFiscalRegistrationReport(db, data.restaurantId, data),
          audit: (result) =>
            recordFiscalReportAccess(db, {
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

export const exportFiscalRegistrationWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        documentType: z.enum(FISCAL_REPORT_DOCUMENT_TYPES).optional(),
        mode: z.enum(FISCAL_REPORT_MODES).optional(),
        status: z.enum(FISCAL_REPORT_STATUSES).optional(),
        query: z.string().trim().max(120).optional(),
        propertyName: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fileName: string; base64: string }> => {
    const db = await fiscalTrustedDb();
    const filters = {
      from: data.from,
      to: data.to,
      documentType: data.documentType ?? ("INV" as const),
      mode: data.mode ?? ("ALL" as const),
      status: data.status ?? ("ALL" as const),
      export: true as const,
      ...(data.query ? { query: data.query } : {}),
    };
    return guardedPoliceRelease({
      authorize: () => authorizeFiscal(context, data.restaurantId),
      release: (actor) =>
        releaseFiscalWorkbook({
          load: () => loadFiscalRegistrationReport(db, data.restaurantId, filters),
          build: async (result) => {
            const sheet = fiscalWorkbookRows(
              result,
              data.propertyName ?? "",
              formatDateTimeInZone(new Date().toISOString(), result.context.timezone),
            );
            const bytes = await writePoliceStayWorkbook(sheet);
            return {
              fileName: fiscalExcelFileName({
                from: result.context.from,
                to: result.context.to,
              }),
              base64: Buffer.from(bytes).toString("base64"),
            };
          },
          audit: (result) =>
            recordFiscalReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              action: "excel_export",
              filters: fiscalAccessSnapshot(filters),
              rowCount: result.total,
            }),
        }),
    });
  });

async function fiscalTrustedDb(): Promise<FiscalRegistrationDb & PoliceAccessDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as FiscalRegistrationDb & PoliceAccessDb;
}

async function authorizeFiscal(
  context: { userId?: string },
  restaurantId: string,
): Promise<{ id: string; userId: string | null }> {
  const membership = await requireCashieringAccess(context as never, restaurantId);
  return { id: membership.id, userId: context.userId ?? null };
}

function snapshotFilters(data: {
  from: string;
  to: string;
  documentType?: string | undefined;
  mode?: string | undefined;
  status?: string | undefined;
  query?: string | undefined;
}) {
  return {
    from: data.from,
    to: data.to,
    documentType: data.documentType ?? "INV",
    mode: data.mode ?? "ALL",
    status: data.status ?? "ALL",
    query: data.query,
  };
}
