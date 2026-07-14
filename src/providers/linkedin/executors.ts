import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineOAuthProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireOAuthCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  linkedinActionHandlers,
  linkedinApiBaseUrl,
  linkedinApiVersion,
  validateLinkedinCredential,
} from "./runtime.ts";

const service = "linkedin";
const linkedinFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, linkedinActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireOAuthCredential(context, service);
    const url = createProviderProxyUrl(linkedinApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
    headers.set("linkedin-version", linkedinApiVersion);
    headers.set("user-agent", providerUserAgent);
    headers.set("x-restli-protocol-version", "2.0.0");

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

    const response = await linkedinFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `LinkedIn request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "LinkedIn request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateLinkedinCredential(input, fetcher, signal);
  },
};
