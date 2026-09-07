import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { apaleoActionHandlers, apaleoApiBaseUrl, apaleoJsonRequest } from "./runtime.ts";

interface ApaleoCurrentAccountPayload {
  code?: string;
  name?: string;
  type?: string;
  defaultLanguage?: string;
  description?: string;
  logoUrl?: string;
  location?: Record<string, unknown>;
}

const service = "apaleo";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, apaleoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apaleoApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = await apaleoJsonRequest<ApaleoCurrentAccountPayload>({
      path: "/account/v1/accounts/current",
      accessToken: input.accessToken,
      fetcher,
      signal,
    });
    if (!payload) {
      throw new ProviderRequestError(502, "apaleo current account response is empty");
    }

    const accountId = optionalString(payload.code);
    if (!accountId) {
      throw new ProviderRequestError(502, "apaleo current account response is missing code");
    }

    return {
      profile: {
        accountId,
        displayName: optionalString(payload.name) ?? accountId,
      },
      metadata: {
        code: accountId,
        name: payload.name,
        type: payload.type,
        defaultLanguage: payload.defaultLanguage,
        description: payload.description,
        logoUrl: payload.logoUrl,
        location: payload.location,
      },
    };
  },
};
