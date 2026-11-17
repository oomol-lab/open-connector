import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TrelloActionContext, TrelloAuth } from "./runtime.ts";

import { encodeRfc3986 } from "../../core/aws-sigv4.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import {
  trelloActionHandlers,
  trelloBaseUrl,
  trelloBearerAuth,
  validateTrelloCredential,
  validateTrelloOAuthCredential,
} from "./runtime.ts";

const service = "trello";

const trelloFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<TrelloActionContext>({
  service,
  handlers: trelloActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TrelloActionContext> {
    return { auth: await requireTrelloAuth(context), fetcher, signal: context.signal };
  },
});

async function requireTrelloAuth(context: ExecutionContext): Promise<TrelloAuth> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return trelloBearerAuth(credential);
  }
  if (credential?.authType === "custom_credential") {
    return { type: "key", apiKey: credential.values.apiKey, apiToken: credential.values.apiToken };
  }
  throw new ProviderRequestError(401, "Connect trello with OAuth or configure custom credentials first.");
}

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const auth = await requireTrelloAuth(context);
    const url = createProviderProxyUrl(trelloBaseUrl(auth), input.endpoint, input.query);
    url.searchParams.delete("key");
    url.searchParams.delete("token");
    const headers = normalizeProviderProxyHeaders(input.headers);
    // Trello attachment downloads require header authentication, unlike metadata reads.
    headers.set(
      "authorization",
      auth.type === "bearer"
        ? `${auth.tokenType} ${auth.accessToken}`
        : `OAuth oauth_consumer_key="${encodeRfc3986(auth.apiKey)}", oauth_token="${encodeRfc3986(auth.apiToken)}"`,
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
  oauth2: validateTrelloOAuthCredential,
};
