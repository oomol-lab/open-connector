import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ListmonkActionContext, ListmonkActionHandler } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { combineProviderActionHandlers, defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import {
  listmonkActionHandlers,
  listmonkAuthorizationHeader,
  resolveListmonkApiUser,
  resolveListmonkBaseUrl,
  validateListmonkCredential,
} from "./runtime.ts";

const service = "listmonk";

export const executors: ProviderExecutors = defineProviderExecutors<ListmonkActionContext>({
  service,
  handlers: combineProviderActionHandlers<"listmonk", ListmonkActionHandler>(service, listmonkActionHandlers),
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ListmonkActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiUser: resolveListmonkApiUser(credential),
      apiKey: credential.apiKey,
      baseUrl: resolveListmonkBaseUrl(credential),
      fetcher,
      signal: context.signal,
    };
  },
});

// Hand-written auth: listmonk's `token <api_user>:<token>` header combines two
// credential fields, which none of the declarative proxy auth modes can express.
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return `${resolveListmonkBaseUrl(credential)}/api/`;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("authorization", listmonkAuthorizationHeader(resolveListmonkApiUser(credential), credential.apiKey));
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    // Re-guard so validating a private instance baseUrl follows the deployment opt-in.
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateListmonkCredential(input, guardedFetcher, signal);
  },
};
