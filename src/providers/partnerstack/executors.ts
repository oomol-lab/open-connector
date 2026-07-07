import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { buildBasicAuthHeader, executors, partnerstackApiBaseUrl, validatePartnerstackCredential } from "./runtime.ts";

export { executors };

const service = "partnerstack";

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(partnerstackApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildBasicAuthHeader(credential.values.publicKey, credential.apiKey));
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
        text || `PartnerStack request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "PartnerStack request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePartnerstackCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
