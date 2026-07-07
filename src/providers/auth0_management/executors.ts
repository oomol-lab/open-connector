import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  auth0ManagementActionHandlers,
  buildAuth0ManagementBaseUrl,
  validateAuth0ManagementCredential,
} from "./runtime.ts";

const service = "auth0_management";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: auth0ManagementActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const domain = optionalString(credential.values.domain);
    if (!domain) {
      throw new ProviderRequestError(401, "Configure auth0_management domain credentials first.");
    }
    return {
      apiKey: credential.apiKey,
      domain,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const domain = optionalString(credential.values.domain);
    if (!domain) {
      throw new ProviderRequestError(401, "Configure auth0_management domain credentials first.");
    }
    return buildAuth0ManagementBaseUrl(domain);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAuth0ManagementCredential(input.apiKey, input.values.domain, fetcher, signal);
  },
};
