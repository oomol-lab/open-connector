import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  buildTogglAuthorizationHeader,
  togglActionHandlers,
  togglApiBaseUrl,
  validateTogglCredential,
} from "./runtime.ts";

const service = "toggl";

const togglFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, togglActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(togglApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildTogglAuthorizationHeader(credential.apiKey));
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

    const response = await togglFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `toggl request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "toggl request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateTogglCredential(input.apiKey, fetcher, signal);
  },
};
