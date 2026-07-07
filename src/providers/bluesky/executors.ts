import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { BlueskyContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
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
  blueskyActionHandlers,
  blueskyApiBaseUrl,
  createBlueskySession,
  requireBlueskyHandle,
  validateBlueskyCredential,
} from "./runtime.ts";

const service = "bluesky";

export const executors: ProviderExecutors = defineProviderExecutors<BlueskyContext>({
  service,
  handlers: blueskyActionHandlers,
  async createContext(context, fetcher): Promise<BlueskyContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      handle: requireBlueskyHandle(optionalString(credential.values.handle)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const session = await createBlueskySession({
      identifier: requireBlueskyHandle(optionalString(credential.values.handle)),
      appPassword: credential.apiKey,
      fetcher: fetch,
      signal: context.signal,
      phase: "execute",
    });
    const url = createProviderProxyUrl(blueskyApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${session.accessJwt}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBlueskyCredential(input, fetcher, signal);
  },
};
