import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { convertkitSubscriberEvent } from "./trigger-on-subscriber-event.ts";

const service = "convertkit";
const baseUrl = "https://api.kit.com/v4";

async function kitRequest(
  apiKey: string,
  path: string,
  fetcher: typeof fetch,
  options: { method?: string; body?: Record<string, unknown>; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Kit", signal: options.signal }, async (signal) => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "x-kit-api-key": apiKey,
        "accept": "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    if (!response.ok) {
      let errorPayload: unknown = {};
      try {
        errorPayload = (await response.json()) as unknown;
      } catch (error) {
        if (signal.aborted) throw error;
      }
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `Kit request failed (${response.status})`,
        errorPayload,
        response.status === 401 || response.status === 403 ? "provider_error" : undefined,
      );
    }
    const payload = (await response.json()) as unknown;
    return requiredResponseRecord(payload, "convertkit response");
  });
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    async list_subscribers(input, context) {
      const query = new URLSearchParams();
      const perPage = optionalInteger(input.perPage);
      const after = optionalString(input.after);
      if (perPage != null) query.set("per_page", String(perPage));
      if (after) query.set("after", after);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const data = await kitRequest(context.apiKey, `/subscribers${suffix}`, context.fetcher, {
        signal: context.signal,
      });
      return {
        subscribers: Array.isArray(data.subscribers) ? data.subscribers : [],
        pagination: optionalRecord(data.pagination) ?? {},
      };
    },
    async create_subscriber(input, context) {
      const emailAddress = requiredInputString(input.emailAddress, "emailAddress");
      const firstName = optionalString(input.firstName);
      const data = await kitRequest(context.apiKey, "/subscribers", context.fetcher, {
        method: "POST",
        body: firstName ? { email_address: emailAddress, first_name: firstName } : { email_address: emailAddress },
        signal: context.signal,
      });
      return { subscriber: optionalRecord(data.subscriber) ?? data };
    },
  },
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "x-kit-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = await kitRequest(input.apiKey, "/account", fetcher, { signal });
    const inner = optionalRecord(account.account) ?? account;
    return {
      profile: {
        accountId: typeof inner.id === "number" ? String(inner.id) : (optionalString(inner.id) ?? "convertkit"),
        displayName: optionalString(inner.name) ?? "Kit Account",
      },
    };
  },
};

export const triggers: readonly IntegrationDefinition[] = [convertkitSubscriberEvent];
