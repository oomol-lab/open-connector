import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { requestTokenRevocation, selectOAuthRevocationToken } from "../../oauth/oauth-token.ts";
import { defineBearerProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { calendlyActionHandlers, calendlyApiOrigin, validateCalendlyCredential } from "./runtime.ts";
import { calendlyBookingEvent } from "./trigger-on-booking-event.ts";

const service = "calendly";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, calendlyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: calendlyApiOrigin,
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCalendlyCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateCalendlyCredential(input.accessToken, fetcher, signal);
  },
};

export const triggers: readonly IntegrationDefinition[] = [calendlyBookingEvent];

export const oauth: ProviderOAuthRuntime = {
  async revokeAccessToken(input): Promise<void> {
    const token = selectOAuthRevocationToken(input);
    if (!token) return;

    await requestTokenRevocation({
      revocationUrl: "https://auth.calendly.com/oauth/revoke",
      request: {
        body: new URLSearchParams({
          token: token.token,
          client_id: input.clientConfig.clientId,
          client_secret: input.clientConfig.clientSecret,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
};
