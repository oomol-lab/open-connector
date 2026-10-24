import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AmiliaContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  amiliaActionHandlers,
  buildAmiliaApiBaseUrl,
  normalizeAmiliaOrganization,
  validateAmiliaCredential,
} from "./runtime.ts";

const service = "amilia";

export const executors: ProviderExecutors = defineProviderExecutors<AmiliaContext>({
  service,
  handlers: amiliaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AmiliaContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      organization: normalizeAmiliaOrganization(credential.values.organization),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return buildAmiliaApiBaseUrl(normalizeAmiliaOrganization(credential.values.organization));
  },
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateAmiliaCredential(
      {
        apiKey: input.apiKey,
        organization: input.values.organization,
      },
      fetcher,
      signal,
    );
  },
};
