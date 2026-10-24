import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildConfluentAuthorizationHeader,
  confluentActionHandlers,
  confluentApiBaseUrl,
  validateConfluentCredential,
} from "./runtime.ts";

const service = "confluent";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: confluentActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const apiKeyId = credential.values.apiKeyId?.trim();
    if (!apiKeyId) throw new ProviderRequestError(400, "Confluent Cloud API key ID is missing");
    return { apiKeyId, apiSecret: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: confluentApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const apiKeyId = credential.values.apiKeyId?.trim();
    if (!apiKeyId) throw new ProviderRequestError(400, "Confluent Cloud API key ID is missing");
    headers.set("authorization", buildConfluentAuthorizationHeader(apiKeyId, credential.apiKey));
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const apiKeyId = input.values.apiKeyId?.trim();
    if (!apiKeyId) throw new ProviderRequestError(400, "Confluent Cloud API key ID is required");
    return validateConfluentCredential({ apiKeyId, apiSecret: input.apiKey, fetcher, signal });
  },
};
