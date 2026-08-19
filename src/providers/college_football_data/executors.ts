import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "college_football_data";
const collegeFootballDataApiBaseUrl = "https://api.collegefootballdata.com";
const collegeFootballDataDefaultRequestTimeoutMs = 30_000;

type CollegeFootballDataPhase = "validate" | "execute";
type CollegeFootballDataContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CollegeFootballDataActionHandler = (
  input: Record<string, unknown>,
  context: CollegeFootballDataContext,
) => Promise<unknown>;

export const collegeFootballDataActionHandlers: ProviderActionHandlers<
  "college_football_data",
  CollegeFootballDataActionHandler
> = {
  async get_info(_input, context) {
    return {
      info: normalizeUserInfo(await requestCollegeFootballDataJson("/info", {}, context, "execute")),
    };
  },
  async list_conferences(_input, context) {
    return {
      conferences: readObjectArray(await requestCollegeFootballDataJson("/conferences", {}, context, "execute")),
    };
  },
  async list_teams(input, context) {
    return {
      teams: readObjectArray(
        await requestCollegeFootballDataJson(
          "/teams",
          {
            year: optionalNumber(input.year),
            conference: optionalString(input.conference),
          },
          context,
          "execute",
        ),
      ),
    };
  },
  async list_venues(_input, context) {
    return {
      venues: readObjectArray(await requestCollegeFootballDataJson("/venues", {}, context, "execute")),
    };
  },
  async list_games(input, context) {
    if (optionalNumber(input.year) === undefined && optionalNumber(input.id) === undefined) {
      throw new ProviderRequestError(400, "Either year or id is required when listing CollegeFootballData games.");
    }

    return {
      games: readObjectArray(
        await requestCollegeFootballDataJson(
          "/games",
          {
            year: optionalNumber(input.year),
            week: optionalNumber(input.week),
            seasonType: optionalString(input.seasonType),
            classification: optionalString(input.classification),
            team: optionalString(input.team),
            home: optionalString(input.home),
            away: optionalString(input.away),
            conference: optionalString(input.conference),
            id: optionalNumber(input.id),
          },
          context,
          "execute",
        ),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, collegeFootballDataActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: CollegeFootballDataContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const info = normalizeUserInfo(await requestCollegeFootballDataJson("/info", {}, context, "validate"));

    return {
      profile: {
        accountId: "api_key",
        displayName: "CollegeFootballData API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/info",
        apiBaseUrl: collegeFootballDataApiBaseUrl,
        patronLevel: info?.patronLevel,
        remainingCalls: info?.remainingCalls,
      }),
    };
  },
};

async function requestCollegeFootballDataJson(
  path: string,
  query: Record<string, string | number | undefined>,
  context: CollegeFootballDataContext,
  phase: CollegeFootballDataPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, collegeFootballDataDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildCollegeFootballDataUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readCollegeFootballDataPayload(response);

    if (!response.ok) {
      throw createCollegeFootballDataError(response.status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "CollegeFootballData request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `CollegeFootballData request failed: ${error.message}`
        : "CollegeFootballData request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCollegeFootballDataUrl(path: string, query: Record<string, string | number | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${collegeFootballDataApiBaseUrl}/`);
  for (const [key, value] of Object.entries(queryParams(query))) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readCollegeFootballDataPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "CollegeFootballData returned invalid JSON");
  }
}

function createCollegeFootballDataError(
  status: number,
  payload: unknown,
  phase: CollegeFootballDataPhase,
): ProviderRequestError {
  const message =
    extractCollegeFootballDataErrorMessage(payload) ?? `CollegeFootballData request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractCollegeFootballDataErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.title);
}

function normalizeUserInfo(value: unknown): { patronLevel: number | null; remainingCalls: number | null } | null {
  if (value === null) {
    return null;
  }

  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "CollegeFootballData returned invalid info", value);
  }

  return {
    patronLevel: optionalNumber(record.patronLevel) ?? null,
    remainingCalls: optionalNumber(record.remainingCalls) ?? null,
  };
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "CollegeFootballData returned an invalid list", value);
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined);
}
