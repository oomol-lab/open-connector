import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { WacheteContext } from "./runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  requestWacheteToken,
  resolveWacheteUserId,
  validateWacheteCredential,
  wacheteActionHandlers,
  wacheteApiBaseUrl,
} from "./runtime.ts";

const service = "wachete";

// Fixed-host proxy egress (wacheteApiBaseUrl); DNS-rebinding check is redundant here.
const wacheteFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<WacheteContext>({
  service,
  handlers: wacheteActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WacheteContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      userId: resolveWacheteUserId(credential),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const token = await requestWacheteToken({
      apiKey: credential.apiKey,
      userId: resolveWacheteUserId(credential),
      fetcher: wacheteFetch,
      signal: context.signal,
      phase: "execute",
    });
    const url = createProviderProxyUrl(wacheteApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${token}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await wacheteFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Wachete request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Wachete request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWacheteCredential(input.apiKey, input.values.userId, fetcher, signal);
  },
};
