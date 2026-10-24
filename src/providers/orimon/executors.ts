import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { randomUUID } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
const orimonApiBaseUrl = "https://channel-connector.orimon.ai/orimon/v1";
const orimonMessagePath = "/conversation/api/message";
interface RequestOptions {
  apiKey: string;
  fetcher: ProviderFetch;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "orimon",
  {
    async send_message(input, context) {
      const tenantId = requiredInputString(input.tenantId, "tenantId");
      return requestOrimonJson({
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        body: {
          type: "message",
          info: {
            psid: optionalString(input.psid)?.trim() || `${randomUUID()}_${tenantId}`,
            sender: "user",
            tenantId,
            platformName: "web",
          },
          message: {
            id: optionalString(input.messageId)?.trim() || randomUUID(),
            type: "text",
            payload: { text: requiredInputString(input.message, "message") },
          },
        },
      });
    },
  },
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "orimon",
  baseUrl: orimonApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "apiKey " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey() {
    return {
      profile: { accountId: "orimon", displayName: "Orimon API Key" },
      metadata: { apiBaseUrl: orimonApiBaseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
async function requestOrimonJson(options: RequestOptions) {
  return runProviderRequest({ label: "Orimon", signal: options.signal }, async (signal) => {
    const response = await options.fetcher(new URL(`${orimonApiBaseUrl}${orimonMessagePath}`), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `apiKey ${options.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(options.body),
      signal,
    });
    const text = await response.text();
    const payload = parseJsonObject(text);
    if (!response.ok) {
      throw createOrimonError(response.status, payload, text);
    }
    return requiredResponseRecord(payload, "Orimon response");
  });
}

function parseJsonObject(text: string) {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function createOrimonError(status: number, payload: unknown, fallback: string) {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error) ?? fallback.trim();
  return new ProviderRequestError(
    status,
    message || `Orimon request failed with status ${status}`,
    undefined,
    "provider_error",
  );
}
