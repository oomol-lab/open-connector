import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { pushinatorActions } from "./actions.ts";
const apiBaseUrl = "https://api.pushinator.com/api/v2";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "pushinator",
  mapProviderActionHandlers(
    "pushinator",
    pushinatorActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const apiKey = requiredInputString(context.apiKey, "API Key");
      const fetcher = context.fetcher;
      const path = actionName === "send_notification" ? "/notifications/send" : "/channels";
      return runProviderRequest({ label: "Pushinator", signal: context.signal }, async (signal) => {
        const response = await fetcher(`${apiBaseUrl}${path}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": providerUserAgent,
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(input),
          signal,
        });
        const text = await response.text();
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new ProviderRequestError(
            response.ok ? 502 : response.status,
            "Pushinator returned invalid JSON",
            undefined,
            "provider_error",
          );
        }
        const record = optionalRecord(payload);
        if (!response.ok || record?.success === false) {
          const message = optionalString(record?.message) ?? response.statusText;
          throw new ProviderRequestError(
            response.ok ? 502 : response.status,
            `Pushinator request failed: ${message}`,
            undefined,
            "provider_error",
          );
        }
        const result = requiredResponseRecord(payload, "Pushinator response");
        return actionName === "create_channel" ? { channel: result } : result;
      });
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "Pushinator API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationMode: "local_non_empty_key",
        validationReason: "official_api_only_documents_write_endpoints",
      },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pushinator",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
