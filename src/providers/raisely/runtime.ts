import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, optionalStringArray, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const raiselyApiBaseUrl = "https://api.raisely.com/v3";

const raiselyRequestTimeoutMs = 30_000;

type RaiselyRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type RaiselyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const raiselyActionHandlers: ProviderActionHandlers<"raisely", RaiselyActionHandler> = {
  async list_campaigns(input, context) {
    return normalizeCollection(
      await requestRaiselyJson({
        context,
        method: "GET",
        path: "/campaigns",
        query: buildQuery(input, {
          private: "private",
          query: "q",
          limit: "limit",
          offset: "offset",
          sort: "sort",
          order: "order",
          path: "path",
          mode: "mode",
          status: "status",
          pruneConfig: "pruneConfig",
          includeTags: "includeTags",
        }),
      }),
      "campaigns",
    );
  },

  async get_campaign(input, context) {
    const campaign = requiredString(input.campaign, "campaign", (message) => new ProviderRequestError(400, message));
    return normalizeSingle(
      await requestRaiselyJson({
        context,
        method: "GET",
        path: `/campaigns/${encodeURIComponent(campaign)}`,
        query: buildQuery(input, {
          private: "private",
          pruneConfig: "pruneConfig",
          includeTags: "includeTags",
        }),
        notFoundAsInvalidInput: true,
      }),
      "campaign",
    );
  },

  async list_profiles(input, context) {
    return normalizeCollection(
      await requestRaiselyJson({
        context,
        method: "GET",
        path: "/profiles",
        query: buildQuery(input, {
          campaign: "campaign",
          private: "private",
          query: "q",
          limit: "limit",
          offset: "offset",
          sort: "sort",
          order: "order",
          rank: "rank",
          rankDonors: "rankDonors",
          rankActivityTotal: "rankActivityTotal",
          rankActivityTime: "rankActivityTime",
        }),
      }),
      "profiles",
    );
  },

  async get_profile(input, context) {
    const profilePath = requiredString(
      input.profilePath,
      "profilePath",
      (message) => new ProviderRequestError(400, message),
    );
    return normalizeSingle(
      await requestRaiselyJson({
        context,
        method: "GET",
        path: `/profiles/${encodeURIComponent(profilePath)}`,
        query: buildQuery(input, { campaign: "campaign", private: "private" }),
        notFoundAsInvalidInput: true,
      }),
      "profile",
    );
  },

  async list_webhooks(input, context) {
    return normalizeCollection(
      await requestRaiselyJson({
        context,
        method: "GET",
        path: "/webhooks",
        query: buildQuery(input, {
          campaign: "campaign",
          private: "private",
          query: "q",
          limit: "limit",
          offset: "offset",
          sort: "sort",
          order: "order",
        }),
      }),
      "webhooks",
    );
  },

  async create_webhook(input, context) {
    return normalizeSingle(
      await requestRaiselyJson({
        context,
        method: "POST",
        path: "/webhooks",
        body: { data: buildWebhookData(input, true) },
      }),
      "webhook",
    );
  },

  async update_webhook(input, context) {
    const webhookId = requiredString(input.webhookId, "webhookId", (message) => new ProviderRequestError(400, message));
    assertWebhookUpdateData(input);
    return normalizeSingle(
      await requestRaiselyJson({
        context,
        method: "PATCH",
        path: `/webhooks/${encodeURIComponent(webhookId)}`,
        query: buildQuery(input, { private: "private" }),
        body: { data: buildWebhookData(input, false) },
        notFoundAsInvalidInput: true,
      }),
      "webhook",
    );
  },

  async delete_webhook(input, context) {
    const webhookId = requiredString(input.webhookId, "webhookId", (message) => new ProviderRequestError(400, message));
    return normalizeSingle(
      await requestRaiselyJson({
        context,
        method: "DELETE",
        path: `/webhooks/${encodeURIComponent(webhookId)}`,
        notFoundAsInvalidInput: true,
      }),
      "webhook",
    );
  },
};

