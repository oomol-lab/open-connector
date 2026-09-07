import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { getSvixBaseUrl, svixActionHandlers, validateSvixCredential } from "./runtime.ts";

const service = "svix";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: svixActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    const serverUrl = readString(credential.metadata.serverUrl) ?? readString(credential.values.serverUrl);
    return {
      apiKey: credential.apiKey,
      baseUrl: getSvixBaseUrl({ apiKey: credential.apiKey, serverUrl }),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return getSvixBaseUrl({
      apiKey: credential.apiKey,
      serverUrl: readString(credential.metadata.serverUrl),
    });
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateSvixCredential(
      {
        apiKey: input.apiKey,
        serverUrl: input.values.serverUrl,
      },
      guardedFetcher,
      signal,
    );
  },
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
