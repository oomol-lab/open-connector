import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MxContext } from "./runtime.ts";

import {
  basicAuthorizationHeader,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { mxActionHandlers, mxApiBaseUrl, validateMxCredential } from "./runtime.ts";

const service = "mx";

export const executors: ProviderExecutors = defineProviderExecutors<MxContext>({
  service,
  handlers: mxActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const clientId = credential.values.clientId;
    if (!clientId) {
      throw new ProviderRequestError(401, "Configure MX client ID first.");
    }
    return {
      apiKey: credential.apiKey,
      clientId,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mxApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const clientId = credential.values.clientId;
    if (!clientId) {
      throw new ProviderRequestError(401, "Configure MX client ID first.");
    }
    headers.set("authorization", basicAuthorizationHeader(`${clientId}:${credential.apiKey}`));
    headers.set("accept", "application/vnd.mx.api.v1+json");
    headers.set("accept-version", "v20250224");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const clientId = input.values.clientId;
    if (!clientId) {
      throw new ProviderRequestError(400, "clientId is required.");
    }
    return validateMxCredential(input.apiKey, clientId, fetcher, signal);
  },
};
