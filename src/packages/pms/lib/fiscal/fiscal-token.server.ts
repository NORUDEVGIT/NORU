/**
 * Server-only token cache. A database lease stops concurrent refreshes from
 * calling authenticate more than once. The token is never returned to the browser.
 */
import { authenticateFiscal, type FiscalFetch } from "./fiscal-client.server.ts";
import { getFiscalCredentials } from "./fiscal-secrets.server.ts";
import {
  FiscalError,
  fiscalRecord,
  type FiscalConnectionConfig,
  type FiscalDb,
} from "./fiscal.types.ts";

type Db = FiscalDb;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getValidFiscalToken(
  db: Db,
  input: {
    integrationId: string;
    restaurantId: string;
    config: Pick<FiscalConnectionConfig, "baseUrl" | "taxpayerTin" | "client">;
    fetchImpl?: FiscalFetch;
  },
): Promise<{ accessToken: string; expiresAt: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claim = await db.rpc("claim_fiscal_token_refresh", {
      _integration_id: input.integrationId,
      _restaurant_id: input.restaurantId,
    });
    const row = fiscalRecord(claim.data);
    if (claim.error || !row) {
      throw new FiscalError(
        "FISCAL_SECRET_STORE_UNAVAILABLE",
        "The fiscal token cache is unavailable.",
      );
    }
    if (
      row.needsRefresh !== true &&
      typeof row.accessToken === "string" &&
      row.accessToken.length > 0
    ) {
      return {
        accessToken: row.accessToken,
        expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : "",
      };
    }
    if (row.inProgress === true) {
      await sleep(250);
      continue;
    }
    const credentials = await getFiscalCredentials(db, input.integrationId);
    const auth = await authenticateFiscal({
      baseUrl: input.config.baseUrl,
      username: credentials.apiUsername,
      password: credentials.apiPassword,
      tinNo: input.config.taxpayerTin,
      client: input.config.client,
      fetchImpl: input.fetchImpl,
    });
    const expiresAt = new Date(Date.now() + auth.expiresIn * 1000).toISOString();
    const saved = await db
      .from("fiscal_integration_tokens")
      .update({
        access_token: auth.accessToken,
        expires_at: expiresAt,
        refresh_lease_until: null,
      })
      .eq("integration_id", input.integrationId);
    if (saved.error) {
      throw new FiscalError(
        "FISCAL_SECRET_STORE_UNAVAILABLE",
        "The fiscal token cache is unavailable.",
      );
    }
    return { accessToken: auth.accessToken, expiresAt };
  }
  throw new FiscalError("FISCAL_AUTH_FAILED", "Authentication was rejected by the fiscal service.");
}

export async function fiscalTokenStatus(
  db: Db,
  integrationId: string,
): Promise<{ hasToken: boolean; expiresAt: string | null }> {
  const result = await db
    .from("fiscal_integration_tokens")
    .select("access_token, expires_at")
    .eq("integration_id", integrationId)
    .maybeSingle();
  const row = fiscalRecord(result.data);
  if (result.error || !row) return { hasToken: false, expiresAt: null };
  const hasToken = typeof row.access_token === "string" && row.access_token.length > 0;
  return {
    hasToken,
    expiresAt: hasToken && typeof row.expires_at === "string" ? row.expires_at : null,
  };
}
