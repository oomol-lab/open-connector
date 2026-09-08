import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { MetabaseContext } from "./runtime.ts";

import {
  combineProviderActionHandlers,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { metabaseMcpHandlers } from "./mcp-runtime.ts";
import { metabaseActionHandlers, normalizeMetabaseUrls, validateMetabaseCredential } from "./runtime.ts";

const service = "metabase";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: combineProviderActionHandlers<"metabase", ProviderRuntimeHandler<MetabaseContext>>(
    service,
    metabaseActionHandlers,
    metabaseMcpHandlers,
  ),
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const urls = normalizeMetabaseUrls(credential.metadata.apiBaseUrl ?? credential.values.instanceUrl);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: urls.apiBaseUrl,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeMetabaseUrls(credential.metadata.apiBaseUrl ?? credential.values.instanceUrl).apiBaseUrl;
  },
  auth: {
    type: "api_key_header",
    name: "x-api-key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMetabaseCredential({ apiKey: input.apiKey, instanceUrl: input.values.instanceUrl }, fetcher, signal);
  },
};
