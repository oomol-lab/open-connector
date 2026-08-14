import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HeygenActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  createHeygenApiKeyAuth,
  createHeygenOAuthAuth,
  heygenActionHandlers,
  validateHeygenCredential,
} from "./runtime.ts";

const service = "heygen";

export const executors: ProviderExecutors = defineProviderExecutors<HeygenActionContext>({
  service,
  handlers: heygenActionHandlers,
  async createContext(context, fetcher): Promise<HeygenActionContext> {
    return {
      auth: await resolveHeygenAuth(context),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, options) {
    return validateHeygenCredential(createHeygenApiKeyAuth(input.apiKey), options);
  },
  oauth2(input, options) {
    return validateHeygenCredential(createHeygenOAuthAuth(input.accessToken, input.tokenType), options, {
      grantedScopes: input.profile.grantedScopes,
    });
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => (await resolveHeygenAuth(context)).apiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const auth = await resolveHeygenAuth(context);
    headers.delete("x-api-key");
    headers.set(auth.headerName, auth.headerValue);
  },
});

async function resolveHeygenAuth(context: ExecutionContext) {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return createHeygenOAuthAuth(credential.accessToken, credential.tokenType);
  }
  if (credential?.authType === "api_key") {
    return createHeygenApiKeyAuth(credential.apiKey);
  }
  throw new ProviderRequestError(401, "Configure HeyGen OAuth or API key credentials first.");
}