export async function validateRaiselyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { response, payload } = await fetchRaiselyJson(fetcher, `${raiselyApiBaseUrl}/authenticate`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal,
  });
  if (!response.ok) {
    throw createRaiselyError(response.status, payload, "validate");
  }

  const data = optionalRecord(payload.data);
  const userUuid = optionalString(data?.uuid);
  if (!data || !userUuid) {
    throw new ProviderRequestError(502, "Raisely authenticate response is missing data.uuid");
  }

  const fullName = optionalString(data.fullName);
  const email = optionalString(data.email);
  const preferredName = optionalString(data.preferredName);
  const organisationUuid = optionalString(data.organisationUuid);
  const campaigns = optionalStringArray(payload.campaigns);
  const roles = optionalStringArray(payload.roles);
  const permission = optionalString(payload.permission);

  return {
    profile: {
      accountId: userUuid,
      displayName: fullName ?? email ?? preferredName ?? "Raisely API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/authenticate",
      userUuid,
      organisationUuid,
      campaigns,
      roles,
      permission,
    },
  };
}

async function requestRaiselyJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method: RaiselyRequestMethod;
  path: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${raiselyApiBaseUrl}${input.path}`);
  if (input.query) {
    url.search = input.query.toString();
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  const { response, payload } = await fetchRaiselyJson(input.context.fetcher, url, {
    method: input.method,
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.context.signal,
  });
  if (!response.ok) {
    throw createRaiselyError(response.status, payload, "execute", input.notFoundAsInvalidInput);
  }
  return payload;
}

interface RaiselyJsonResponse {
  response: Response;
  payload: Record<string, unknown>;
}

async function fetchRaiselyJson(
  fetcher: typeof fetch,
  url: string | URL,
  init: RequestInit,
): Promise<RaiselyJsonResponse> {
  init.signal?.throwIfAborted();
  const timeout = createProviderTimeout(init.signal ?? undefined, raiselyRequestTimeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: timeout.signal });
    return {
      response,
      payload: await readJsonResponse(response, !response.ok),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Raisely request failed: request timed out");
    }
    if (isAbortSignalError(init.signal ?? undefined, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Raisely request failed: ${error.message}`
        : "Raisely request failed: unknown network error",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonResponse(response: Response, tolerateTextError = false): Promise<Record<string, unknown>> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Raisely returned invalid JSON",
    invalidJsonFallback: tolerateTextError ? (text) => ({ message: text }) : undefined,
    trimEmptyBody: false,
  });
  return optionalRecord(payload) ?? {};
}

function createRaiselyError(
  status: number,
  payload: Record<string, unknown>,
  phase: "validate" | "execute",
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Raisely API request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || (status === 404 && notFoundAsInvalidInput) || status === 409 || status === 412) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function buildWebhookData(input: Record<string, unknown>, includeCampaignUuid: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const fields = includeCampaignUuid ? ["campaignUuid", "events", "secret", "url"] : ["events", "secret", "url"];
  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field];
    }
  }
  return data;
}

function assertWebhookUpdateData(input: Record<string, unknown>): void {
  if (input.events === undefined && input.secret === undefined && input.url === undefined) {
    throw new ProviderRequestError(400, "At least one of events, secret, or url is required");
  }
}

function buildQuery(input: Record<string, unknown>, mapping: Record<string, string>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [inputKey, queryKey] of Object.entries(mapping)) {
    const value = input[inputKey];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query.set(queryKey, String(value));
    }
  }
  return query;
}

function normalizeCollection(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const data = payload.data;
  const pagination = optionalRecord(payload.pagination);
  if (!Array.isArray(data) || !pagination) {
    throw new ProviderRequestError(502, `Raisely ${key} response is missing data or pagination`);
  }
  return { [key]: data, pagination };
}

function normalizeSingle(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, `Raisely ${key} response is missing data`);
  }
  return { [key]: data };
}

function readErrorMessage(payload: Record<string, unknown>): string | undefined {
  return (
    optionalString(payload.detail) ??
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    optionalString(optionalRecord(payload.error)?.message)
  );
}
