import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "intuiface";
const intuifaceApiOrigin = "https://api.intuiface.com";
const intuifaceWebTriggersBaseUrl = `${intuifaceApiOrigin}/webtriggers/v1`;

interface IntuifaceRequestInput {
  method: "GET" | "POST";
  path: string;
  query: Record<string, unknown>;
}

const intuifaceActionHandlers = {
  list_available_experiences(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return requestIntuifaceJson(
      {
        method: "GET",
        path: "/availableExperiences",
        query: buildExperienceFilters(input),
      },
      context,
      "execute",
    );
  },
  send_message(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    return requestIntuifaceJson(
      {
        method: "POST",
        path: "/sendMessage",
        query: {
          message: input.message,
          parameter1: input.parameter1,
          parameter2: input.parameter2,
          parameter3: input.parameter3,
          ...buildExperienceFilters(input),
        },
      },
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, intuifaceActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: intuifaceApiOrigin,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestIntuifaceJson(
      {
        method: "GET",
        path: "/availableExperiences",
        query: {},
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const response = optionalRecord(payload) ?? {};
    return {
      profile: {
        displayName: "Intuiface Web Triggers",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: intuifaceWebTriggersBaseUrl,
        validationEndpoint: "/availableExperiences",
        status: optionalString(response.status),
        experienceCount: typeof response.experienceCount === "number" ? response.experienceCount : undefined,
      },
    };
  },
};

async function requestIntuifaceJson(
  input: IntuifaceRequestInput,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  const url = new URL(`${intuifaceWebTriggersBaseUrl}${input.path}`);
  appendQuery(url, input.query);

  try {
    const response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readIntuifacePayload(response);
    if (!response.ok) {
      throw toIntuifaceError(response, payload, phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "intuiface returned invalid JSON");
    } else {
      return validateIntuifaceResponse(record, input.path);
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    } else if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "intuiface request timed out");
    } else {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `intuiface request failed: ${error.message}` : "intuiface request failed",
      );
    }
  } finally {
    timeout.cleanup();
  }
}

function buildExperienceFilters(input: Record<string, unknown>): Record<string, unknown> {
  return {
    experienceNames: input.experienceNames,
    experienceIDs: input.experienceIDs,
    playerDeviceNames: input.playerDeviceNames,
    playerIDs: input.playerIDs,
    playerTags: input.playerTags,
  };
}

function appendQuery(url: URL, query: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      url.searchParams.set(name, value.join(","));
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(name, String(value));
    }
  }
}

async function readIntuifacePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toIntuifaceError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message =
    readIntuifaceErrorMessage(payload) ??
    (response.statusText || `intuiface request failed with status ${response.status}`);
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  } else if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  } else if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  } else if (response.status === 400) {
    return new ProviderRequestError(400, message);
  } else {
    return new ProviderRequestError(response.status || 500, message);
  }
}

function readIntuifaceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const response = optionalRecord(payload) ?? {};
  return optionalString(response.message) ?? optionalString(response.error);
}

function validateIntuifaceResponse(record: Record<string, unknown>, path: string): Record<string, unknown> {
  const statuses =
    path === "/sendMessage"
      ? new Set(["sent", "noConnectedExperience", "noMatchingExperience"])
      : new Set(["connectedExperiences", "noConnectedExperience", "noMatchingExperience"]);
  if (record.status !== undefined && (typeof record.status !== "string" || !statuses.has(record.status))) {
    throw new ProviderRequestError(502, "intuiface returned an unexpected status");
  }
  if (
    record.experienceCount !== undefined &&
    (typeof record.experienceCount !== "number" ||
      !Number.isInteger(record.experienceCount) ||
      record.experienceCount < 0)
  ) {
    throw new ProviderRequestError(502, "intuiface returned an invalid experienceCount");
  }
  if (record.timestamp !== undefined && typeof record.timestamp !== "string") {
    throw new ProviderRequestError(502, "intuiface returned an invalid timestamp");
  }
  if (record.experiences !== undefined) {
    if (!Array.isArray(record.experiences)) {
      throw new ProviderRequestError(502, "intuiface returned invalid experiences");
    }
    for (const experience of record.experiences) {
      validateExperience(experience);
    }
  }
  return record;
}

function validateExperience(value: unknown): void {
  const experience = optionalRecord(value);
  if (!experience) {
    throw new ProviderRequestError(502, "intuiface returned an invalid experience");
  }
  validateOptionalStringFields(experience, ["id", "name"], "experience");
  if (experience.runningOnPlayer !== undefined) {
    const player = optionalRecord(experience.runningOnPlayer);
    if (!player) {
      throw new ProviderRequestError(502, "intuiface returned an invalid Player");
    }
    validateOptionalStringFields(player, ["playerId", "name", "nickName", "platform", "version"], "Player");
    if (
      player.tags !== undefined &&
      (!Array.isArray(player.tags) || player.tags.some((tag) => typeof tag !== "string"))
    ) {
      throw new ProviderRequestError(502, "intuiface returned invalid Player tags");
    }
  }
}

function validateOptionalStringFields(record: Record<string, unknown>, fields: string[], objectName: string): void {
  for (const field of fields) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw new ProviderRequestError(502, `intuiface returned an invalid ${objectName} ${field}`);
    }
  }
}
