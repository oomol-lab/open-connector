import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const baseUrl = "https://api.vbout.com/1";
const paths: Record<string, { method: string; path: string }> = {
  get_account: { method: "GET", path: "/App/Me" },
  list_lists: { method: "GET", path: "/EmailMarketing/GetLists" },
  get_list: { method: "GET", path: "/EmailMarketing/GetList" },
  list_contacts: { method: "GET", path: "/EmailMarketing/GetContacts" },
  get_contact: { method: "GET", path: "/EmailMarketing/GetContact" },
  create_contact: { method: "POST", path: "/EmailMarketing/AddContact" },
  update_contact: { method: "POST", path: "/EmailMarketing/EditContact" },
  delete_contact: { method: "DELETE", path: "/EmailMarketing/DeleteContact" },
};
async function execute(
  name: string,
  input: Record<string, unknown>,
  context: Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1],
): Promise<unknown> {
  const config = paths[name]!;
  const url = new URL(`${baseUrl}${config.path}`);
  url.searchParams.set("key", context.apiKey);
  const query: Record<string, unknown> =
    name === "get_list"
      ? { id: input.listId }
      : name === "list_contacts"
        ? { listid: input.listId }
        : name === "get_contact"
          ? { id: input.contactId }
          : name === "create_contact"
            ? { ...input, listid: input.listId }
            : name === "update_contact"
              ? { ...input, id: input.contactId }
              : name === "delete_contact"
                ? { id: input.contactId, listid: input.listId }
                : {};
  delete query.listId;
  delete query.contactId;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (key === "fields" && value && typeof value === "object")
      for (const [fieldId, fieldValue] of Object.entries(value))
        url.searchParams.set(`fields[${fieldId}]`, String(fieldValue));
    else url.searchParams.set(key === "ipAddress" ? "ipaddress" : key, String(value));
  }
  const response = await context.fetcher(url, {
    method: config.method,
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) throw new ProviderRequestError(response.status || 502, "VBOUT request failed", payload);
  const envelope = payload.response as Record<string, unknown> | undefined;
  const header = envelope?.header as Record<string, unknown> | undefined;
  if (String(header?.status).toLowerCase() !== "ok")
    throw new ProviderRequestError(400, "VBOUT returned an unsuccessful response", payload);
  return { status: header?.status, data: envelope?.data ?? {}, rateLimit: payload["rate-limit"] ?? {} };
}
const handlers: ProviderActionHandlers<"vbout", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_account: (input, context) => execute("get_account", input, context),
  list_lists: (input, context) => execute("list_lists", input, context),
  get_list: (input, context) => execute("get_list", input, context),
  list_contacts: (input, context) => execute("list_contacts", input, context),
  get_contact: (input, context) => execute("get_contact", input, context),
  create_contact: (input, context) => execute("create_contact", input, context),
  update_contact: (input, context) => execute("update_contact", input, context),
  delete_contact: (input, context) => execute("delete_contact", input, context),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("vbout", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "vbout",
  baseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    let result: unknown;
    try {
      result = await execute("get_account", {}, { apiKey: input.apiKey, fetcher, signal });
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status < 500) {
        throw new ProviderRequestError(400, error.message, error.details);
      }
      throw error;
    }
    const root = optionalRecord(result);
    const business = optionalRecord(optionalRecord(root?.data)?.business);
    const accountName =
      optionalString(business?.businessname) ??
      optionalString(business?.businessName) ??
      optionalString(business?.vboutName) ??
      "VBOUT API Key";
    return {
      profile: { accountId: optionalString(business?.vboutName) ?? "api_key", displayName: accountName },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationEndpoint: "/App/Me",
        ...(optionalString(business?.vboutName) ? { vboutName: optionalString(business?.vboutName) } : {}),
        ...(optionalString(business?.package) ? { package: optionalString(business?.package) } : {}),
      },
    };
  },
};
