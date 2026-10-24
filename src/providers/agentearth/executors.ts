import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { agentearthActions } from "./actions.ts";

const baseUrl = "https://agentearth.ai/agent-api/v1/tool";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const endpoints: Record<string, string> = {
  get_account: "account",
  recommend_tools: "recommend",
  list_tools: "list",
  get_tool_detail: "detail",
  execute_tool: "execute",
};
function executionQuery(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "tool_url must be an AgentEarth execution URL", undefined, "invalid_input");
  }
  if (
    url.origin !== "https://agentearth.ai" ||
    url.pathname !== "/agent-api/v1/tool/execute" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new ProviderRequestError(
      400,
      "tool_url must use the official AgentEarth HTTPS execution endpoint without credentials or fragments",
      undefined,
      "invalid_input",
    );
  }
  return url.search;
}
interface AgentearthRequest {
  action: string;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ action, input, apiKey, fetcher, parentSignal }: AgentearthRequest) {
  const execute = action === "execute_tool";
  const post = execute || action === "recommend_tools";

  const query = execute ? executionQuery(input.tool_url as string) : "";
  const url = new URL(`${baseUrl}/${endpoints[action]}${query}`);
  if (!post) {
    for (const [name, value] of Object.entries(input)) {
      url.searchParams.set(name, String(value));
    }
  }
  return runProviderRequest(
    { signal: parentSignal, label: "AgentEarth", timeoutMs: execute ? 300_000 : undefined },
    async (signal) => {
      const response = await fetcher(url.toString(), {
        method: post ? "POST" : "GET",
        headers: { ...defaultHeaders, "X-Api-Key": apiKey },
        body: post ? JSON.stringify(execute ? { params: input.params ?? {} } : input) : undefined,
        redirect: "manual",
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const envelope = optionalRecord(payload);
      if (!response.ok || envelope?.error_no !== 0) {
        const message =
          optionalRawString(envelope?.error_msg) || `HTTP ${response.status}; invalid or unsuccessful response`;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `AgentEarth request failed: ${message.split(apiKey).join("[REDACTED]")}`,
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return envelope;
    },
  );
}
const handlers = mapProviderActionHandlers(
  "agentearth",
  agentearthActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    return request({
      action: action.name,
      input: dataInput,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("agentearth", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = await request({
      action: "get_account",
      input: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return {
      profile: {
        displayName:
          optionalRawString(account.user_name)?.trim() ||
          optionalRawString(account.key_name)?.trim() ||
          "AgentEarth API Key",
      },
      grantedScopes: [],
      metadata: {},
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "agentearth",
  baseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "content-type": "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
