import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GongContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { gongActionHandlers, resolveGongCredentialContext, validateGongCredential } from "./runtime.ts";

const service = "gong";

export const executors: ProviderExecutors = defineProviderExecutors<GongContext>({
  service,
  handlers: gongActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GongContext> {
    const credential = await requireCustomCredential(context, service);
    return resolveGongCredentialContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "gong request failed",
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const gongContext = resolveGongCredentialContext(credential.values, fetch, context.signal);
    const url = createProviderProxyUrl(gongContext.apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${gongContext.accessKey}:${gongContext.accessKeySecret}`).toString("base64")}`,
    );
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
      throw new ProviderRequestError(response.status, text || `Gong request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "gong request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateGongCredential(input.values, fetcher, signal);
  },
};
