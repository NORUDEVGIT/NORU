import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFrontOfficeAccess } from "@/packages/pms/lib/rooms.server";
import { formatDateTimeInZone } from "@/shared/lib/property-time";
import { ENTITLEMENT_STATUSES } from "@/packages/pms/lib/service-entitlement";
import {
  serviceAccessSnapshot,
  serviceExcelFileName,
  serviceWorkbookRows,
  recordServiceReportAccess,
  releaseServiceDelivery,
  releaseServiceWorkbook,
} from "@/packages/pms/lib/service-entitlement-export";
import {
  SERVICE_MEAL_FILTERS,
  SERVICE_REPORT_CATEGORIES,
  SERVICE_STATUS_FILTERS,
  SERVICE_STAY_FILTERS,
  type ServiceEntitlementReportResult,
} from "@/packages/pms/lib/service-entitlement-report";
import {
  loadServiceEntitlementReport,
  updateServiceEntitlementStatus,
  type ServiceEntitlementDb,
} from "@/packages/pms/lib/service-entitlement.server";
import { writePoliceStayWorkbook } from "@/packages/pms/lib/police-stay-workbook.server";
import { guardedPoliceRelease, type PoliceAccessDb } from "@/packages/pms/lib/police-stay-export";
import { REPORT_PAGE_SIZES } from "@/packages/pms/lib/reports-shell";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/**
 * Operational meal and service reports. Front Office roles only.
 * Reads stored entitlements after reconciling stays that cover the service date.
 * Printing does not mark a service completed.
 */
export const getServiceEntitlementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        serviceDate: dateSchema,
        category: z.enum(SERVICE_REPORT_CATEGORIES),
        meal: z.enum(SERVICE_MEAL_FILTERS).optional(),
        departmentId: idSchema.optional(),
        serviceId: idSchema.optional(),
        status: z.enum(SERVICE_STATUS_FILTERS).optional(),
        stay: z.enum(SERVICE_STAY_FILTERS).optional(),
        room: z.string().trim().max(40).optional(),
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
  .handler(async ({ data, context }): Promise<ServiceEntitlementReportResult> => {
    const db = await serviceTrustedDb();
    return guardedPoliceRelease({
      authorize: () => authorizeService(context, data.restaurantId),
      release: (actor) =>
        releaseServiceDelivery({
          exporting: data.export === true,
          load: () => loadServiceEntitlementReport(db, data.restaurantId, data),
          audit: (result) =>
            recordServiceReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              category: data.category,
              action: data.action === "excel_export" ? "excel_export" : "print",
              filters: serviceAccessSnapshot(data),
              rowCount: result.total,
            }),
        }),
    });
  });

export const exportServiceEntitlementWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        serviceDate: dateSchema,
        category: z.enum(SERVICE_REPORT_CATEGORIES),
        meal: z.enum(SERVICE_MEAL_FILTERS).optional(),
        departmentId: idSchema.optional(),
        serviceId: idSchema.optional(),
        status: z.enum(SERVICE_STATUS_FILTERS).optional(),
        stay: z.enum(SERVICE_STAY_FILTERS).optional(),
        room: z.string().trim().max(40).optional(),
        propertyName: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fileName: string; base64: string }> => {
    const db = await serviceTrustedDb();
    const filters = { ...data, export: true as const };
    return guardedPoliceRelease({
      authorize: () => authorizeService(context, data.restaurantId),
      release: (actor) =>
        releaseServiceWorkbook({
          load: () => loadServiceEntitlementReport(db, data.restaurantId, filters),
          build: async (result) => {
            const sheet = serviceWorkbookRows(
              result,
              data.propertyName ?? "",
              formatDateTimeInZone(new Date().toISOString(), result.context.timezone),
            );
            const bytes = await writePoliceStayWorkbook(sheet);
            return {
              fileName: serviceExcelFileName({
                category: result.context.category,
                serviceDate: result.context.serviceDate,
                meal: result.context.meal,
              }),
              base64: Buffer.from(bytes).toString("base64"),
            };
          },
          audit: (result) =>
            recordServiceReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              category: data.category,
              action: "excel_export",
              filters: serviceAccessSnapshot(data),
              rowCount: result.total,
            }),
        }),
    });
  });

export const setServiceEntitlementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        entitlementId: idSchema,
        status: z.enum(ENTITLEMENT_STATUSES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const db = await serviceTrustedDb();
    const actor = await authorizeService(context, data.restaurantId);
    await updateServiceEntitlementStatus(
      db,
      data.restaurantId,
      data.entitlementId,
      data.status,
      actor.id,
    );
    return { ok: true };
  });

async function serviceTrustedDb(): Promise<ServiceEntitlementDb & PoliceAccessDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as ServiceEntitlementDb & PoliceAccessDb;
}

async function authorizeService(
  context: { userId?: string },
  restaurantId: string,
): Promise<{ id: string; userId: string | null }> {
  const membership = await requireFrontOfficeAccess(context as never, restaurantId);
  return { id: membership.id, userId: context.userId ?? null };
}
