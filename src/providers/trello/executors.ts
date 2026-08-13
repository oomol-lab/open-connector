import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { TrelloActionContext } from "./runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  createTrelloContext,
  trelloActionHandlers,
  trelloApiBaseUrl,
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
    return createTrelloContext(await requireTrelloCredential(context), fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = createTrelloContext(await requireTrelloCredential(context), trelloFetch, context.signal);
    const url = createProviderProxyUrl(trelloApiBaseUrl, input.endpoint, input.query);
    url.searchParams.set("key", credential.apiKey);
    url.searchParams.set("token", credential.apiToken);
    const headers = normalizeProviderProxyHeaders(input.headers);
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
  oauth1: validateTrelloOAuthCredential,
};

type TrelloCredential =
  | Extract<ResolvedCredential, { authType: "custom_credential" }>
  | Extract<ResolvedCredential, { authType: "oauth1" }>;

async function requireTrelloCredential(context: ExecutionContext): Promise<TrelloCredential> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "custom_credential" || credential?.authType === "oauth1") {
    return credential;
  }
  throw new ProviderRequestError(401, "Connect trello with OAuth or configure API key and token credentials first.");
}
