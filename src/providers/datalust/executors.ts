import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { DatalustContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createDatalustContext,
  datalustActionHandlers,
  normalizeDatalustBaseUrl,
  seqAcceptHeader,
  seqApiKeyHeader,
  validateDatalustCredential,
} from "./runtime.ts";

const service = "datalust";

export const executors: ProviderExecutors = defineProviderExecutors<DatalustContext>({
  service,
  handlers: datalustActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DatalustContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createDatalustContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    if (!value) throw new ProviderRequestError(500, "datalust connection is missing baseUrl metadata");
    return normalizeDatalustBaseUrl(value);
  },
  auth: { type: "api_key_header", name: seqApiKeyHeader },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", seqAcceptHeader);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateDatalustCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
