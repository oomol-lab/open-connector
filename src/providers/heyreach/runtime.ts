import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const heyreachApiBaseUrl = "https://api.heyreach.io/api/public";

type HeyreachPhase = "validate" | "execute";

interface HeyreachRequestInput {
  path: string;
  method: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: HeyreachPhase;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const heyreachActionHandlers: ProviderActionHandlers<
  "heyreach",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_campaigns(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/campaign/GetAll",
      method: "POST",
      body: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
        keyword: optionalString(input.keyword),
        statuses: readOptionalArray(input.statuses),
        accountIds: readOptionalArray(input.accountIds),
      }),
      context,
      phase: "execute",
    });
    return normalizePagedResponse(payload, "campaigns");
  },
  async get_campaign(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/campaign/GetById",
      method: "GET",
      query: { campaignId: String(readRequiredInteger(input, "campaignId")) },
      context,
      phase: "execute",
    });
    return {
      campaign: requiredRecord(payload, "HeyReach returned an invalid campaign response", providerResponseError),
    };
  },
  async list_lists(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/list/GetAll",
      method: "POST",
      body: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
      context,
      phase: "execute",
    });
    return normalizePagedResponse(payload, "lists");
  },
  async create_empty_list(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/list/CreateEmptyList",
      method: "POST",
      body: compactObject({
        name: optionalString(input.name),
        type: optionalString(input.type),
      }),
      context,
      phase: "execute",
    });
    return {
      list: requiredRecord(payload, "HeyReach returned an invalid create list response", providerResponseError),
    };
  },
  async list_leads(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/list/GetLeadsFromList",
      method: "POST",
      body: compactObject({
        listId: readRequiredInteger(input, "listId"),
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
        keyword: optionalString(input.keyword),
        createdFrom: optionalString(input.createdFrom),
        createdTo: optionalString(input.createdTo),
        leadLinkedInId: optionalString(input.leadLinkedInId),
        leadProfileUrl: optionalString(input.leadProfileUrl),
      }),
      context,
      phase: "execute",
    });
    return normalizePagedResponse(payload, "leads");
  },
  async get_lead(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/lead/GetLead",
      method: "POST",
      body: { profileUrl: readRequiredString(input, "profileUrl") },
      context,
      phase: "execute",
    });
    return {
      lead: requiredRecord(
        readResponseData(payload),
        "HeyReach returned an invalid lead response",
        providerResponseError,
      ),
    };
  },
  async get_lead_tags(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/lead/GetTags",
      method: "POST",
      body: { profileUrl: readRequiredString(input, "profileUrl") },
      context,
      phase: "execute",
    });
    const payloadRecord = requiredRecord(
      payload,
      "HeyReach returned an invalid lead tags response",
      providerResponseError,
    );
    const data = readResponseData(payloadRecord);
    const tags = Array.isArray(data)
      ? data.filter((tag): tag is string => typeof tag === "string")
      : Array.isArray(payloadRecord.tags)
        ? payloadRecord.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
    return {
      tags,
      raw: payloadRecord,
    };
  },
  async list_linkedin_accounts(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/li_account/GetAll",
      method: "POST",
      body: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
      context,
      phase: "execute",
    });
    return normalizePagedResponse(payload, "accounts");
  },
  async get_overall_stats(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/stats/GetOverallStats",
      method: "POST",
      body: normalizeStatsInput(input),
      context,
      phase: "execute",
    });
    return {
      stats: requiredRecord(payload, "HeyReach returned an invalid stats response", providerResponseError),
    };
  },
  async get_overall_stats_by_campaign(input, context): Promise<unknown> {
    const payload = await requestHeyreachJson({
      path: "/stats/GetOverallStatsByCampaign",
      method: "POST",
      body: normalizeStatsInput(input),
      context,
      phase: "execute",
    });
    return {
      stats: requiredRecord(payload, "HeyReach returned an invalid campaign stats response", providerResponseError),
    };
  },
};

export async function validateHeyreachCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestHeyreachJson({
    path: "/auth/CheckApiKey",
    method: "GET",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });

  return {
    profile: {
      accountId: "heyreach_api_key",
      displayName: "HeyReach API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: heyreachApiBaseUrl,
      validationEndpoint: "/auth/CheckApiKey",
    },
  };
}

async function requestHeyreachJson(input: HeyreachRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildHeyreachUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readHeyreachPayload(response);
    if (!response.ok) {
      throw createHeyreachError(response.status, payload, input.phase);
    }
    return payload ?? {};
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "HeyReach request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HeyReach request failed: ${error.message}` : "HeyReach request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildHeyreachUrl(path: string, query: Record<string, string | undefined> = {}): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${heyreachApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readHeyreachPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(response.status === 429 ? 429 : 502, "HeyReach returned invalid JSON");
  }
}

function createHeyreachError(status: number, payload: unknown, phase: HeyreachPhase): ProviderRequestError {
  const message = readHeyreachErrorMessage(payload) ?? `HeyReach request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : 500, message, payload);
}

function readHeyreachErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const directMessage =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title) ??
    optionalString(record.detail);
  if (directMessage) return directMessage;
  const errors = record.errors;
  return Array.isArray(errors) ? errors.find((error): error is string => typeof error === "string") : undefined;
}

function normalizePagedResponse(payload: unknown, key: string): Record<string, unknown> {
  const payloadRecord = requiredRecord(
    payload,
    "HeyReach returned an invalid paginated response",
    providerResponseError,
  );
  const dataRecord = optionalRecord(payloadRecord.data);
  const source = dataRecord ?? payloadRecord;
  const items = Array.isArray(source.items)
    ? source.items.filter((item): item is Record<string, unknown> => optionalRecord(item) !== undefined)
    : [];
  return {
    totalCount: optionalInteger(source.totalCount) ?? null,
    [key]: items,
    raw: payloadRecord,
  };
}

function normalizeStatsInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    accountIds: Array.isArray(input.accountIds) ? input.accountIds : [],
    campaignIds: Array.isArray(input.campaignIds) ? input.campaignIds : [],
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
  });
}

function readResponseData(payload: unknown): unknown {
  const payloadRecord = optionalRecord(payload);
  return payloadRecord && "data" in payloadRecord ? payloadRecord.data : payload;
}

function readRequiredString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readRequiredInteger(input: Record<string, unknown>, fieldName: string): number {
  const value = optionalInteger(input[fieldName]);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
