import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LemlistActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "lemlist";
const lemlistApiBaseUrl = "https://api.lemlist.com/api";
const lemlistValidationPath = "/team";
const lemlistDefaultRequestTimeoutMs = 30_000;
const lemlistFetch = createProviderFetch({ skipDnsValidation: true });

type LemlistRequestPhase = "validate" | "execute";
type LemlistActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lemlistActionHandlers: Record<LemlistActionName, LemlistActionHandler> = {
  async get_team(_input, context) {
    const payload = await requestLemlistJson({
      context,
      path: lemlistValidationPath,
      phase: "execute",
    });

    return {
      team: normalizeTeam(payload),
    };
  },
  async list_campaigns(input, context) {
    const payload = await requestLemlistJson({
      context,
      path: "/campaigns",
      phase: "execute",
      query: compactObject({
        version: "v2",
        limit: input.limit,
        offset: input.offset,
        page: input.page,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        status: input.status,
        createdBy: input.createdBy,
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "lemlist campaign list must be an array", payload);
    }

    return {
      campaigns: payload.map((campaign) => normalizeCampaign(campaign)),
    };
  },
  async get_campaign(input, context) {
    const campaignId = readRequiredString(input.campaignId, "campaignId");
    const payload = await requestLemlistJson({
      context,
      path: `/campaigns/${encodeURIComponent(campaignId)}`,
      phase: "execute",
    });

    return {
      campaign: normalizeCampaign(payload),
    };
  },
  async list_campaign_leads(input, context) {
    const campaignId = readRequiredString(input.campaignId, "campaignId");
    const payload = await requestLemlistJson({
      context,
      path: `/campaigns/${encodeURIComponent(campaignId)}/leads/`,
      phase: "execute",
      query: compactObject({
        state: input.state,
        limit: input.limit,
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "lemlist lead list must be an array", payload);
    }

    return {
      leads: payload.map((lead) => normalizeLead(lead)),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lemlistActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(lemlistApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildBasicAuthHeader(credential.apiKey));
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await lemlistFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `lemlist request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "lemlist request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestLemlistJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: lemlistValidationPath,
      phase: "validate",
    });
    const team = normalizeTeam(payload);

    return {
      profile: {
        accountId: optionalString(team._id),
        displayName: optionalString(team.name) ?? optionalString(team._id) ?? "lemlist API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: lemlistApiBaseUrl,
        validationEndpoint: lemlistValidationPath,
        teamId: team._id,
        teamName: team.name,
      }),
    } satisfies CredentialValidationResult;
  },
};

async function requestLemlistJson(input: {
  path: string;
  context: ApiKeyProviderContext;
  phase: LemlistRequestPhase;
  query?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${lemlistApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(input.context.signal, lemlistDefaultRequestTimeoutMs);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthHeader(input.context.apiKey),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readLemlistPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "lemlist request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `lemlist request failed: ${error.message}` : "lemlist request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw mapLemlistError(response.status, extractLemlistErrorMessage(payload), input.phase);
  }

  return payload;
}

function buildBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}`;
}

async function readLemlistPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapLemlistError(
  status: number,
  message: string | undefined,
  phase: LemlistRequestPhase,
): ProviderRequestError {
  const normalizedMessage = message ?? `lemlist request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, normalizedMessage);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, normalizedMessage);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, normalizedMessage);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, normalizedMessage);
}

function extractLemlistErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.reason);
}

function normalizeTeam(value: unknown): Record<string, unknown> {
  const team = readObject(value, "lemlist team response must be a JSON object");
  return compactObject({
    _id: optionalString(team._id),
    name: optionalString(team.name),
    userIds: readStringArray(team.userIds),
    createdBy: optionalString(team.createdBy),
    createdAt: optionalString(team.createdAt),
    beta: readStringArray(team.beta),
    pictureId: optionalString(team.pictureId),
    customDomain: optionalString(team.customDomain),
    raw: team,
  });
}

function normalizeCampaign(value: unknown): Record<string, unknown> {
  const campaign = readObject(value, "lemlist campaign response must be a JSON object");
  return compactObject({
    _id: optionalString(campaign._id),
    name: optionalString(campaign.name),
    labels: readStringArray(campaign.labels),
    createdAt: optionalString(campaign.createdAt),
    createdBy: optionalString(campaign.createdBy),
    status: optionalString(campaign.status),
    sequenceId: optionalString(campaign.sequenceId),
    scheduleIds: readStringArray(campaign.scheduleIds),
    teamId: optionalString(campaign.teamId),
    hasError: typeof campaign.hasError === "boolean" ? campaign.hasError : undefined,
    errors: readStringArray(campaign.errors),
    creator: optionalRecord(campaign.creator),
    senders: readObjectArray(campaign.senders),
    raw: campaign,
  });
}

function normalizeLead(value: unknown): Record<string, unknown> {
  const lead = readObject(value, "lemlist lead response must be a JSON object");
  return compactObject({
    _id: optionalString(lead._id),
    contactId: optionalString(lead.contactId),
    state: optionalString(lead.state),
    raw: lead,
  });
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.map((item) => optionalRecord(item)).filter((item) => item != null) : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}
