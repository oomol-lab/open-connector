import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

async function post(
  path: string,
  input: Record<string, unknown>,
  context: Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1],
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(new URL(path, "https://developer.voicemaker.in"), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(input),
    signal: context.signal,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload)
    throw new ProviderRequestError(response.status || 502, "Voicemaker request failed", payload);
  return payload;
}
const handlers: ProviderActionHandlers<"voicemaker", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_voices(input, context) {
    const payload = await post("/api/v1/voice/list", input, context);
    const data = payload.data as { voices_list?: unknown[] } | undefined;
    return { voices: data?.voices_list ?? [] };
  },
  async generate_tts(input, context) {
    const payload = await post("/api/v1/voice/convert", input, context);
    return {
      audioUrl: payload.path,
      usedChars: payload.usedChars,
      remainingChars: payload.remainChars,
      remainingKeyChars: payload.remainKeyChars,
    };
  },
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineApiKeyProviderExecutors(
  "voicemaker",
  handlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "voicemaker",
  baseUrl: "https://developer.voicemaker.in",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await post("/api/v1/voice/list", { language: "en-US" }, { apiKey: input.apiKey, fetcher, signal });
    const data = payload.data as { voices_list?: unknown[] } | undefined;
    if (!Array.isArray(data?.voices_list))
      throw new ProviderRequestError(502, "Voicemaker validation response omitted voices");
    return {
      profile: { accountId: "api_key", displayName: "Voicemaker API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://developer.voicemaker.in",
        validationEndpoint: "/api/v1/voice/list",
        voicesCount: data.voices_list.length,
      },
    };
  },
};
