import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { u301ActionHandlers, u301ApiBaseUrl, validateU301Credential } from "./runtime.ts";

const service = "u301";

interface U301ExecutorContext {
  apiKey: string;
  workspaceId?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<U301ExecutorContext>({
  service,
  handlers: u301ActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<U301ExecutorContext> {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure u301 API key credentials first.");
    }
    return {
      apiKey: credential.apiKey,
      workspaceId: credential.values.workspaceId,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: u301ApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ credential, headers, url }) {
    if (credential?.authType !== "api_key") throw new ProviderRequestError(401, "u301 requires api_key credential");
    const workspaceId = credential.values.workspaceId;
    if (!workspaceId) throw new ProviderRequestError(400, "workspaceId is required");
    url.searchParams.set("workspaceId", workspaceId);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateU301Credential({ apiKey: input.apiKey, workspaceId: input.values.workspaceId }, fetcher, signal);
  },
};
