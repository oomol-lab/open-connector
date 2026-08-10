import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BrowserbaseContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { browserbaseActionHandlers, validateBrowserbaseCredential } from "./runtime.ts";

const service = "browserbase";

export const executors: ProviderExecutors = defineProviderExecutors<BrowserbaseContext>({
  service,
  handlers: browserbaseActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BrowserbaseContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      projectId: optionalString(credential.values.projectId) ?? optionalString(credential.metadata.projectId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBrowserbaseCredential(
      {
        apiKey: input.apiKey,
        projectId: optionalString(input.values.projectId),
      },
      fetcher,
      signal,
    );
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.browserbase.com",
  auth: { type: "api_key_header", name: "x-bb-api-key" },
});
