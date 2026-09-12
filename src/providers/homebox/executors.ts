import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HomeBoxActionContext, HomeBoxActionHandler } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  combineProviderActionHandlers,
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  homeBoxActionHandlers,
  homeBoxApiPrefix,
  resolveHomeBoxBaseUrl,
  validateHomeBoxCredential,
} from "./runtime.ts";

const service = "homebox";

function resolveHomeBoxApiRoot(context: ExecutionContext): Promise<string> {
  return requireApiKeyCredential(context, service).then((credential) => {
    const baseUrl = resolveHomeBoxBaseUrl({ values: credential.values, metadata: credential.metadata });
    return `${baseUrl.replace(/\/+$/, "")}/${homeBoxApiPrefix}/`;
  });
}

export const executors: ProviderExecutors = defineProviderExecutors<HomeBoxActionContext>({
  service,
  handlers: combineProviderActionHandlers<"homebox", HomeBoxActionHandler>(service, homeBoxActionHandlers),
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HomeBoxActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveHomeBoxBaseUrl({ values: credential.values, metadata: credential.metadata }),
      transitFiles: context.transitFiles,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: resolveHomeBoxApiRoot,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    // Re-guard so validating a private instance baseUrl follows the deployment opt-in.
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateHomeBoxCredential(input, guardedFetcher, signal);
  },
};
