import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const waitwhileApiBaseUrl = "https://api.waitwhile.com/v2";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"waitwhile", Handler> = {
  list_locations: (input, context) => execute("list_locations", input, context),
  list_customers: (input, context) => execute("list_customers", input, context),
  search_customers: (input, context) => execute("search_customers", input, context),
  create_customer: (input, context) => execute("create_customer", input, context),
  get_customer: (input, context) => execute("get_customer", input, context),
  update_customer: (input, context) => execute("update_customer", input, context),
  delete_customer: (input, context) => execute("delete_customer", input, context),
};

export async function validateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await request("/locations", "GET", { limit: 1 }, { apiKey, fetcher, signal }, true);
  requirePage(payload);
  return {
    profile: { displayName: "Waitwhile API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: waitwhileApiBaseUrl },
  };
}

async function execute(action: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const { customerId, customer, ...query } = input;
  let path = "/customers";
  let method = "GET";
  if (action == "list_locations") path = "/locations";
  else if (action == "search_customers") path = "/customers/search";
  else if (action == "create_customer") method = "POST";
  else if (action == "get_customer" || action == "update_customer" || action == "delete_customer") {
    path = `/customers/${encodeURIComponent(String(customerId))}`;
    method = action == "get_customer" ? "GET" : action == "update_customer" ? "POST" : "DELETE";
  }
  const payload = await request(
    path,
    method,
    method == "POST" ? (optionalRecord(customer) ?? {}) : query,
    context,
    false,
  );
  if (action == "list_locations" || action == "list_customers" || action == "search_customers") requirePage(payload);
  return payload;
}

function requirePage(payload: Record<string, unknown>): void {
  if (!Array.isArray(payload.results)) throw providerResponseError("Waitwhile response is missing results");
}
async function request(
  path: string,
  method: string,
  values: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch; signal?: AbortSignal },
  validating: boolean,
) {
  return runProviderRequest({ label: "Waitwhile", signal: context.signal }, async (signal) => {
    const url = new URL(`${waitwhileApiBaseUrl}${path}`);
    if (method == "GET")
      for (const [key, value] of Object.entries(values))
        if (value !== undefined) url.searchParams.set(key, value === null ? "" : String(value));
    const response = await context.fetcher(url, {
      method,
      signal,
      headers: { apikey: context.apiKey, accept: "application/json", "content-type": "application/json" },
      body: method == "POST" ? JSON.stringify(values) : undefined,
    });
    const text = await response.text();
    let decoded: unknown;
    try {
      decoded = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Waitwhile returned a non-JSON response (HTTP ${response.status})`,
      );
    }
    if (!response.ok) {
      const error = optionalRecord(decoded);
      const code = optionalString(error?.errorCode);
      const message = optionalString(error?.message) ?? optionalString(error?.error) ?? `HTTP ${response.status}`;
      if (validating && code == "invalid_api_key") throw providerInputError(`Waitwhile: ${message} (${code})`);
      throw new ProviderRequestError(
        code == "invalid_api_key" ? 401 : response.status,
        `Waitwhile: ${message}${code ? ` (${code})` : ""}`,
      );
    }
    return requiredResponseRecord(decoded, "Waitwhile");
  });
}
