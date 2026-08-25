import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { RingbaActionName } from "./actions.ts";

import { optionalObjectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const ringbaApiBaseUrl = "https://api.ringba.com/v2";
const accountsPath = "/ringbaaccounts";
type Phase = "validate" | "execute";
interface RingbaContext {
  apiKey: string;
  accountId?: string;
  accessibleAccountIds?: string[];
  fetcher: typeof fetch;
}

const handler =
  (name: RingbaActionName): ProviderRuntimeHandler<RingbaContext> =>
  async (input, context) => {
    const path = buildPath(name, input, context);
    return requestJson(path, context.apiKey, context.fetcher, "execute");
  };
export const ringbaActionHandlers: ProviderActionHandlers<"ringba", ProviderRuntimeHandler<RingbaContext>> = {
  get_account: handler("get_account"),
  list_campaigns: handler("list_campaigns"),
  get_campaign: handler("get_campaign"),
  list_publishers: handler("list_publishers"),
  get_publisher: handler("get_publisher"),
  list_numbers: handler("list_numbers"),
  get_number: handler("get_number"),
};

export async function validateRingbaCredential(
  apiKey: string,
  requestedAccountId: string | undefined,
  fetcher: typeof fetch,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = optionalRecord(await requestJson(accountsPath, apiKey, fetcher, "validate"));
  const accounts = optionalObjectArray(payload?.account);
  const accessibleAccountIds = accounts.flatMap((account) => {
    const accountId = optionalString(account.accountId) ?? optionalString(account.id);
    return accountId ? [accountId] : [];
  });
  const normalizedRequestedAccountId = requestedAccountId?.trim() || undefined;
  if (normalizedRequestedAccountId && !accessibleAccountIds.includes(normalizedRequestedAccountId)) {
    throw new ProviderRequestError(400, "Ringba accountId is not accessible with the provided API token");
  }
  const selectedAccount = normalizedRequestedAccountId
    ? accounts.find(
        (account) => (optionalString(account.accountId) ?? optionalString(account.id)) === normalizedRequestedAccountId,
      )
    : undefined;
  return {
    profile: {
      accountId: normalizedRequestedAccountId ?? "ringba",
      displayName: optionalString(selectedAccount?.name) ?? "Ringba API Token",
    },
    grantedScopes: [],
    metadata: {
      accountId: normalizedRequestedAccountId,
      accessibleAccountIds,
    },
  };
}

function buildPath(name: RingbaActionName, input: Record<string, unknown>, context: RingbaContext): string {
  if (name === "get_account") return accountsPath;
  const accountId = optionalString(input.accountId)?.trim() || context.accountId;
  if (!accountId) {
    throw new ProviderRequestError(
      400,
      "accountId is required when the Ringba connection does not have a default account",
    );
  }
  if (context.accessibleAccountIds && !context.accessibleAccountIds.includes(accountId)) {
    throw new ProviderRequestError(400, "Ringba accountId is not accessible with the provided API token");
  }
  const base = `/${encodeURIComponent(accountId)}`;
  if (name === "list_campaigns") return `${base}/campaigns`;
  if (name === "get_campaign") {
    const id = requiredInput(input, "campaignId");
    if (!id.startsWith("CA")) throw new ProviderRequestError(400, "campaignId must start with the uppercase CA prefix");
    return `${base}/campaigns/${encodeURIComponent(id)}`;
  }
  if (name === "list_publishers") return `${base}/Publishers`;
  if (name === "get_publisher") return `${base}/Publishers/${encodeURIComponent(requiredInput(input, "publisherId"))}`;
  if (name === "list_numbers") return `${base}/numbers`;
  return `${base}/numbers/${encodeURIComponent(requiredInput(input, "numberId"))}`;
}

export function readAccessibleRingbaAccountIds(source: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(source.accessibleAccountIds)) return undefined;
  const accountIds = source.accessibleAccountIds.flatMap((value) => {
    const accountId = optionalString(value);
    return accountId ? [accountId] : [];
  });
  return accountIds.length > 0 ? accountIds : undefined;
}

function requiredInput(input: Record<string, unknown>, field: string): string {
  return requiredString(input[field], field, (message) => new ProviderRequestError(400, message));
}

async function requestJson(path: string, apiKey: string, fetcher: typeof fetch, phase: Phase): Promise<unknown> {
  const response = await fetcher(new URL(`${ringbaApiBaseUrl}${path}`), {
    headers: { accept: "application/json", authorization: `Token ${apiKey}`, "user-agent": providerUserAgent },
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim())
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "Ringba returned invalid JSON");
    }
  if (!response.ok) throw mapError(response.status, payload, phase);
  return payload;
}
function mapError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? `Ringba request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status || 502, message);
}
