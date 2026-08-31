import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "emelia";
const emeliaApiBaseUrl = "https://api.emelia.io";

type EmeliaRequestPhase = "validate" | "execute";

type EmeliaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const emeliaActionHandlers: ProviderActionHandlers<"emelia", EmeliaActionHandler> = {
  list_campaigns(input, context) {
    return requestEmeliaList(
      "/emails/campaigns",
      "campaigns",
      queryFromFields(input, ["page", "limit", "search"]),
      context,
    );
  },
  get_campaign(input, context) {
    return requestEmeliaWrapped(`/emails/campaigns/${pathSegment(input.campaignId)}`, "campaign", context);
  },
  list_campaign_contacts(input, context) {
    return requestEmeliaContacts(queryFromFields(input, ["campaignId", "page"]), context);
  },
  get_campaign_activities(input, context) {
    return requestEmeliaList(
      `/emails/campaigns/${pathSegment(input.campaignId)}/activities`,
      "activities",
      queryFromFields(input, ["page", "type", "query", "contactId", "versionId"]),
      context,
    );
  },
  list_email_providers(_input, context) {
    return requestEmeliaList("/email-providers", "providers", new URLSearchParams(), context);
  },
  list_webhooks(_input, context) {
    return requestEmeliaList("/webhook", "webhooks", new URLSearchParams(), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, emeliaActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: emeliaApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestEmeliaJson(
      "/email-providers",
      { method: "GET", query: new URLSearchParams() },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const providers = extractArray(payload, "providers");
    const firstProvider = optionalRecord(providers[0]);
    const senderEmail = optionalString(firstProvider?.senderEmail);
    const senderName = optionalString(firstProvider?.senderName);
    const providerId = optionalString(firstProvider?._id) ?? optionalString(firstProvider?.id);

    return {
      profile: {
        accountId: providerId ?? "api_key",
        displayName: senderEmail ?? senderName ?? "Emelia API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: emeliaApiBaseUrl,
        validationEndpoint: "/email-providers",
        senderEmail,
        senderName,
        providerId,
      }),
    };
  },
};

async function requestEmeliaList(
  path: string,
  outputKey: string,
  query: URLSearchParams,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestEmeliaJson(path, { method: "GET", query }, context, "execute");
  return { [outputKey]: extractArray(payload, outputKey) };
}

async function requestEmeliaWrapped(
  path: string,
  outputKey: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestEmeliaJson(path, { method: "GET", query: new URLSearchParams() }, context, "execute");
  const record = optionalRecord(payload);
  return { [outputKey]: optionalRecord(record?.[outputKey]) ?? record ?? {} };
}

async function requestEmeliaContacts(
  query: URLSearchParams,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestEmeliaJson("/emails/campaign/contacts", { method: "GET", query }, context, "execute");
  const record = optionalRecord(payload);
  return compactObject({
    contacts: extractArray(payload, "contacts", "list"),
    count: typeof record?.count === "number" ? record.count : undefined,
  });
}

async function requestEmeliaJson(
  path: string,
  input: { method: string; query: URLSearchParams },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: EmeliaRequestPhase,
): Promise<unknown> {
  const url = new URL(path, emeliaApiBaseUrl);
  for (const [key, value] of input.query) {
    url.searchParams.append(key, value);
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "emelia returned malformed JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text,
    });
    if (!response.ok) {
      throw createEmeliaError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "emelia request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `emelia request failed: ${error.message}` : "emelia request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function createEmeliaError(response: Response, payload: unknown, phase: EmeliaRequestPhase): ProviderRequestError {
  const message = extractEmeliaErrorMessage(payload) ?? response.statusText ?? "emelia request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractEmeliaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function extractArray(payload: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = optionalRecord(payload);
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function queryFromFields(input: Record<string, unknown>, fields: readonly string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const field of fields) {
    const value = input[field];
    if (value !== undefined && value !== null && value !== "") {
      query.set(field, String(value));
    }
  }
  return query;
}

function pathSegment(value: unknown): string {
  return encodeURIComponent(String(value));
}
