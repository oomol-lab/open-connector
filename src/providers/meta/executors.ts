import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { MetaActionName } from "./actions.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const metaGraphApiVersion: string = "v25.0";
export const metaGraphApiBaseUrl: string = `https://graph.facebook.com/${metaGraphApiVersion}`;

const service = "meta";
const metaValidationPath = "/me";
const metaMeFields = "id,name";
const metaDefaultTimeoutMs = 30_000;
const defaultAdAccountFields = "id,account_id,name,currency,timezone_name,account_status,business_name";
const defaultCampaignFields = "id,name,status,effective_status,objective,buying_type,created_time,updated_time";
const defaultInsightFields =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,date_start,date_stop";

type MetaRequestPhase = "validate" | "execute";
type MetaActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MetaActionHandler = (input: Record<string, unknown>, context: MetaActionContext) => Promise<unknown>;

interface MetaListPayload {
  data?: unknown;
  paging?: unknown;
}

export const metaActionHandlers: Record<MetaActionName, MetaActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_ad_accounts(input, context) {
    return listAdAccounts(input, context);
  },
  list_campaigns(input, context) {
    return listCampaigns(input, context);
  },
  get_insights(input, context) {
    return getInsights(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, metaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: metaGraphApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profile = await requestMetaJson<Record<string, unknown>>({
      apiKey: input.apiKey,
      path: metaValidationPath,
      query: {
        fields: metaMeFields,
      },
      fetcher,
      signal,
      phase: "validate",
    });
    const profileId = optionalString(profile.id) ?? "me";
    const profileName = optionalString(profile.name);

    return {
      profile: {
        accountId: profileId,
        displayName: profileName ?? "Meta Access Token",
      },
      grantedScopes: [],
      metadata: {
        graphApiVersion: metaGraphApiVersion,
        validationEndpoint: metaValidationPath,
        profileId,
        profileName,
      },
    };
  },
};

async function getCurrentUser(context: MetaActionContext): Promise<Record<string, unknown>> {
  const payload = await requestMetaJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/me",
    query: {
      fields: metaMeFields,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: normalizeMetaUser(payload),
  };
}

