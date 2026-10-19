import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { smarthrActions } from "./actions.ts";
import { executeSmartHrAction, smartHrBaseUrl, validateSmartHrCredential, readSmartHrError } from "./runtime.ts";

interface SmartHrContext extends ApiKeyProviderContext {
  metadata: Record<string, unknown>;
}
const handlers = mapProviderActionHandlers(
  "smarthr",
  smarthrActions,
  (action) => (input: Record<string, unknown>, context: SmartHrContext) =>
    executeSmartHrAction(
      {
        apiKey: context.apiKey,
        actionName: action.name,
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
      context.signal,
    ),
);

export const executors: ProviderExecutors = defineProviderExecutors<SmartHrContext>({
  service: "smarthr",
  handlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "smarthr");
    return { apiKey: credential.apiKey, metadata: credential.values, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { accountId, displayName, tenant } = await validateSmartHrCredential(
      { ...input.values, apiKey: input.apiKey },
      fetcher,
      signal,
    );
    return { profile: { accountId, displayName }, grantedScopes: [], metadata: tenant };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  readError: readSmartHrError,
  service: "smarthr",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "smarthr");
    return smartHrBaseUrl(credential.values);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
