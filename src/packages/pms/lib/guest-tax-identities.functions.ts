import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeGuestTin } from "./guest-tax-identities.ts";
import { requireGuestManager } from "./guests.server.ts";

const idSchema = z.string().uuid();

const identityFields = {
  legalName: z.string().trim().min(1).max(200),
  tin: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  isDefault: z.boolean().optional(),
};

export type GuestTaxIdentityView = {
  id: string;
  legalName: string;
  tin: string;
  registrationNumber: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

type AdminClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          order(
            column: string,
            options: { ascending: boolean },
          ): {
            order(column: string, options: { ascending: boolean }): Promise<QueryResult>;
          };
        };
      };
    };
  };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function taxIdentityError(message: string): Error {
  if (message.includes("TAX_IDENTITY_TIN_REUSED")) {
    return new Error(
      "That TIN is already saved for this guest. Reactivate the existing identity instead of adding a duplicate.",
    );
  }
  if (message.includes("TAX_IDENTITY_NAME_REQUIRED")) return new Error("Legal name is required.");
  if (message.includes("TAX_IDENTITY_TIN_REQUIRED")) return new Error("TIN is required.");
  if (message.includes("TAX_IDENTITY_TOO_LONG")) {
    return new Error("Legal name or TIN is too long.");
  }
  if (message.includes("GUEST_NOT_FOUND")) {
    return new Error("That guest was not found for this property.");
  }
  if (message.includes("TAX_IDENTITY_NOT_FOUND")) {
    return new Error("That tax identity was not found for this guest.");
  }
  if (message.includes("TAX_IDENTITY_INACTIVE")) {
    return new Error("Only an active tax identity can be the default.");
  }
  if (message.includes("TAX_IDENTITY_DEFAULT_CONFLICT")) {
    return new Error("This guest already has a default tax identity. Try again.");
  }
  return new Error("The tax identity could not be saved.");
}

async function adminClient(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function view(row: Record<string, unknown>): GuestTaxIdentityView | null {
  if (
    typeof row.id !== "string" ||
    typeof row.legal_name !== "string" ||
    typeof row.tin !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    legalName: row.legal_name,
    tin: row.tin,
    registrationNumber: textOrNull(row.registration_number),
    phone: textOrNull(row.phone),
    email: textOrNull(row.email),
    city: textOrNull(row.city),
    region: textOrNull(row.region),
    isDefault: row.is_default === true,
    isActive: row.is_active !== false,
  };
}

function saveArgs(
  data: {
    restaurantId: string;
    guestId: string;
    legalName: string;
    tin: string;
    registrationNumber?: string;
    phone?: string;
    email?: string;
    city?: string;
    region?: string;
    isDefault?: boolean;
  },
  identityId: string | null,
  membershipId: string,
) {
  const tin = normalizeGuestTin(data.tin);
  if (tin.length === 0 || tin.length > 40) throw new Error("TIN is required.");
  return {
    _restaurant_id: data.restaurantId,
    _guest_profile_id: data.guestId,
    _identity_id: identityId,
    _legal_name: data.legalName,
    _tin: tin,
    _registration_number: data.registrationNumber ?? null,
    _phone: data.phone ?? null,
    _email: data.email ?? null,
    _city: data.city ?? null,
    _region: data.region ?? null,
    _is_default: data.isDefault === true,
    _membership_id: membershipId,
  };
}

export const listGuestTaxIdentities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestTaxIdentityView[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const result = await admin
      .from("guest_tax_identities")
      .select(
        "id, legal_name, tin, registration_number, phone, email, city, region, is_default, is_active, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_profile_id", data.guestId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true });
    if (result.error) throw taxIdentityError(result.error.message);
    return (result.data ?? []).map(view).filter((row): row is GuestTaxIdentityView => row != null);
  });

export const createGuestTaxIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, ...identityFields }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const saved = await admin.rpc("save_guest_tax_identity", saveArgs(data, null, me.id));
    if (saved.error) throw taxIdentityError(saved.error.message);
    const id =
      typeof (saved.data as { id?: unknown } | null)?.id === "string"
        ? (saved.data as { id: string }).id
        : null;
    if (!id) throw new Error("The tax identity could not be saved.");
    return { id };
  });

export const updateGuestTaxIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        identityId: idSchema,
        ...identityFields,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const saved = await admin.rpc(
      "save_guest_tax_identity",
      saveArgs(data, data.identityId, me.id),
    );
    if (saved.error) throw taxIdentityError(saved.error.message);
    return { id: data.identityId };
  });

export const setDefaultGuestTaxIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, identityId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const saved = await admin.rpc("set_default_guest_tax_identity", {
      _restaurant_id: data.restaurantId,
      _guest_profile_id: data.guestId,
      _identity_id: data.identityId,
    });
    if (saved.error) throw taxIdentityError(saved.error.message);
    return { id: data.identityId };
  });

export const deactivateGuestTaxIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, identityId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const saved = await admin.rpc("set_guest_tax_identity_active", {
      _restaurant_id: data.restaurantId,
      _guest_profile_id: data.guestId,
      _identity_id: data.identityId,
      _active: false,
    });
    if (saved.error) throw taxIdentityError(saved.error.message);
    return { id: data.identityId };
  });

export const reactivateGuestTaxIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, identityId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const admin = await adminClient();
    const saved = await admin.rpc("set_guest_tax_identity_active", {
      _restaurant_id: data.restaurantId,
      _guest_profile_id: data.guestId,
      _identity_id: data.identityId,
      _active: true,
    });
    if (saved.error) throw taxIdentityError(saved.error.message);
    return { id: data.identityId };
  });