async function listAdAccounts(
  input: Record<string, unknown>,
  context: MetaActionContext,
): Promise<Record<string, unknown>> {
  const payload = await requestMetaJson<MetaListPayload>({
    apiKey: context.apiKey,
    path: "/me/adaccounts",
    query: compactDefinedQuery({
      fields: normalizeFields(input.fields, defaultAdAccountFields),
      limit: optionalInteger(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    adAccounts: extractDataArray(payload).map(normalizeAdAccount),
    paging: normalizePaging(payload.paging),
  };
}

async function listCampaigns(
  input: Record<string, unknown>,
  context: MetaActionContext,
): Promise<Record<string, unknown>> {
  const adAccountId = normalizeAdAccountId(readInputString(input.adAccountId, "adAccountId"));
  const payload = await requestMetaJson<MetaListPayload>({
    apiKey: context.apiKey,
    path: `/${adAccountId}/campaigns`,
    query: compactDefinedQuery({
      fields: normalizeFields(input.fields, defaultCampaignFields),
      limit: optionalInteger(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
      effective_status: normalizeJsonArray(input.effectiveStatus),
      configured_status: normalizeJsonArray(input.configuredStatus),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    campaigns: extractDataArray(payload).map(normalizeCampaign),
    paging: normalizePaging(payload.paging),
  };
}

async function getInsights(
  input: Record<string, unknown>,
  context: MetaActionContext,
): Promise<Record<string, unknown>> {
  const objectId = readInputString(input.objectId, "objectId");
  const payload = await requestMetaJson<MetaListPayload>({
    apiKey: context.apiKey,
    path: `/${encodeURIComponent(objectId)}/insights`,
    query: compactDefinedQuery({
      level: optionalString(input.level),
      fields: normalizeFields(input.fields, defaultInsightFields),
      date_preset: optionalString(input.datePreset),
      time_range: normalizeJsonObject(input.timeRange),
      breakdowns: normalizeStringList(input.breakdowns),
      filtering: normalizeJsonArray(input.filtering),
      sort: normalizeStringList(input.sort),
      action_attribution_windows: normalizeStringList(input.actionAttributionWindows),
      limit: optionalInteger(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    insights: extractDataArray(payload).map(normalizeInsight),
    paging: normalizePaging(payload.paging),
  };
}

async function requestMetaJson<T>(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  fetcher: ProviderFetch;
  phase: MetaRequestPhase;
  signal?: AbortSignal;
}): Promise<T> {
  const timeout = createProviderTimeout(input.signal, metaDefaultTimeoutMs);
  try {
    const response = await input.fetcher(buildMetaUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readMetaPayload(response);

    if (!response.ok) {
      throw createMetaError(response.status, payload, input.phase);
    }

    if (payload === undefined) {
      throw new ProviderRequestError(502, "Meta returned an empty response");
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Meta request timed out");
    }

    const message = error instanceof Error ? `Meta request failed: ${error.message}` : "Meta request failed";
    throw new ProviderRequestError(502, message);
  } finally {
    timeout.cleanup();
  }
}

function buildMetaUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${metaGraphApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readMetaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Meta returned invalid JSON");
  }
}

function createMetaError(status: number, payload: unknown, _phase: MetaRequestPhase): ProviderRequestError {
  const message = extractMetaErrorMessage(payload) ?? `Meta request failed with status ${status}`;
  if (status === 401 || status === 403 || isMetaInvalidTokenError(payload)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429 || isMetaRateLimitError(payload)) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractMetaErrorMessage(payload: unknown): string | undefined {
  const error = optionalRecord(optionalRecord(payload)?.error);
  return optionalString(error?.message);
}

function isMetaInvalidTokenError(payload: unknown): boolean {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const code = optionalInteger(error?.code);
  return code === 190;
}

function isMetaRateLimitError(payload: unknown): boolean {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const code = optionalInteger(error?.code);
  return code === 4 || code === 17 || code === 32 || code === 613;
}

function normalizeFields(value: unknown, defaultValue: string): string {
  if (Array.isArray(value)) {
    const fields = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    return fields.length > 0 ? fields.join(",") : defaultValue;
  }

  return optionalString(value) ?? defaultValue;
}

function normalizeStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length > 0 ? items.join(",") : undefined;
}

function normalizeJsonArray(value: unknown): string | undefined {
  return Array.isArray(value) ? JSON.stringify(value) : undefined;
}

function normalizeJsonObject(value: unknown): string | undefined {
  return optionalRecord(value) ? JSON.stringify(value) : undefined;
}

function normalizeAdAccountId(value: string): string {
  return value.startsWith("act_") ? encodeURIComponent(value) : `act_${encodeURIComponent(value)}`;
}

function extractDataArray(payload: MetaListPayload): Array<Record<string, unknown>> {
  return Array.isArray(payload.data) ? payload.data.map(requireRecordPayload) : [];
}

function normalizePaging(value: unknown): Record<string, unknown> {
  const paging = optionalRecord(value);
  const cursors = optionalRecord(paging?.cursors);
  return {
    cursors: {
      before: optionalString(cursors?.before) ?? null,
      after: optionalString(cursors?.after) ?? null,
    },
    next: optionalString(paging?.next) ?? null,
    previous: optionalString(paging?.previous) ?? null,
  };
}

function normalizeMetaUser(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredPayloadString(payload, "id", "Meta user"),
    name: optionalString(payload.name) ?? null,
    raw: payload,
  };
}

function normalizeAdAccount(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredPayloadString(payload, "id", "Meta ad account"),
    accountId: optionalString(payload.account_id) ?? null,
    name: optionalString(payload.name) ?? null,
    currency: optionalString(payload.currency) ?? null,
    timezoneName: optionalString(payload.timezone_name) ?? null,
    accountStatus: optionalInteger(payload.account_status) ?? null,
    businessName: optionalString(payload.business_name) ?? null,
    raw: payload,
  };
}

function normalizeCampaign(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredPayloadString(payload, "id", "Meta campaign"),
    name: optionalString(payload.name) ?? null,
    status: optionalString(payload.status) ?? null,
    effectiveStatus: optionalString(payload.effective_status) ?? null,
    objective: optionalString(payload.objective) ?? null,
    buyingType: optionalString(payload.buying_type) ?? null,
    createdTime: optionalString(payload.created_time) ?? null,
    updatedTime: optionalString(payload.updated_time) ?? null,
    raw: payload,
  };
}

function normalizeInsight(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    campaignId: optionalString(payload.campaign_id) ?? null,
    campaignName: optionalString(payload.campaign_name) ?? null,
    adsetId: optionalString(payload.adset_id) ?? null,
    adsetName: optionalString(payload.adset_name) ?? null,
    adId: optionalString(payload.ad_id) ?? null,
    adName: optionalString(payload.ad_name) ?? null,
    impressions: optionalString(payload.impressions) ?? null,
    clicks: optionalString(payload.clicks) ?? null,
    spend: optionalString(payload.spend) ?? null,
    dateStart: optionalString(payload.date_start) ?? null,
    dateStop: optionalString(payload.date_stop) ?? null,
    raw: payload,
  };
}

function requireRecordPayload(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Meta returned a non-object list item");
  }
  return record;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredPayloadString(payload: Record<string, unknown>, fieldName: string, label: string): string {
  const value = optionalString(payload[fieldName]);
  if (!value) {
    throw new ProviderRequestError(502, `${label} ${fieldName} is missing`);
  }
  return value;
}

function compactDefinedQuery(
  input: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const output: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}
