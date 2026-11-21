import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, providerInputError, runProviderRequest } from "../provider-runtime.ts";
import { keapEvent } from "./trigger-on-event.ts";

const service = "keap";
const baseUrl = "https://api.infusionsoft.com/crm/rest/v1";

async function keapRequest(
  apiKey: string,
  path: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Keap", signal }, async (reqSignal) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        "x-keap-api-key": apiKey,
        "accept": "application/json",
      },
      signal: reqSignal,
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `Keap request failed (${response.status})`,
        payload,
      );
    }
    return optionalRecord(payload) ?? {};
  });
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    async list_contacts(input, context) {
      const query = new URLSearchParams();
      const limit = optionalInteger(input.limit);
      const offset = optionalInteger(input.offset);
      if (limit != null) query.set("limit", String(limit));
      if (offset != null) query.set("offset", String(offset));
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const data = await keapRequest(context.apiKey, `/contacts${suffix}`, context.fetcher, context.signal);
      return { contacts: Array.isArray(data.contacts) ? data.contacts : [], count: optionalInteger(data.count) ?? 0 };
    },
    async get_contact(input, context) {
      const contactId = optionalInteger(input.contactId);
      if (contactId == null || contactId < 1) throw providerInputError("contactId must be a positive integer");
      const data = await keapRequest(context.apiKey, `/contacts/${contactId}`, context.fetcher, context.signal);
      return { contact: data };
    },
  },
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "x-keap-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profile = await keapRequest(input.apiKey, "/account/profile", fetcher, signal);
    return {
      profile: {
        accountId: optionalString(profile.email) ?? "keap",
        displayName: optionalString(profile.name) ?? "Keap Account",
      },
    };
  },
};

export const triggers: readonly IntegrationDefinition[] = [keapEvent];
