import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

interface Context {
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(
  input: Record<string, unknown>,
  context: Context,
  method: string,
  path: string,
  query = false,
): Promise<unknown> {
  const url = new URL(path, "https://app.zenventory.com/rest/");
  if (query)
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: context.authorization,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" ? undefined : JSON.stringify(input),
    signal: context.signal,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      `Zenventory request failed with status ${response.status}`,
      payload,
    );
  return payload;
}
const handlers: ProviderActionHandlers<"zenventory", ProviderRuntimeHandler<Context>> = {
  list_items: (input, context) => request(input, context, "GET", "items", true),
  get_item: (input, context) => {
    const { id, ...query } = input;
    return request(query, context, "GET", `items/${id}`, true);
  },
  create_item: (input, context) => request(input, context, "POST", "items"),
  update_item: (input, context) => {
    const { id, ...body } = input;
    return request(body, context, "PUT", `items/${id}`);
  },
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineProviderExecutors<Context>({
  service: "zenventory",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "zenventory");
    const secret = credential.values.apiSecret;
    if (!secret) throw new ProviderRequestError(401, "Configure the Zenventory API secret first.");
    return {
      authorization: `Basic ${Buffer.from(`${credential.apiKey}:${secret}`).toString("base64")}`,
      fetcher,
      signal: context.signal,
    };
  },
  handlers,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "zenventory",
  baseUrl: "https://app.zenventory.com/rest",
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "zenventory");
    const secret = credential.values.apiSecret;
    if (!secret) throw new ProviderRequestError(401, "Configure the Zenventory API secret first.");
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:${secret}`).toString("base64")}`);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const secret = input.values.apiSecret;
    if (!secret) throw new ProviderRequestError(400, "apiSecret is required");
    await request(
      {},
      { authorization: `Basic ${Buffer.from(`${input.apiKey}:${secret}`).toString("base64")}`, fetcher, signal },
      "GET",
      "items?page=1&perPage=20",
    );
    return {
      profile: { accountId: "api_key", displayName: "Zenventory API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://app.zenventory.com/rest", validationEndpoint: "/items" },
    };
  },
};
