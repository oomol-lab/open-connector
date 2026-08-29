import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { koboToolboxActionHandlers, normalizeKoboToolboxBaseUrl, validateKoboToolboxCredential } from "./runtime.ts";

const service = "kobotoolbox";
interface Context {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
const handlers = Object.fromEntries(
  Object.entries(koboToolboxActionHandlers).map(([name, handler]) => [
    name,
    (input: Record<string, unknown>, context: Context) =>
      handler(
        {
          apiKey: context.apiKey,
          input,
          providerMetadata: { baseUrl: context.baseUrl },
          signal: context.signal,
        },
        context.fetcher,
      ),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeKoboToolboxBaseUrl(credential.values.baseUrl ?? credential.metadata.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const result = await validateKoboToolboxCredential(
      { apiKey: input.apiKey, baseUrl: String(input.values.baseUrl ?? "") },
      guardedFetcher,
      signal,
    );
    return {
      profile: { accountId: result.providerAccountId ?? "kobotoolbox", displayName: result.accountLabel },
      grantedScopes: [],
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeKoboToolboxBaseUrl(credential.values.baseUrl ?? credential.metadata.baseUrl);
  },
  auth: { type: "api_key_header", name: "authorization" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType != "api_key")
      throw new ProviderRequestError(401, "Configure KoboToolbox credentials first.");
    headers.set("authorization", `Token ${credential.apiKey}`);
    headers.set("accept", "application/json");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
