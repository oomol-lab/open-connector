import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { simpleAnalyticsActionHandlers, simpleAnalyticsBaseUrl, validateSimpleAnalyticsCredential } from "./runtime.ts";

const service = "simple_analytics";

interface SimpleAnalyticsContext extends ApiKeyProviderContext {
  userId?: string;
}

export const executors: ProviderExecutors = defineProviderExecutors<SimpleAnalyticsContext>({
  service,
  handlers: simpleAnalyticsActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SimpleAnalyticsContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      userId: credential.values.userId || readMetadataUserId(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    readSimpleAnalyticsUserId(await requireApiKeyCredential(context, service));
    return simpleAnalyticsBaseUrl;
  },
  auth: { type: "api_key_header", name: "api-key" },
  async customizeRequest({ context, headers }) {
    headers.set("user-id", readSimpleAnalyticsUserId(await requireApiKeyCredential(context, service)));
  },
  skipDnsValidation: true,
});

function readSimpleAnalyticsUserId(credential: {
  values: Record<string, string>;
  metadata: Record<string, unknown>;
}): string {
  const userId = credential.values.userId || readMetadataUserId(credential.metadata);
  if (!userId) {
    throw new ProviderRequestError(400, "userId is required");
  }
  return userId;
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSimpleAnalyticsCredential(input.apiKey, input.values, fetcher, signal);
  },
};

function readMetadataUserId(metadata: Record<string, unknown>): string | undefined {
  return typeof metadata.userId === "string" && metadata.userId ? metadata.userId : undefined;
}
