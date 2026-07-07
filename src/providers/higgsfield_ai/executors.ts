import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { HiggsfieldAiContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  higgsfieldAiActionHandlers,
  higgsfieldAiApiBaseUrl,
  readHiggsfieldAiApiSecret,
  validateHiggsfieldAiCredential,
} from "./runtime.ts";

const service = "higgsfield_ai";

export const executors: ProviderExecutors = defineProviderExecutors<HiggsfieldAiContext>({
  service,
  handlers: higgsfieldAiActionHandlers,
  async createContext(context, fetcher): Promise<HiggsfieldAiContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: readHiggsfieldAiApiSecret(credential.values.apiSecret),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(higgsfieldAiApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Key ${credential.apiKey}:${readHiggsfieldAiApiSecret(credential.values.apiSecret)}`);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `Higgsfield AI request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Higgsfield AI request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHiggsfieldAiCredential(
      input.apiKey,
      readHiggsfieldAiApiSecret(input.values.apiSecret),
      fetcher,
      signal,
    );
  },
};
