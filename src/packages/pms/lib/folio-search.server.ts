import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cashierError, requireCashieringAccess, type FolioStatus } from "./cashiering.server";
import {
  FOLIO_SEARCH_DEFAULT_PAGE_SIZE,
  FOLIO_SEARCH_FILTER_ALL,
  FOLIO_SEARCH_PAGE_SIZES,
  FOLIO_STATUS_FILTERS,
  FOLIO_PAYMENT_STATE_FILTERS,
  FOLIO_SEARCH_SORT_OPTIONS,
  resolveStayStatusesForQuery,
  type FolioPaymentStateFilter,
  type FolioSearchSortField,
  type FolioStatusFilter,
  type FolioStayStatusFilter,
} from "./folio-search-filters";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export type GuestFolioSearchRow = {
  id: string;
  folioNumber: string;
  status: FolioStatus;
  currency: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  reservationId: string | null;
  confirmationNumber: string | null;
  openedAt: string;
  closedAt: string | null;
  charges: number;
  credits: number;
  balance: number;
  paymentState: string;
  hasPayments: boolean;
  unsettledCheckout: boolean;
  roomNumber: string | null;
  roomTypeName: string | null;
  reservationStatus: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  ratePlanName: string | null;
  marketSegment: string | null;
  bookingSource: string | null;
  salesChannel: string | null;
  lastActivity: string | null;
};

export type GuestFolioSearchPage = {
  rows: GuestFolioSearchRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type AllAccountSearchRow = {
  accountType: "guest" | "company" | "group";
  accountId: string;
  accountNumber: string;
  accountName: string;
  status: string;
  balance: number;
  currency: string;
  lastActivity: string | null;
  guestFolioId: string | null;
  confirmationNumber: string | null;
  reservationStatus: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
};

export type AllAccountSearchPage = {
  rows: AllAccountSearchRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

const sortFields = FOLIO_SEARCH_SORT_OPTIONS.map((option) => option.sortBy) as [
  FolioSearchSortField,
  ...FolioSearchSortField[],
];

export const guestFolioSearchInputSchema = z
  .object({
    restaurantId: idSchema,
    search: z.string().trim().max(120).optional(),
    folioStatus: z.enum(FOLIO_STATUS_FILTERS).optional(),
    stayStatus: z.enum([
      "all",
      "checked_in",
      "checked_out",
      "confirmed",
      "pending",
      "cancelled",
      "no_show",
    ] as const).optional(),
    stayFrom: dateSchema.optional(),
    stayTo: dateSchema.optional(),
    paymentState: z.enum(FOLIO_PAYMENT_STATE_FILTERS).optional(),
    roomTypeId: idSchema.optional(),
    ratePlanId: idSchema.optional(),
    marketSegment: z.string().trim().min(1).max(120).optional(),
    bookingSource: z.string().trim().min(1).max(120).optional(),
    salesChannel: z.string().trim().min(1).max(120).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    unsettledCheckout: z.boolean().optional(),
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z
      .number()
      .int()
      .refine((value) => (FOLIO_SEARCH_PAGE_SIZES as readonly number[]).includes(value))
      .optional(),
    sortBy: z.enum(sortFields).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (!!value.stayFrom !== !!value.stayTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stay dates require both a start and end.",
        path: ["stayFrom"],
      });
    }
    if (value.stayFrom && value.stayTo && value.stayTo < value.stayFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stay end must be on or after stay start.",
        path: ["stayTo"],
      });
    }
  });

export type GuestFolioSearchInput = z.infer<typeof guestFolioSearchInputSchema>;

type RpcRow = {
  id: string;
  folio_number: string;
  folio_status: FolioStatus;
  currency: string;
  opened_at: string;
  closed_at: string | null;
  reservation_id: string | null;
  guest_id: string;
  settlement_exception: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  confirmation_number: string | null;
  reservation_status: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  room_number: string | null;
  room_type_name: string | null;
  rate_plan_name: string | null;
  market_segment: string | null;
  commercial_booking_source: string | null;
  commercial_sales_channel: string | null;
  balance: number | string;
  charges: number | string;
  credits: number | string;
  has_payments: boolean;
  payment_state: string;
  last_activity: string | null;
};

function guestName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Guest";
}

function mapRow(row: RpcRow): GuestFolioSearchRow {
  return {
    id: row.id,
    folioNumber: row.folio_number,
    status: row.folio_status,
    currency: row.currency,
    guestName: guestName(row.first_name, row.last_name),
    guestEmail: row.email,
    guestPhone: row.phone,
    reservationId: row.reservation_id,
    confirmationNumber: row.confirmation_number,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    charges: Number(row.charges),
    credits: Number(row.credits),
    balance: Number(row.balance),
    paymentState: row.payment_state,
    hasPayments: row.has_payments,
    unsettledCheckout: row.settlement_exception === "unsettled_checkout" && row.folio_status === "open",
    roomNumber: row.room_number,
    roomTypeName: row.room_type_name,
    reservationStatus: row.reservation_status,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    ratePlanName: row.rate_plan_name,
    marketSegment: row.market_segment,
    bookingSource: row.commercial_booking_source,
    salesChannel: row.commercial_sales_channel,
    lastActivity: row.last_activity,
  };
}

