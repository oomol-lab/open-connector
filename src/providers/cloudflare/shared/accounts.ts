import { requiredString, compactObject, optionalInteger, optionalRecord, optionalString } from "../../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord, providerResponseError } from "../../provider-runtime.ts";
import { cloudflareRequestEnvelope } from "./client.ts";

interface CloudflareAccount {
  id: string;
  name?: string;
  type?: string;
}

export async function requestCloudflareAccounts(
  apiToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  input: { page?: number; perPage?: number } = {},
): Promise<{ accounts: CloudflareAccount[]; resultInfo?: Record<string, unknown> }> {
  const envelope = await cloudflareRequestEnvelope(
    apiToken,
    {
      path: "/accounts",
      query: {
        page: input.page ?? 1,
        per_page: input.perPage ?? 50,
      },
    },
    fetcher,
    "execute",
    signal,
  );
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, "malformed cloudflare accounts response");
  }
  return {
    accounts: envelope.result.map((item) => normalizeAccount(item)),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

function normalizeAccount(value: unknown): CloudflareAccount {
  const account = requiredResponseRecord(value, "cloudflare account");
  return compactObject({
    id: requiredString(account.id, "cloudflare account ID", providerResponseError),
    name: optionalString(account.name),
    type: optionalString(account.type),
  }) as CloudflareAccount;
}

export function normalizeResultInfo(value: unknown): Record<string, unknown> | undefined {
  const resultInfo = optionalRecord(value);
  if (!resultInfo) {
    return undefined;
  }
  return compactObject({
    page: optionalInteger(resultInfo.page),
    perPage: optionalInteger(resultInfo.per_page),
    count: optionalInteger(resultInfo.count),
    totalCount: optionalInteger(resultInfo.total_count),
    totalPages: optionalInteger(resultInfo.total_pages),
  });
}
