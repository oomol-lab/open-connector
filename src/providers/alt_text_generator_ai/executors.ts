import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "alt_text_generator_ai";
const baseUrl = "https://alttextgeneratorai.com";

const handlers: ProviderActionHandlers<"alt_text_generator_ai", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async generate_alt_text(input, context: ApiKeyProviderContext) {
    const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl : "";
    const response = await context.fetcher(`${baseUrl}/api/wp`, {
      method: "POST",
      headers: { accept: "text/plain", "content-type": "application/json", "user-agent": providerUserAgent },
      body: JSON.stringify({ image: imageUrl, wpkey: context.apiKey }),
      signal: context.signal,
    });
    const text = await response.text();
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        text.trim() || `Alt Text Generator AI request failed with HTTP ${response.status}`,
      );
    const trimmed = text.trim();
    if (!trimmed) throw new ProviderRequestError(502, "Alt Text Generator AI returned empty text");
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string" && parsed.trim()) return { altText: parsed.trim() };
    } catch {}
    return { altText: trimmed };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) throw new ProviderRequestError(400, "Alt Text Generator AI API key is required");
    return {
      profile: { displayName: "Alt Text Generator AI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
