import type {
  CredentialValidators,
  ProviderExecutors,
  ProxyExecutionResult,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { providerFetch, providerUserAgent } from "../provider-runtime.ts";
import { createLunoContext, lunoActionHandlers, lunoApiBaseUrl, validateLuno } from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "luno",
  handlers: lunoActionHandlers,
  createContext: createLunoContext,
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, "luno");
    const keyId = credential.values.keyId;
    const url = createProviderProxyUrl(lunoApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${keyId}:${credential.apiKey}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);
    const response = await providerFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
    });
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Luno proxy request failed");
  }
};
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLuno(input, fetcher, signal);
  },
};
