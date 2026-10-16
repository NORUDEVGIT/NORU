/**
 * Server-only fiscal credentials.
 *
 * The username and password live in Supabase Vault. NORU stores only the
 * vault secret id in fiscal_credential_refs. pms_integrations.config is never
 * given credential-shaped keys.
 */
import { FiscalError, fiscalRecord, type FiscalDb } from "./fiscal.types.ts";

type Db = FiscalDb;

export type FiscalCredentials = {
  apiUsername: string;
  apiPassword: string;
};

export async function hasFiscalCredentials(db: Db, integrationId: string): Promise<boolean> {
  const result = await db
    .from("fiscal_credential_refs")
    .select("integration_id")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (result.error)
    throw new FiscalError(
      "FISCAL_SECRET_STORE_UNAVAILABLE",
      "The server secret store is unavailable.",
    );
  return Boolean(result.data);
}

export async function getFiscalCredentials(
  db: Db,
  integrationId: string,
): Promise<FiscalCredentials> {
  const ref = await db
    .from("fiscal_credential_refs")
    .select("vault_secret_id")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (ref.error)
    throw new FiscalError(
      "FISCAL_SECRET_STORE_UNAVAILABLE",
      "The server secret store is unavailable.",
    );
  const secretId = fiscalRecord(ref.data)?.vault_secret_id;
  if (typeof secretId !== "string" || secretId.length === 0) {
    throw new FiscalError(
      "FISCAL_CREDENTIALS_MISSING",
      "Fiscal API credentials have not been configured.",
    );
  }
  const secret = await db.rpc("fiscal_read_api_credentials", {
    _integration_id: integrationId,
  });
  const decrypted = secret.data;
  if (secret.error || typeof decrypted !== "string" || decrypted.length === 0) {
    throw new FiscalError(
      "FISCAL_SECRET_STORE_UNAVAILABLE",
      "The server secret store is unavailable.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(decrypted));
  } catch {
    throw new FiscalError(
      "FISCAL_SECRET_STORE_UNAVAILABLE",
      "The server secret store is unavailable.",
    );
  }
  const record = parsed as { apiUsername?: unknown; apiPassword?: unknown };
  if (typeof record.apiUsername !== "string" || typeof record.apiPassword !== "string") {
    throw new FiscalError(
      "FISCAL_CREDENTIALS_MISSING",
      "Fiscal API credentials have not been configured.",
    );
  }
  if (record.apiUsername.trim().length === 0 || record.apiPassword.length === 0) {
    throw new FiscalError(
      "FISCAL_CREDENTIALS_MISSING",
      "Fiscal API credentials have not been configured.",
    );
  }
  return { apiUsername: record.apiUsername.trim(), apiPassword: record.apiPassword };
}

export async function setFiscalCredentials(
  db: Db,
  input: { restaurantId: string; integrationId: string; apiUsername: string; apiPassword: string },
): Promise<{ configured: true }> {
  const apiUsername = input.apiUsername.trim();
  const apiPassword = input.apiPassword;
  if (apiUsername.length === 0 || apiPassword.trim().length === 0) {
    throw new FiscalError(
      "FISCAL_CREDENTIALS_MISSING",
      "Enter both the API username and password.",
    );
  }
  if (apiUsername.length > 200 || apiPassword.length > 200) {
    throw new FiscalError("FISCAL_MAPPING_INVALID", "Credentials are too long.");
  }
  const stored = await db.rpc("fiscal_store_api_credentials", {
    _integration_id: input.integrationId,
    _restaurant_id: input.restaurantId,
    _api_username: apiUsername,
    _api_password: apiPassword,
  });
  if (stored.error) {
    const message = stored.error.message;
    if (message.includes("FISCAL_CREDENTIALS_MISSING")) {
      throw new FiscalError(
        "FISCAL_CREDENTIALS_MISSING",
        "Enter both the API username and password.",
      );
    }
    if (message.includes("FISCAL_CONFIG_MISSING")) {
      throw new FiscalError(
        "FISCAL_CONFIG_MISSING",
        "Save the fiscal connection before continuing.",
      );
    }
    throw new FiscalError(
      "FISCAL_SECRET_STORE_UNAVAILABLE",
      "The server secret store is unavailable.",
    );
  }
  return { configured: true };
}
