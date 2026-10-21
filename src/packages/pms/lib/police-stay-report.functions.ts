import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireReservationManager } from "@/packages/pms/lib/reservations.server";
import { formatDateTimeInZone } from "@/shared/lib/property-time";
import {
  guardedPoliceRelease,
  policeAccessSnapshot,
  policeExcelFileName,
  policeExportFilters,
  policeWorkbookRows,
  recordPoliceReportAccess,
  releasePoliceDelivery,
  releasePoliceWorkbook,
  type PoliceAccessDb,
} from "@/packages/pms/lib/police-stay-export";
import {
  POLICE_STAY_PRESENCE,
  type PoliceStayPresence,
  type PoliceStayReportResult,
} from "@/packages/pms/lib/police-stay-report";
import {
  loadPoliceStayReport,
  type PoliceStayDb,
} from "@/packages/pms/lib/police-stay-report.server";
import { writePoliceStayWorkbook } from "@/packages/pms/lib/police-stay-workbook.server";
import { REPORT_PAGE_SIZES } from "@/packages/pms/lib/reports-shell";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD stay date.");
const textFilter = z.string().trim().max(120).optional();

/**
 * Canonical Police / Guest Stay read. Front Office managers only.
 * After authorization, reads use the service client — authenticated logins
 * cannot SELECT restaurants.business_date. Screen reads are not audited.
 * export=true is a print and is audited before the rows are returned.
 * Card 7 report policy flags are not consulted.
 */
export const getPoliceStayReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        stayDate: dateSchema,
        name: textFilter,
        nationality: z.string().trim().max(80).optional(),
        presence: z.enum(POLICE_STAY_PRESENCE).optional(),
        room: z.string().trim().max(80).optional(),
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
  .handler(async ({ data, context }): Promise<PoliceStayReportResult> => {
    const db = await policeTrustedDb();
    return guardedPoliceRelease({
      authorize: () => authorizePolice(context, data.restaurantId),
      release: (actor) =>
        releasePoliceDelivery({
          exporting: data.export === true,
          load: () => loadPoliceStayReport(db, data.restaurantId, data),
          audit: (result) =>
            recordPoliceReportAccess(db, {
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

/**
 * Full filtered workbook. Built on the server from loadPoliceStayReport,
 * then audited, then returned. The browser does not assemble the register.
 */
export const exportPoliceStayWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        stayDate: dateSchema,
        name: textFilter,
        nationality: z.string().trim().max(80).optional(),
        presence: z.enum(POLICE_STAY_PRESENCE).optional(),
        room: z.string().trim().max(80).optional(),
        propertyName: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fileName: string; base64: string }> => {
    const db = await policeTrustedDb();
    const presence: PoliceStayPresence = data.presence ?? "IN_HOUSE";
    const filters = policeExportFilters({
      stayDate: data.stayDate,
      presence,
      name: data.name,
      nationality: data.nationality,
      room: data.room,
    });
    return guardedPoliceRelease({
      authorize: () => authorizePolice(context, data.restaurantId),
      release: (actor) =>
        releasePoliceWorkbook({
          load: () => loadPoliceStayReport(db, data.restaurantId, filters),
          build: async (result) => {
            const sheet = policeWorkbookRows({
              propertyName: data.propertyName ?? "",
              stayDate: result.context.stayDate,
              presence: result.context.presence,
              generatedAt: formatDateTimeInZone(new Date().toISOString(), result.context.timezone),
              rows: result.rows,
              namedGuestCount: result.summary.namedGuestCount,
              unnamedOccupantCount: result.summary.unnamedOccupantCount,
            });
            const bytes = await writePoliceStayWorkbook(sheet);
            return {
              fileName: policeExcelFileName(result.context.stayDate, result.context.presence),
              base64: Buffer.from(bytes).toString("base64"),
            };
          },
          audit: (result) =>
            recordPoliceReportAccess(db, {
              restaurantId: data.restaurantId,
              membershipId: actor.id,
              userId: actor.userId,
              action: "excel_export",
              filters: policeAccessSnapshot(filters),
              rowCount: result.total,
            }),
        }),
    });
  });

/** Same trusted property clock path as Night Audit and the reservation desk. */
async function policeTrustedDb(): Promise<PoliceStayDb & PoliceAccessDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as PoliceStayDb & PoliceAccessDb;
}

async function authorizePolice(
  context: { userId?: string },
  restaurantId: string,
): Promise<{ id: string; userId: string | null }> {
  const membership = await requireReservationManager(context as never, restaurantId);
  return { id: membership.id, userId: context.userId ?? null };
}

function snapshotFilters(data: {
  stayDate: string;
  presence?: PoliceStayPresence | undefined;
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
}) {
  return {
    stayDate: data.stayDate,
    presence: data.presence ?? "IN_HOUSE",
    name: data.name,
    nationality: data.nationality,
    room: data.room,
  };
}
