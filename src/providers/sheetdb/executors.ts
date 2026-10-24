import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { SheetDbContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requireSheetDbApiId, sheetDbActionHandlers, sheetDbApiBaseUrl, validateSheetDbCredential } from "./runtime.ts";

const service = "sheetdb";

export const executors: ProviderExecutors = defineProviderExecutors<SheetDbContext>({
  service,
  handlers: sheetDbActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SheetDbContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiId: requireSheetDbApiId(credential.metadata.apiId ?? credential.values.apiId),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSheetDbCredential(input.apiKey, input.values.apiId, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sheetDbApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
