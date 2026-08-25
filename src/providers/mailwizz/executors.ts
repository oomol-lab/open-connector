import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MailWizzContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createMailWizzContext,
  mailWizzActionHandlers,
  normalizeMailWizzBaseUrl,
  validateMailWizzCredential,
} from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<MailWizzContext>({
  service: "mailwizz",
  handlers: mailWizzActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "mailwizz");
    return createMailWizzContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  fallbackMessage: "MailWizz request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "mailwizz",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "mailwizz");
    const value = optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "mailwizz connection is missing baseUrl");
    return normalizeMailWizzBaseUrl(value);
  },
  auth: { type: "api_key_header", name: "X-Api-Key" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guarded = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateMailWizzCredential(input.values, input.apiKey, guarded, signal);
  },
};
