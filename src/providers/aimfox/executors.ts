import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const aimfoxApiBaseUrl = "https://api.aimfox.com/api/v2";
const aimfoxDefaultRequestTimeoutMs = 30_000;
const leadSearchBodyKeys = [
  "keywords",
  "current_companies",
  "past_companies",
  "education",
  "interests",
  "labels",
  "languages",
  "locations",
  "origins",
  "skills",
  "lead_of",
  "optimize",
] as const;

type AimfoxPhase = "validate" | "execute";
type AimfoxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const aimfoxActionHandlers: ProviderActionHandlers<"aimfox", AimfoxActionHandler> = {
  async list_campaigns(input, context) {
    const payload = await requestAimfoxJson({
      path: "/campaigns",
      context,
      phase: "execute",
      query: compactObject({
        outreach_type: optionalString(input.outreach_type),
        accepts_profiles: optionalBoolean(input.accepts_profiles),
      }),
    });

    return {
      status: readNullableStatus(payload),
      campaigns: readObjectArray(payload.campaigns, "campaigns"),
    };
  },

  async get_campaign(input, context) {
    const payload = await requestAimfoxJson({
      path: `/campaigns/${encodePathSegment(requiredString(input.campaign_id, "campaign_id", providerInputError))}`,
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      campaign: readRequiredObject(payload.campaign, "campaign"),
    };
  },

  async get_campaign_metrics(input, context) {
    const payload = await requestAimfoxJson({
      path: `/campaigns/${encodePathSegment(requiredString(input.campaign_id, "campaign_id", providerInputError))}/metrics`,
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      metrics: readRequiredObject(payload.metrics, "metrics"),
    };
  },

  async add_profile_to_campaign(input, context) {
    const payload = await requestAimfoxJson({
      path: `/campaigns/${encodePathSegment(requiredString(input.campaign_id, "campaign_id", providerInputError))}/audience`,
      method: "POST",
      body: {
        profile_url: requiredString(input.profile_url, "profile_url", providerInputError),
      },
      context,
      phase: "execute",
      query: {},
    });

    return { status: readNullableStatus(payload) };
  },

  async remove_profile_from_campaign(input, context) {
    const payload = await requestAimfoxJson({
      path: `/campaigns/${encodePathSegment(requiredString(input.campaign_id, "campaign_id", providerInputError))}/audience/${encodePathSegment(requiredString(input.urn, "urn", providerInputError))}`,
      method: "DELETE",
      context,
      phase: "execute",
      query: {},
    });

    return { status: readNullableStatus(payload) };
  },

  async get_lead(input, context) {
    const payload = await requestAimfoxJson({
      path: `/leads/${encodePathSegment(requiredString(input.lead_id, "lead_id", providerInputError))}`,
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      lead: readRequiredObject(payload.lead, "lead"),
    };
  },

  async search_leads(input, context) {
    const payload = await requestAimfoxJson({
      path: "/leads:search",
      method: "POST",
      body: pickLeadSearchBody(input),
      context,
      phase: "execute",
      query: compactObject({
        start: optionalNumber(input.start),
        count: optionalNumber(input.count),
      }),
    });

    return {
      status: readNullableStatus(payload),
      leads: readObjectArray(payload.leads, "leads"),
    };
  },

  async get_total_leads_count(input, context) {
    const payload = await requestAimfoxJson({
      path: "/leads:search/total",
      method: "POST",
      body: pickLeadSearchBody(input),
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      total_leads: readRequiredNumber(payload.total_leads, "total_leads"),
      sync: readRequiredBoolean(payload.sync, "sync"),
      accounts_sync: optionalRecord(payload.accounts_sync) ?? {},
    };
  },

  async list_recent_leads(_input, context) {
    const payload = await requestAimfoxJson({
      path: "/analytics/recent-leads",
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      leads: readObjectArray(payload.leads, "leads"),
    };
  },

  async list_interactions(input, context) {
    const from = readRequiredNumber(input.from, "from");
    const to = readRequiredNumber(input.to, "to");
    if (from > to) {
      throw new ProviderRequestError(400, "from must be earlier than or equal to to");
    }

    const payload = await requestAimfoxJson({
      path: "/analytics/interactions",
      context,
      phase: "execute",
      query: compactObject({
        bucket: requiredString(input.bucket, "bucket", providerInputError),
        from,
        to,
        account_ids: optionalJsonArray(input.account_ids),
        campaign_id: optionalString(input.campaign_id),
      }),
    });

    return {
      status: readNullableStatus(payload),
      count: readRequiredNumber(payload.count, "count"),
      buckets: readObjectArray(payload.buckets, "buckets"),
    };
  },

  async list_workspace_labels(_input, context) {
    const payload = await requestAimfoxJson({
      path: "/labels",
      context,
      phase: "execute",
      query: {},
    });

    return {
      status: readNullableStatus(payload),
      labels: readObjectArray(payload.labels, "labels"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("aimfox", aimfoxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestAimfoxJson({
      path: "/campaigns",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
      query: {},
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Aimfox API Key",
      },
      metadata: {
        apiBaseUrl: aimfoxApiBaseUrl,
        validationEndpoint: "/campaigns",
      },
    };
  },
};

async function requestAimfoxJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: AimfoxPhase;
  query: Record<string, string | number | boolean | undefined>;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${aimfoxApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: input.method ?? "GET",
    headers,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  const timeout = createProviderTimeout(input.context.signal, aimfoxDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      ...init,
      signal: timeout.signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw mapAimfoxError(response, payload, input.phase);
    }

    return readRequiredObject(payload, "Aimfox response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Aimfox API request timed out");
    }
    throw new ProviderRequestError(
      input.phase === "validate" ? 400 : 502,
      error instanceof Error ? error.message : "Aimfox API request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Aimfox API returned a non-JSON response");
  }
}

function mapAimfoxError(response: Response, payload: unknown, phase: AimfoxPhase): ProviderRequestError {
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(object?.message) ??
    `Aimfox API request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function pickLeadSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of leadSearchBodyKeys) {
    const value = input[key];
    if (value !== undefined) {
      body[key] = value;
    }
  }

  return body;
}

function optionalJsonArray(value: unknown): string | undefined {
  return Array.isArray(value) ? JSON.stringify(value) : undefined;
}

function readNullableStatus(payload: Record<string, unknown>): string | null {
  return optionalString(payload.status) ?? null;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Aimfox response missing ${fieldName}`);
  }

  return value;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Aimfox response missing ${fieldName}`);
  }

  return value;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Aimfox response missing ${fieldName}`);
  }

  return object;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Aimfox response missing ${fieldName}`);
  }

  return value.map((item) => readRequiredObject(item, fieldName));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
