import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
interface Context {
  accountId: string;
  baseUrl: string;
  authorization: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(suffix: string, method: string, context: Context): Promise<unknown> {
  const response = await context.fetcher(
    new URL(`/v2/accounts/${encodeURIComponent(context.accountId)}/${suffix}`, context.baseUrl),
    {
      method,
      headers: { accept: "application/json", authorization: context.authorization, "user-agent": providerUserAgent },
      signal: context.signal,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Appcues request failed with ${response.status}`, payload);
  return payload;
}
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service: "appcues",
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "appcues");
    const apiSecret = credential.values.apiSecret;
    const accountId = credential.values.accountId;
    const region = credential.values.region || "us";
    if (!apiSecret || !accountId || (region !== "us" && region !== "eu"))
      throw new ProviderRequestError(401, "Configure valid Appcues API credentials first.");
    return {
      accountId,
      baseUrl: region === "eu" ? "https://api.eu.appcues.com" : "https://api.appcues.com",
      authorization: `Basic ${Buffer.from(`${credential.apiKey}:${apiSecret}`).toString("base64")}`,
      fetcher,
      signal: context.signal,
    };
  },
  handlers: {
    async list_flows(_input, context) {
      return { flows: await request("flows-v2", "GET", context) };
    },
    get_flow: (input, context) => request(`flows-v2/${encodeURIComponent(String(input.flow_id))}`, "GET", context),
    publish_flow: (input, context) =>
      request(`flows-v2/${encodeURIComponent(String(input.flow_id))}/publish`, "POST", context),
    unpublish_flow: (input, context) =>
      request(`flows-v2/${encodeURIComponent(String(input.flow_id))}/unpublish`, "POST", context),
    async list_tags(_input, context) {
      return { tags: await request("tags", "GET", context) };
    },
    get_tag: (input, context) => request(`tags/${encodeURIComponent(String(input.tag_id))}`, "GET", context),
  },
});

function credentials(input: { apiKey: string; values: Record<string, string> }): {
  apiSecret: string;
  accountId: string;
  region: "us" | "eu";
} {
  const apiSecret = input.values.apiSecret;
  const accountId = input.values.accountId;
  const region = input.values.region || "us";
  if (!apiSecret) throw new ProviderRequestError(400, "apiSecret is required");
  if (!accountId) throw new ProviderRequestError(400, "accountId is required");
  if (region !== "us" && region !== "eu") throw new ProviderRequestError(400, "region must be us or eu");
  return { apiSecret, accountId, region };
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const resolved = credentials(input);
    const baseUrl = resolved.region === "eu" ? "https://api.eu.appcues.com" : "https://api.appcues.com";
    await request("tags", "GET", {
      ...resolved,
      baseUrl,
      authorization: `Basic ${Buffer.from(`${input.apiKey}:${resolved.apiSecret}`).toString("base64")}`,
      fetcher,
      signal,
    });
    return {
      profile: { accountId: resolved.accountId, displayName: `Appcues Account ${resolved.accountId}` },
      grantedScopes: [],
      metadata: {
        accountId: resolved.accountId,
        region: resolved.region,
        apiBaseUrl: baseUrl,
        validationEndpoint: `/v2/accounts/${encodeURIComponent(resolved.accountId)}/tags`,
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "appcues",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "appcues");
    return credentials(credential).region === "eu" ? "https://api.eu.appcues.com" : "https://api.appcues.com";
  },
  auth: { type: "none" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType !== "api_key") return;
    const resolved = credentials(credential);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${credential.apiKey}:${resolved.apiSecret}`).toString("base64")}`,
    );
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
