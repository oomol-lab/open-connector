import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "momentum_io";
const momentumIoApiBaseUrl = "https://api.momentum.io";
const momentumIoDefaultRequestTimeoutMs = 30_000;
const momentumIoValidationPath = "/v1/users?pageSize=1";

type MomentumIoRequestPhase = "validate" | "execute";
type MomentumIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const momentumIoActionHandlers: ProviderActionHandlers<"momentum_io", MomentumIoActionHandler> = {
  list_users(input, context) {
    return requestMomentumIoJson(buildListUsersPath(input), context, "execute");
  },
  list_meetings(input, context) {
    return requestMomentumIoJson(buildListMeetingsPath(input), context, "execute");
  },
  list_signal_prompts(_input, context) {
    return requestMomentumIoJson("/v1/signals/prompts", context, "execute");
  },
  list_signal_executions(input, context) {
    return requestMomentumIoJson(buildListSignalExecutionsPath(input), context, "execute");
  },
  list_signal_definitions(_input, context) {
    return requestMomentumIoJson("/v2/signals", context, "execute");
  },
  list_signal_v2_executions(input, context) {
    return requestMomentumIoJson(buildListSignalV2ExecutionsPath(input), context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, momentumIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestMomentumIoJson(
      momentumIoValidationPath,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        displayName: "Momentum API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: momentumIoApiBaseUrl,
        validationEndpoint: momentumIoValidationPath,
        validationMode: "user_list_probe",
      },
    };
  },
};

function buildListUsersPath(input: Record<string, unknown>): string {
  return buildPath("/v1/users", {
    pageNumber: optionalInteger(input.pageNumber),
    pageSize: optionalInteger(input.pageSize),
    licenseAdded: optionalBoolean(input.licenseAdded),
    role: optionalString(input.role),
  });
}

function buildListMeetingsPath(input: Record<string, unknown>): string {
  if (input.salesforceAccountId && input.salesforceOpportunityId) {
    throw new ProviderRequestError(400, "salesforceAccountId cannot be used with salesforceOpportunityId");
  }

  return buildPath("/v1/meetings", {
    from: optionalString(input.from),
    to: optionalString(input.to),
    pageNumber: optionalInteger(input.pageNumber),
    pageSize: optionalInteger(input.pageSize),
    salesforceAccountId: optionalString(input.salesforceAccountId),
    salesforceOpportunityId: optionalString(input.salesforceOpportunityId),
    attendeeEmailAddresses: optionalStringArray(input.attendeeEmailAddresses)?.join(","),
    sourceTypes: optionalStringArray(input.sourceTypes)?.join(","),
    includeDownloadUrl: optionalBoolean(input.includeDownloadUrl),
  });
}

function buildListSignalExecutionsPath(input: Record<string, unknown>): string {
  const promptId = readRequiredInteger(input.promptId, "promptId");
  return buildPath(`/v1/signals/${encodeURIComponent(String(promptId))}/executions`, {
    executionFrom: requiredString(input.executionFrom, "executionFrom", providerInputError),
    executionTo: optionalString(input.executionTo),
    pageNumber: optionalInteger(input.pageNumber),
    pageSize: optionalInteger(input.pageSize),
    includeCustomInstructions: optionalBoolean(input.includeCustomInstructions),
  });
}

function buildListSignalV2ExecutionsPath(input: Record<string, unknown>): string {
  const definitionId = readRequiredInteger(input.definitionId, "definitionId");
  return buildPath(`/v2/signals/${encodeURIComponent(String(definitionId))}/executions`, {
    executionFrom: requiredString(input.executionFrom, "executionFrom", providerInputError),
    executionTo: optionalString(input.executionTo),
    pageNumber: optionalInteger(input.pageNumber),
    pageSize: optionalInteger(input.pageSize),
    includeFollowUpPrompts: optionalBoolean(input.includeFollowUpPrompts),
  });
}

function buildPath(path: string, query: Record<string, unknown>): string {
  const url = new URL(path, momentumIoApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function requestMomentumIoJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: MomentumIoRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  const timeout = createProviderTimeout(context.signal, momentumIoDefaultRequestTimeoutMs);

  try {
    response = await context.fetcher(new URL(path, momentumIoApiBaseUrl), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: timeout.signal,
    });
    payload = await readMomentumIoPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Momentum request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Momentum request failed: ${error.message}` : "Momentum request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (response.ok) {
    return payload;
  }

  throw createMomentumIoError(response, payload, phase);
}

async function readMomentumIoPayload(response: Response): Promise<unknown> {
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

function createMomentumIoError(
  response: Response,
  payload: unknown,
  phase: MomentumIoRequestPhase,
): ProviderRequestError {
  const message =
    extractMomentumIoErrorMessage(payload) ??
    response.statusText ??
    `Momentum request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractMomentumIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
