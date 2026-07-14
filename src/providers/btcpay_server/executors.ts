import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BtcpayServerContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { btcpayServerActionHandlers, normalizeBtcpayBaseUrl, validateBtcpayServerCredential } from "./runtime.ts";

const service = "btcpay_server";

export const executors: ProviderExecutors = defineProviderExecutors<BtcpayServerContext>({
  service,
  handlers: btcpayServerActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BtcpayServerContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBtcpayBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return `${normalizeBtcpayBaseUrl(
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    )}/api/v1`;
  },
  auth: { type: "api_key_authorization", prefix: "token " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateBtcpayServerCredential(
      {
        apiKey: input.apiKey,
        baseUrl: optionalString(input.values.baseUrl),
      },
      guardedFetcher,
      signal,
    );
  },
};
