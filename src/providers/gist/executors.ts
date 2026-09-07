import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GistActionContext } from "./runtime-shared.ts";

import { defineProviderExecutors, defineProviderProxy, requireBearerCredential } from "../provider-runtime.ts";
import { gistApiBaseUrl, gistApiVersion, gistDefaultAcceptHeader } from "./runtime-shared.ts";
import { gistActionHandlers, validateGistCredential } from "./runtime.ts";

const service = "gist";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gistApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", gistDefaultAcceptHeader);
    if (!headers.has("x-github-api-version")) headers.set("x-github-api-version", gistApiVersion);
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<GistActionContext>({
  service,
  handlers: gistActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GistActionContext> {
    const credential = await requireBearerCredential(context, service);
    return {
      accessToken: credential.accessToken,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "GitHub Gist request failed.",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGistCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateGistCredential(input.accessToken, fetcher, signal);
  },
};