function paymentStatesForQuery(
  paymentState: FolioPaymentStateFilter | undefined,
): string[] | null {
  if (!paymentState || paymentState === "all") return null;
  return [paymentState];
}

export async function searchGuestFoliosQuery(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  input: GuestFolioSearchInput,
): Promise<GuestFolioSearchPage> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? FOLIO_SEARCH_DEFAULT_PAGE_SIZE;
  const { args, offset } = buildFolioSearchRpcArgs(input, page, pageSize);
  const searchArgs = {
    ...args,
    _sort_by: input.sortBy ?? "arrival_date",
  };

  const { data, error } = await supabaseAdmin.rpc("search_guest_folios", searchArgs);

  if (error) throw cashierError(error.message);

  const payload = (data ?? { total: 0, rows: [] }) as {
    total: number | string;
    rows: RpcRow[] | null;
  };
  const total = Number(payload.total ?? 0);
  const rows = (payload.rows ?? []).map(mapRow);
  return {
    rows,
    page,
    pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}

export const searchGuestFolios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GuestFolioSearchInput) => guestFolioSearchInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<GuestFolioSearchPage> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return searchGuestFoliosQuery(supabaseAdmin, data);
  });

type AllAccountRpcRow = {
  account_type: "guest" | "company" | "group";
  account_id: string;
  account_number: string;
  account_name: string;
  status: string;
  currency: string;
  balance: number | string;
  last_activity: string | null;
  guest_folio_id: string | null;
  confirmation_number?: string | null;
  reservation_status?: string | null;
  arrival_date?: string | null;
  departure_date?: string | null;
  room_number?: string | null;
  room_type_name?: string | null;
};

function mapAllAccountRow(row: AllAccountRpcRow): AllAccountSearchRow {
  return {
    accountType: row.account_type,
    accountId: row.account_id,
    accountNumber: row.account_number,
    accountName: row.account_name,
    status: row.status,
    balance: Number(row.balance),
    currency: row.currency,
    lastActivity: row.last_activity,
    guestFolioId: row.guest_folio_id,
    confirmationNumber: row.confirmation_number ?? null,
    reservationStatus: row.reservation_status ?? null,
    arrivalDate: row.arrival_date ?? null,
    departureDate: row.departure_date ?? null,
    roomNumber: row.room_number ?? null,
    roomTypeName: row.room_type_name ?? null,
  };
}

function buildFolioSearchRpcArgs(input: GuestFolioSearchInput, page: number, pageSize: number) {
  const folioStatus = (input.folioStatus ?? "all") as FolioStatusFilter;
  const stayStatus = (input.stayStatus ?? "all") as FolioStayStatusFilter;
  const paymentState = (input.paymentState ?? "all") as FolioPaymentStateFilter;
  const offset = (page - 1) * pageSize;
  return {
    args: {
      _restaurant_id: input.restaurantId,
      _search: input.search?.trim() || null,
      _folio_status: folioStatus,
      _stay_statuses: resolveStayStatusesForQuery(stayStatus),
      _stay_start: input.stayFrom ?? null,
      _stay_end: input.stayTo ?? null,
      _payment_states: paymentStatesForQuery(paymentState),
      _room_type_id: input.roomTypeId ?? null,
      _rate_plan_id: input.ratePlanId ?? null,
      _market_segment:
        input.marketSegment && input.marketSegment !== FOLIO_SEARCH_FILTER_ALL
          ? input.marketSegment
          : null,
      _booking_source:
        input.bookingSource && input.bookingSource !== FOLIO_SEARCH_FILTER_ALL
          ? input.bookingSource
          : null,
      _sales_channel:
        input.salesChannel && input.salesChannel !== FOLIO_SEARCH_FILTER_ALL
          ? input.salesChannel
          : null,
      _currency:
        input.currency && input.currency !== FOLIO_SEARCH_FILTER_ALL ? input.currency : null,
      _unsettled_only: input.unsettledCheckout ?? false,
      _sort_by: input.sortBy ?? "opened_at",
      _sort_dir: input.sortDirection ?? "desc",
      _limit: pageSize,
      _offset: offset,
    },
    page,
    pageSize,
    offset,
  };
}

export async function searchAllAccountsQuery(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  input: GuestFolioSearchInput,
): Promise<AllAccountSearchPage> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? FOLIO_SEARCH_DEFAULT_PAGE_SIZE;
  const { args, offset } = buildFolioSearchRpcArgs(input, page, pageSize);

  const { data, error } = await supabaseAdmin.rpc("search_all_accounts", args);
  if (error) throw cashierError(error.message);

  const payload = (data ?? { total: 0, rows: [] }) as {
    total: number | string;
    rows: AllAccountRpcRow[] | null;
  };
  const total = Number(payload.total ?? 0);
  const rows = (payload.rows ?? []).map(mapAllAccountRow);
  return {
    rows,
    page,
    pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}

export const searchAllAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GuestFolioSearchInput) => guestFolioSearchInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AllAccountSearchPage> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return searchAllAccountsQuery(supabaseAdmin, data);
  });
