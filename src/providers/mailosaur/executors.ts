import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { Buffer } from "node:buffer";
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
import { mailosaurActionHandlers, mailosaurApiBaseUrl, validateMailosaurCredential } from "./runtime.ts";

const service = "mailosaur";
const mailosaurFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailosaurActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(mailosaurApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`api:${credential.apiKey}`).toString("base64")}`);
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

    const response = await mailosaurFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Mailosaur request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Mailosaur request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailosaurCredential(input.apiKey, fetcher, signal);
  },
};
