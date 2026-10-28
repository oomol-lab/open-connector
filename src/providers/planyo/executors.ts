import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import { ProviderRequestError, requiredResponseRecord, runProviderRequest } from "../provider-runtime.ts";
import actions from "./actions.ts";
const baseUrl = "https://www.planyo.com/rest/";
function authenticate(url: URL, apiKey: string, hashKey: string | undefined) {
  url.searchParams.set("api_key", apiKey);
  url.searchParams.delete("hash_key");
  url.searchParams.delete("hash_timestamp");
  if (hashKey) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const method = url.searchParams.get("method");
    if (!method) throw providerInputError("Planyo method query parameter is required for signing");
    url.searchParams.set("hash_timestamp", timestamp);
    url.searchParams.set(
      "hash_key",
      createHash("md5")
        .update(hashKey + timestamp + method)
        .digest("hex"),
    );
  }
}
async function request(
  method: string,
  params: Record<string, unknown>,
  apiKey: string,
  hashKey: string | undefined,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Planyo" }, async (signal) => {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value == null || key === "properties") continue;
      url.searchParams.set(key, key === "language" ? String(value).toUpperCase() : String(value));
    }
    for (const [key, value] of Object.entries(optionalRecord(params.properties) ?? {})) {
      url.searchParams.set(key, String(value));
    }
    url.searchParams.set("method", method);
    authenticate(url, apiKey, hashKey);
    const response = await fetcher(url, { headers: { accept: "application/json" }, signal });
    const payload = optionalRecord(await response.json());
    if (!response.ok || payload?.response_code !== 0) {
      const message = optionalString(payload?.response_message) ?? "Invalid API response";
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Planyo ${String(payload?.response_code ?? response.status)}: ${message}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload.data, "Planyo response data");
  });
}
interface ProviderContext extends ApiKeyProviderContext {
  values?: Record<string, string>;
}
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ProviderContext,
): Promise<unknown> {
  const params = valuesInput;
  if (actionName === "get_site_info" && params.site_id == null && context.values?.siteId)
    params.site_id = context.values.siteId;
  const data = await request(
    actionName,
    params,
    context.apiKey,
    context.values?.hashKey,
    context.fetcher,
    context.signal,
  );
  if (actionName === "list_resources" && !Array.isArray(data.resources)) {
    const resources = requiredResponseRecord(data.resources, "Planyo resources");
    return {
      ...data,
      resources: Object.entries(resources).map(([id, value]) => ({
        ...requiredResponseRecord(value, "Planyo resource"),
        id,
      })),
    };
  }
  return data;
}
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "planyo",
  handlers: Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ProviderContext) => execute(action.name, values, context),
    ]),
  ),
  async createContext(context, fetcher) {
    const c = await requireApiKeyCredential(context, "planyo");
    return { apiKey: c.apiKey, values: c.values, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const data = await request(
      "get_site_info",
      { site_id: input.values.siteId || undefined },
      input.apiKey,
      input.values.hashKey,
      fetcher,
    );
    return { profile: { displayName: optionalString(data.name) ?? "Planyo API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "planyo",
  baseUrl,
  auth: { type: "none" },
  async customizeRequest({ headers, url, context, service }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const c = await requireApiKeyCredential(context, service);
    authenticate(url, c.apiKey, c.values?.hashKey);
  },
});
