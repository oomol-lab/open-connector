import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { UpstashRedisContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createUpstashRedisContext, upstashRedisActionHandlers, validateUpstashRedisCredential } from "./runtime.ts";

const service = "upstash_redis";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: upstashRedisActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<UpstashRedisContext> {
    const credential = await requireCustomCredential(context, service);
    return createUpstashRedisContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateUpstashRedisCredential(input.values, fetcher, signal);
  },
};
