import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "chorus";
const chorusApiBaseUrl = "https://chorus.ai";
const chorusValidationPath = "/api/v1/users/me";

type ChorusPhase = "validate" | "execute";
type ChorusAcceptHeader = "application/json" | "application/vnd.api+json";
type ChorusContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ChorusActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const chorusActionHandlers: ProviderActionHandlers<"chorus", ChorusActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: chorusValidationPath,
      accept: "application/vnd.api+json",
      phase: "execute",
      context,
    });

    return {
      user: requireJsonApiResource(payload, "Chorus current user response"),
    };
  },

  async list_teams(_input, context) {
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: "/api/v1/teams",
      accept: "application/vnd.api+json",
      phase: "execute",
      context,
    });

    return {
      teams: requireJsonApiResourceArray(payload, "Chorus teams response"),
    };
  },

  async get_team(input, context) {
    const teamId = readRequiredString(input, "id");
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: `/api/v1/teams/${encodeURIComponent(teamId)}`,
      accept: "application/vnd.api+json",
      phase: "execute",
      context,
    });

    return {
      team: requireJsonApiResource(payload, "Chorus team response"),
    };
  },

  async list_engagements(input, context) {
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: "/v3/engagements",
      query: buildListEngagementsQuery(input),
      accept: "application/json",
      phase: "execute",
      context,
    });
    const body = requireProviderObject(payload, "Chorus engagements response");

    return {
      engagements: readObjectArray(body.engagements, "Chorus engagements"),
      continuationKey: optionalString(body.continuation_key) ?? null,
    };
  },

  async get_conversation(input, context) {
    const conversationId = readRequiredString(input, "id");
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
      query: buildGetConversationQuery(input),
      accept: "application/vnd.api+json",
      phase: "execute",
      context,
    });

    return {
      conversation: requireJsonApiResource(payload, "Chorus conversation response"),
    };
  },

  async list_scorecards(input, context) {
    const payload = await requestChorusJson({
      apiKey: context.apiKey,
      path: "/api/v1/scorecards",
      query: buildListScorecardsQuery(input),
      accept: "application/vnd.api+json",
      phase: "execute",
      context,
    });

    return {
      scorecards: requireJsonApiResourceArray(payload, "Chorus scorecards response"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chorusActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestChorusJson({
      apiKey: input.apiKey,
      path: chorusValidationPath,
      accept: "application/vnd.api+json",
      phase: "validate",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    });
    const user = requireJsonApiResource(payload, "Chorus current user response");
    const userId = readResourceId(user, "Chorus current user");
    const attributes = optionalRecord(user.attributes) ?? {};
    const email = optionalString(attributes.email);
    const name = optionalString(attributes.name);

    return {
      profile: {
        accountId: `chorus:user:${userId}`,
        displayName: buildChorusAccountLabel({ name, email, id: userId }),
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: chorusApiBaseUrl,
        validationEndpoint: chorusValidationPath,
        userId,
        email: email ?? null,
        name: name ?? null,
      },
    };
  },
};

async function requestChorusJson(input: {
  apiKey: string;
  path: string;
  accept: ChorusAcceptHeader;
  phase: ChorusPhase;
  context: ChorusContext;
  query?: URLSearchParams;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "Chorus" }, async (signal) => {
    const response = await input.context.fetcher(buildChorusUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: input.accept,
        authorization: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readChorusPayload(response);

    if (!response.ok) {
      throw createChorusError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildChorusUrl(path: string, query?: URLSearchParams): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, `${chorusApiBaseUrl}/`);
  if (query) {
    url.search = query.toString();
  }
  return url;
}

function buildListEngagementsQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  return buildQueryParams(input, [
    ["compliance", "compliance", formatScalarQueryParam],
    ["continuationKey", "continuation_key", formatScalarQueryParam],
    ["dispositionConnected", "disposition_connected", formatScalarQueryParam],
    ["dispositionGatekeeper", "disposition_gatekeeper", formatScalarQueryParam],
    ["dispositionTree", "disposition_tree", formatScalarQueryParam],
    ["dispositionVoicemail", "disposition_voicemail", formatScalarQueryParam],
    ["engagementIds", "engagement_id", formatCommaSeparatedArray],
    ["engagementType", "engagement_type", formatScalarQueryParam],
    ["contentType", "content_type", formatScalarQueryParam],
    ["maxDate", "max_date", formatScalarQueryParam],
    ["maxDuration", "max_duration", formatScalarQueryParam],
    ["minDate", "min_date", formatScalarQueryParam],
    ["minDuration", "min_duration", formatScalarQueryParam],
    ["participantsEmail", "participants_email", formatScalarQueryParam],
    ["teamIds", "team_id", formatCommaSeparatedArray],
    ["userIds", "user_id", formatCommaSeparatedArray],
    ["withTrackers", "with_trackers", formatScalarQueryParam],
  ]);
}

function buildGetConversationQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  return buildQueryParams(input, [
    ["fields", "fields", formatCommaSeparatedArray],
    ["forceRegeneration", "force_regeneration", formatScalarQueryParam],
    ["skipSummaryGeneration", "skip_summary_generation", formatScalarQueryParam],
    ["includeMeetingMetadata", "include_meeting_metadata", formatScalarQueryParam],
  ]);
}

function buildListScorecardsQuery(input: Record<string, unknown>): URLSearchParams | undefined {
  return buildQueryParams(input, [
    ["recipientIds", "filter[recipients]", formatCommaSeparatedArray],
    ["reviewerIds", "filter[reviewers]", formatCommaSeparatedArray],
    ["initiativeId", "filter[initiative]", formatScalarQueryParam],
    ["submittedRange", "filter[submitted]", formatScalarQueryParam],
    ["pageSize", "page[size]", formatScalarQueryParam],
    ["pageNumber", "page[number]", formatScalarQueryParam],
  ]);
}

function buildQueryParams(
  input: Record<string, unknown>,
  mappings: readonly (readonly [
    inputKey: string,
    queryKey: string,
    formatter: (value: unknown) => string | undefined,
  ])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();
  let hasValues = false;

  for (const [inputKey, queryKey, formatter] of mappings) {
    const formatted = formatter(input[inputKey]);
    if (formatted) {
      query.set(queryKey, formatted);
      hasValues = true;
    }
  }

  return hasValues ? query : undefined;
}

function formatScalarQueryParam(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function formatCommaSeparatedArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((item) => String(item)).join(",");
}

async function readChorusPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Chorus JSON response");
  }
}

function createChorusError(status: number, payload: unknown, phase: ChorusPhase): ProviderRequestError {
  const message = extractChorusErrorMessage(payload) ?? `Chorus request failed with status ${status}`;

  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractChorusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.error) ??
    optionalString(firstError?.detail) ??
    optionalString(firstError?.title)
  );
}

function requireJsonApiResource(payload: unknown, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  return requireProviderObject(body.data, `${label} data`);
}

function requireJsonApiResourceArray(payload: unknown, label: string): Array<Record<string, unknown>> {
  const body = requireProviderObject(payload, label);
  return readObjectArray(body.data, `${label} data`);
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return record;
}

function readObjectArray(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }

  return payload.map((item) => requireProviderObject(item, `${label} item`));
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function readResourceId(input: Record<string, unknown>, label: string): string {
  return requiredString(input.id, `${label} id`, (message) => new ProviderRequestError(502, message));
}

function buildChorusAccountLabel(input: { name?: string; email?: string; id: string }): string {
  if (input.name && input.email) {
    return `${input.name} (${input.email})`;
  }
  return input.name ?? input.email ?? `Chorus user ${input.id}`;
}
