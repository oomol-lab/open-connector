import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { UpstashRedisContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireCustomCredential } from "../provider-runtime.ts";
import {
  createUpstashRedisContext,
  normalizeUpstashRestUrl,
  upstashRedisActionHandlers,
  validateUpstashRedisCredential,
} from "./runtime.ts";

const service = "upstash_redis";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: upstashRedisActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<UpstashRedisContext> {
    const credential = await requireCustomCredential(context, service);
    return createUpstashRedisContext(credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return normalizeUpstashRestUrl(credential.values.restUrl).toString();
  },
  auth: { type: "custom_credential_header", field: "restToken", name: "authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateUpstashRedisCredential(input.values, fetcher, signal);
  },
};
