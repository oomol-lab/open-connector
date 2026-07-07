import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { KlaviyoActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "klaviyo";
const klaviyoApiBaseUrl = "https://a.klaviyo.com";
const klaviyoApiRevision = "2026-04-15";
const accountValidationPath = "/api/accounts/";

type KlaviyoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const klaviyoActionHandlers: Record<KlaviyoActionName, KlaviyoActionHandler> = {
  validate_account(_input, context) {
    return executeValidateAccount(context);
  },
  list_profiles(input, context) {
    return executeListProfiles(input, context);
  },
  get_profile(input, context) {
    return executeGetProfile(input, context);
  },
  list_campaigns(input, context) {
    return executeListCampaigns(input, context);
  },
  get_campaign(input, context) {
    return executeGetCampaign(input, context);
  },
  list_events(input, context) {
    return executeListEvents(input, context);
  },
  create_event(input, context) {
    return executeCreateEvent(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, klaviyoActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(klaviyoApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Klaviyo-API-Key ${credential.apiKey}`);
    headers.set("accept", "application/vnd.api+json");
    headers.set("revision", klaviyoApiRevision);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/vnd.api+json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Klaviyo request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Klaviyo request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKlaviyoCredential(input.apiKey, fetcher, signal);
  },
};

async function validateKlaviyoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestKlaviyo(accountValidationPath, {
    apiKey,
    fetcher,
    method: "GET",
    phase: "validate",
    signal,
  });
  const account = readSingleResource(payload);
  const accountId = optionalString(account?.id);

  return {
    profile: {
      accountId: accountId ?? "api_key",
      displayName: accountId ? `Klaviyo ${accountId}` : "Klaviyo Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: klaviyoApiBaseUrl,
      apiRevision: klaviyoApiRevision,
      accountId,
      validationEndpoint: accountValidationPath,
    }),
  };
}

async function executeValidateAccount(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestKlaviyo(accountValidationPath, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    account: readSingleResource(payload),
    raw: payload,
  };
}

async function executeListProfiles(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestKlaviyo("/api/profiles/", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    searchParams: buildPaginationSearchParams(input),
    phase: "execute",
    signal: context.signal,
  });

  return readCollection(payload);
}

async function executeGetProfile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestKlaviyo(`/api/profiles/${encodePath(input.profileId)}/`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    profile: readSingleResource(payload),
    raw: payload,
  };
}

async function executeListCampaigns(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const searchParams = buildPaginationSearchParams(input);
  const channel = readRequiredInputString(input.channel, "channel");
  const channelFilter = `equals(messages.channel,'${channel}')`;
  const filter = optionalString(input.filter);
  searchParams.set("filter", filter ? `${channelFilter},${filter}` : channelFilter);

  const payload = await requestKlaviyo("/api/campaigns/", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    searchParams,
    phase: "execute",
    signal: context.signal,
  });

  return readCollection(payload);
}

async function executeGetCampaign(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestKlaviyo(`/api/campaigns/${encodePath(input.campaignId)}/`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    phase: "execute",
    signal: context.signal,
  });

  return {
    campaign: readSingleResource(payload),
    raw: payload,
  };
}

async function executeListEvents(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestKlaviyo("/api/events/", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    searchParams: buildPaginationSearchParams(input),
    phase: "execute",
    signal: context.signal,
  });

  return readCollection(payload);
}

async function executeCreateEvent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  await requestKlaviyo("/api/events/", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: buildCreateEventPayload(input),
    phase: "execute",
    signal: context.signal,
  });

  return { accepted: true };
}

async function requestKlaviyo(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method: string;
    phase: "validate" | "execute";
    signal?: AbortSignal;
    searchParams?: URLSearchParams;
    body?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const url = new URL(`${klaviyoApiBaseUrl}${path}`);
  if (input.searchParams) {
    for (const [key, value] of input.searchParams) {
      url.searchParams.append(key, value);
    }
  }

  const headers: Record<string, string> = {
    authorization: `Klaviyo-API-Key ${input.apiKey}`,
    accept: "application/vnd.api+json",
    revision: klaviyoApiRevision,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/vnd.api+json";
  }

  const response = await input.fetcher(url, {
    method: input.method,
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  });

  const rawBody = await response.text();
  const payload = parseKlaviyoBody(rawBody, response.status);

  if (!response.ok) {
    throw mapKlaviyoHttpError(response.status, payload, rawBody, input.phase);
  }

  return payload;
}

function buildPaginationSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  appendStringParam(searchParams, "filter", input.filter);
  appendStringParam(searchParams, "sort", input.sort);
  appendStringParam(searchParams, "page[size]", input.pageSize);
  appendStringParam(searchParams, "page[cursor]", input.pageCursor);
  return searchParams;
}

function buildCreateEventPayload(input: Record<string, unknown>): Record<string, unknown> {
  const profileInput = requiredRecord(input.profile, "profile", inputError);
  const profileAttributes = compactObject({
    email: profileInput.email,
    phone_number: profileInput.phoneNumber,
    external_id: profileInput.externalId,
    anonymous_id: profileInput.anonymousId,
  });
  if (!profileInput.id && Object.keys(profileAttributes).length === 0) {
    throw new ProviderRequestError(400, "profile must include id, email, phoneNumber, externalId, or anonymousId");
  }

  return {
    data: {
      type: "event",
      attributes: compactObject({
        properties: optionalRecord(input.properties) ?? {},
        time: input.time,
        value: input.value,
        unique_id: input.uniqueId,
        metric: {
          data: {
            type: "metric",
            attributes: {
              name: input.metricName,
            },
          },
        },
        profile: {
          data: compactObject({
            type: "profile",
            id: profileInput.id,
            attributes: Object.keys(profileAttributes).length > 0 ? profileAttributes : undefined,
          }),
        },
      }),
    },
  };
}

function parseKlaviyoBody(rawBody: string, status: number): Record<string, unknown> {
  if (!rawBody.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return optionalRecord(parsed) ?? {};
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      `Klaviyo request failed with ${status}; invalid JSON response: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
    );
  }
}

function mapKlaviyoHttpError(
  status: number,
  payload: Record<string, unknown>,
  rawBody: string,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readKlaviyoErrorMessage(payload) ?? buildKlaviyoHttpErrorMessage(status, rawBody);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : 500, message);
}

function readKlaviyoErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errors = payload.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const messages = errors
    .map((error) => {
      const item = optionalRecord(error);
      return optionalString(item?.detail) ?? optionalString(item?.title);
    })
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function buildKlaviyoHttpErrorMessage(status: number, rawBody: string): string {
  const bodySnippet = rawBody.trim().slice(0, 200);
  return bodySnippet
    ? `Klaviyo request failed with ${status}; body: ${bodySnippet}`
    : `Klaviyo request failed with ${status}`;
}

function readCollection(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  return {
    data: Array.isArray(data) ? data.map((item) => requiredRecord(item, "data item", responseError)) : [],
    links: optionalRecord(payload.links) ?? null,
    meta: optionalRecord(payload.meta) ?? null,
    raw: payload,
  };
}

function readSingleResource(payload: Record<string, unknown>): Record<string, unknown> | null {
  return optionalRecord(payload.data) ?? null;
}

function appendStringParam(searchParams: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  searchParams.set(name, String(value));
}

function encodePath(value: unknown): string {
  return encodeURIComponent(readRequiredInputString(value, "id"));
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Klaviyo response ${message}`);
}
