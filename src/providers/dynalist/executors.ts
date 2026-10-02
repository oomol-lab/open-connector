import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { dynalistActions } from "./actions.ts";
const baseUrl = "https://dynalist.io/api/v1";
const endpoints: Record<string, string> = {
  list_files: "/file/list",
  edit_files: "/file/edit",
  read_document: "/doc/read",
  check_for_updates: "/doc/check_for_updates",
  edit_document: "/doc/edit",
  add_to_inbox: "/inbox/add",
  get_preference: "/pref/get",
  set_preference: "/pref/set",
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "dynalist",
  mapProviderActionHandlers(
    "dynalist",
    dynalistActions,
    (_action, name) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
      requestDynalist(endpoints[name]!, input, context.apiKey, context.fetcher, false, context.signal),
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestDynalist("/pref/get", { key: "inbox_move_position" }, input.apiKey, fetcher, true, signal);
    return { profile: { displayName: "Dynalist Account" }, grantedScopes: [], metadata: {} };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "dynalist",
  baseUrl,
  auth: { type: "api_key_json_body", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
async function requestDynalist(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Dynalist", signal: parentSignal }, async (signal) => {
    const response = await fetcher(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ ...body, token: apiKey }),
      signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = optionalRecord(JSON.parse(text));
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Dynalist returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const code = optionalString(payload?._code);
    const message = optionalString(payload?._msg);
    if (code === "InvalidToken") {
      throw new ProviderRequestError(validating ? 400 : 401, message || "Dynalist API secret token is invalid");
    }
    if (!response.ok || code !== "OK") {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Dynalist ${code ?? response.status}: ${message || "request failed"}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Dynalist");
  });
}
