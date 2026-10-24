import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { planlyActions } from "./actions.ts";
const baseUrl = "https://app.planly.com/api";
const endpoints: Record<string, string> = {
  list_teams: "/teams/list",
  list_channels: "/v2/channels/list",
  import_media: "/v2/media/import-from-url",
  list_media: "/v2/media/list",
  delete_media: "/v2/media/delete",
  create_schedules: "/v2/schedules/create",
  list_schedules: "/v2/schedules/list",
};
async function requestPlanly(
  endpoint: string,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Planly" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await readProviderTextBody(response, "planly response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Planly returned invalid JSON (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const record = optionalRecord(payload);
    if (!response.ok || record?.error != null) {
      const upstreamError = optionalRecord(record?.error);
      const message =
        optionalRawString(upstreamError?.message) ??
        optionalRawString(record?.error) ??
        optionalRawString(record?.message) ??
        `Planly request failed (HTTP ${response.status})`;
      const code = optionalRawString(upstreamError?.code) ?? optionalRawString(record?.code);
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        code ? `${code}: ${message}` : message,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Planly");
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "planly",
  mapProviderActionHandlers(
    "planly",
    planlyActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const body = input;
      if (actionName === "list_pinterest_boards" && (body.channelId === "." || body.channelId === "..")) {
        throw new ProviderRequestError(400, "Invalid Pinterest channel ID", undefined, "invalid_input");
      }
      const endpoint =
        actionName === "list_pinterest_boards"
          ? `/v2/pinterest/get-board-list/${encodeURIComponent(String(body.channelId))}`
          : endpoints[actionName];
      if (!endpoint) {
        throw new ProviderRequestError(400, `Unknown Planly endpoint: ${actionName}`, undefined, "invalid_input");
      }
      return requestPlanly(
        endpoint,
        actionName === "list_teams" || actionName === "list_pinterest_boards" ? undefined : body,
        context.apiKey,
        context.fetcher,
        context.signal,
      );
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await requestPlanly("/teams/list", undefined, requiredInputString(input.apiKey, "API Key"), fetcher);
    if (!Array.isArray(result.data)) {
      throw new ProviderRequestError(502, "Planly returned an invalid team list", undefined, "provider_error");
    }
    return {
      profile: { displayName: "Planly API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "planly",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({ accept: "application/json" }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
