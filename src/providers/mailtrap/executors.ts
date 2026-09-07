import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  mailtrapActionHandlers,
  mailtrapApiBaseUrl,
  readAccessibleMailtrapAccountIds,
  readMailtrapAccountId,
  validateMailtrapCredential,
} from "./runtime.ts";

const service = "mailtrap";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: mailtrapActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountId: readMailtrapAccountId({
        ...credential.metadata,
        ...credential.values,
      }),
      accessibleAccountIds: readAccessibleMailtrapAccountIds(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailtrapApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMailtrapCredential(
      {
        apiKey: input.apiKey,
        accountId: input.values.accountId,
      },
      fetcher,
      signal,
    );
  },
};
