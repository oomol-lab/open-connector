import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const baseUrl = "https://prod-api.ringg.ai/ca/api/v0";
const requests: Record<string, { method: string; path: string; id?: string }> = {
  get_workspace: { method: "GET", path: "/workspace" },
  list_assistants: { method: "GET", path: "/agent/all" },
  get_assistant: { method: "GET", path: "/agent/", id: "id" },
  list_voices: { method: "GET", path: "/agent/voices" },
  list_workspace_numbers: { method: "GET", path: "/workspace/numbers" },
  initiate_call: { method: "POST", path: "/calling/outbound/individual" },
  list_calls: { method: "GET", path: "/calling/history" },
  get_call: { method: "GET", path: "/calling/call-details" },
};
async function execute(
  name: string,
  input: Record<string, unknown>,
  context: Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1],
): Promise<unknown> {
  const config = requests[name]!;
  const url = new URL(config.path + (config.id ? encodeURIComponent(String(input[config.id])) : ""), baseUrl);
  if (config.method === "GET" && !config.id)
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method: config.method,
    headers: {
      accept: "application/json",
      "X-API-KEY": context.apiKey,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: config.method === "POST" ? JSON.stringify(input) : undefined,
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Ringg AI request failed with status ${response.status}`, payload);
  return payload;
}
const handlers: ProviderActionHandlers<"ringg_ai", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_workspace: (input, context) => execute("get_workspace", input, context),
  list_assistants: (input, context) => execute("list_assistants", input, context),
  get_assistant: (input, context) => execute("get_assistant", input, context),
  list_voices: (input, context) => execute("list_voices", input, context),
  list_workspace_numbers: (input, context) => execute("list_workspace_numbers", input, context),
  initiate_call: (input, context) => execute("initiate_call", input, context),
  list_calls: (input, context) => execute("list_calls", input, context),
  get_call: (input, context) => execute("get_call", input, context),
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineApiKeyProviderExecutors(
  "ringg_ai",
  handlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "ringg_ai",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await execute("get_workspace", {}, { apiKey: input.apiKey, fetcher, signal })) as Record<
      string,
      unknown
    >;
    const workspace = payload.workspace_info as Record<string, unknown> | undefined;
    const id = typeof workspace?.id === "string" ? workspace.id : undefined;
    const name = typeof workspace?.name === "string" ? workspace.name : undefined;
    if (!id || !name)
      throw new ProviderRequestError(502, "Ringg AI workspace response did not include a valid id and name");
    return {
      profile: { accountId: id, displayName: name },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, workspaceId: id },
    };
  },
};
