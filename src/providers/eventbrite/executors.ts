import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString, runProviderRequest } from "../provider-runtime.ts";
import { eventbriteEvent } from "./trigger-on-event.ts";

const service = "eventbrite";
const baseUrl = "https://www.eventbriteapi.com/v3";

async function eventbriteRequest(
  apiKey: string,
  path: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Eventbrite", signal }, async (reqSignal) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
      signal: reqSignal,
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `Eventbrite request failed (${response.status})`,
        payload,
      );
    }
    return optionalRecord(payload) ?? {};
  });
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    async list_organizations(_input, context) {
      const data = await eventbriteRequest(context.apiKey, "/users/me/organizations/", context.fetcher, context.signal);
      return { organizations: Array.isArray(data.organizations) ? data.organizations : [] };
    },
    async list_organization_events(input, context) {
      const organizationId = requiredInputString(input.organizationId, "organizationId");
      const status = optionalString(input.status);
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await eventbriteRequest(
        context.apiKey,
        `/organizations/${encodePathSegment(organizationId)}/events/${query}`,
        context.fetcher,
        context.signal,
      );
      return {
        events: Array.isArray(data.events) ? data.events : [],
        pagination: optionalRecord(data.pagination) ?? {},
      };
    },
  },
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await eventbriteRequest(input.apiKey, "/users/me/", fetcher, signal);
    return {
      profile: {
        accountId: optionalString(user.id) ?? "eventbrite",
        displayName: optionalString(user.name) ?? "Eventbrite User",
      },
    };
  },
};

export const triggers: readonly IntegrationDefinition[] = [eventbriteEvent];
