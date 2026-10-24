import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { RakurakuContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { rakurakuSeisanActions } from "./actions.ts";
import { normalizeBaseUrl, executeRakurakuSeisanAction, readRakurakuError } from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors<RakurakuContext>({
  service: "rakuraku_seisan",
  handlers: mapProviderActionHandlers(
    "rakuraku_seisan",
    rakurakuSeisanActions,
    (action) => (input: Record<string, unknown>, context: RakurakuContext) =>
      executeRakurakuSeisanAction(action.name, input, context),
  ),
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "rakuraku_seisan");
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "apiKey");
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    return {
      profile: {
        accountId: baseUrl,
        displayName: `Rakuraku Seisan ${new URL(baseUrl).host}${new URL(baseUrl).pathname}`,
      },
      grantedScopes: [],
      metadata: { baseUrl, credentialValidation: "on_first_request" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "rakuraku_seisan",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "rakuraku_seisan");
    return `${normalizeBaseUrl(credential.values.baseUrl)}/api/v1`;
  },
  auth: { type: "api_key_header", name: "X-RS-apitoken" },
  readError: readRakurakuError,
});
