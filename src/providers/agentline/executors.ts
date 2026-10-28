import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerResponseError, providerInputError } from "../provider-runtime.ts";
import {
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
} from "../provider-runtime.ts";
import actions, { agentlineRoutes } from "./actions.ts";
const baseUrl = "https://api.agentline.cloud";
async function request(
  apiKey: string,
  method: string,
  path: string,
  values: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "AgentLine" }, async (signal) => {
    const url = new URL(path, baseUrl);
    if (method === "GET") {
      for (const [key, value] of Object.entries(values)) {
        if (value != null) url.searchParams.set(key, String(value));
      }
    }
    const response = await fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: method === "POST" || method === "PATCH" ? JSON.stringify(values) : undefined,
      signal,
    });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const object = optionalRecord(body);
      const detail = optionalRecord(object?.detail);
      const messages = [
        optionalString(object?.detail),
        optionalString(object?.message),
        optionalString(object?.error),
        optionalString(detail?.message),
        optionalString(detail?.error),
      ];
      if (Array.isArray(object?.detail)) {
        for (const item of object.detail) messages.push(optionalString(optionalRecord(item)?.msg));
      }
      const message = messages.filter(Boolean).join(": ");
      throw new ProviderRequestError(
        response.status,
        `AgentLine request failed (${response.status})${message ? `: ${message}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    if (body === undefined || body === null) throw providerResponseError("AgentLine returned an invalid JSON response");
    return body;
  });
}
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const route = agentlineRoutes.find((item) => item.name === actionName)!;
  const values = { ...valuesInput };
  let path = route.path;
  for (const field of route.pathFields ?? []) {
    const value = String(values[field]);
    if (value === "." || value === "..") throw providerInputError(`${field} cannot be a dot segment`);
    path = path.replace(`{${field}}`, encodeURIComponent(value));
    delete values[field];
  }
  const body = await request(context.apiKey, route.method, path, values, context.fetcher, context.signal);
  if (route.name === "list_agents") {
    if (!Array.isArray(body)) throw providerResponseError("AgentLine agent list must be an array");
    return { agents: body };
  }
  return requiredResponseRecord(body, "AgentLine response");
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "agentline",
  Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ApiKeyProviderContext) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const account = requiredResponseRecord(
      await request(input.apiKey, "GET", "/v1/account/voice", {}, fetcher),
      "AgentLine account",
    );
    const accountId = optionalString(account.account_id);
    return {
      profile: { displayName: accountId ? `AgentLine ${accountId}` : "AgentLine API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, accountId },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "agentline",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
