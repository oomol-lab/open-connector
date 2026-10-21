import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
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
