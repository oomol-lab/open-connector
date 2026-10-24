import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readAccessibleRingbaAccountIds,
  ringbaActionHandlers,
  ringbaApiBaseUrl,
  validateRingbaCredential,
} from "./runtime.ts";

const service = "ringba";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: ringbaActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountId:
        optionalString(credential.values.accountId)?.trim() ||
        optionalString(credential.metadata.accountId)?.trim() ||
        undefined,
      accessibleAccountIds: readAccessibleRingbaAccountIds(credential.metadata),
      fetcher,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ringbaApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRingbaCredential(input.apiKey, input.values.accountId, fetcher);
  },
};
