import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TrelloActionContext } from "./runtime.ts";

import { encodeRfc3986 } from "../../core/aws-sigv4.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import { trelloActionHandlers, trelloApiBaseUrl, validateTrelloCredential } from "./runtime.ts";

const service = "trello";

const trelloFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<TrelloActionContext>({
  service,
  handlers: trelloActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TrelloActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure trello custom credentials first.");
    }
    return {
      apiKey: credential.values.apiKey,
      apiToken: credential.values.apiToken,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const url = createProviderProxyUrl(trelloApiBaseUrl, input.endpoint, input.query);
    url.searchParams.delete("key");
    url.searchParams.delete("token");
    const headers = normalizeProviderProxyHeaders(input.headers);
    // Trello attachment downloads require header authentication, unlike metadata reads.
    headers.set(
      "authorization",
      `OAuth oauth_consumer_key="${encodeRfc3986(credential.values.apiKey)}", oauth_token="${encodeRfc3986(credential.values.apiToken)}"`,
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

    const response = await trelloFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Trello request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Trello request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential: validateTrelloCredential,
};
