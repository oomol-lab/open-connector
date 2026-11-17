import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  optionalStringArray,
  requiredArray,
  requiredStringArray,
} from "../../core/cast.ts";
import { encodePathSegment, hasPathTraversalSegment, queryParams } from "../../core/request.ts";
import {
  basicAuthorizationHeader,
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { intervalsIcuDefaultActivityLimit } from "./limits.ts";

/** Origin of the Intervals.icu API. */
export const intervalsIcuApiBaseUrl = "https://intervals.icu";

/** Path prefix of every Intervals.icu API endpoint, which the proxy is limited to. */
export const intervalsIcuApiPathPrefix = "/api/v1";

/**
 * Athlete id 0 means the athlete who owns the API key, so no action needs to
 * ask for an athlete id.
 */
const ownAthletePath = `${intervalsIcuApiPathPrefix}/athlete/0`;

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface IntervalsIcuGetRequest {
  path: string;
  query?: Record<string, QueryValue>;
}

/**
 * Action handlers for every Intervals.icu action. Each one is a single GET
 * for the data of the athlete who owns the API key.
 */
export const intervalsIcuActionHandlers: ProviderActionHandlers<"intervals_icu", Handler> = {
  async get_athlete(_input, context) {
    return { athlete: await getOwnAthlete(context) };
  },
  async list_sport_settings(_input, context) {
    const settings = await getIntervalsIcu(context, { path: `${ownAthletePath}/sport-settings` });
    return { sportSettings: responseList(settings, "sport settings") };
  },
  async list_activities(input, context) {
    const oldest = requiredInputString(input.oldest, "oldest");
    const newest = optionalString(input.newest);
    checkDateOrder(oldest, newest);
    const activities = await getIntervalsIcu(context, {
      path: `${ownAthletePath}/activities`,
      query: {
        oldest,
        newest,
        limit: optionalInteger(input.limit) ?? intervalsIcuDefaultActivityLimit,
        fields: commaList(input.fields),
      },
    });
    return { activities: responseList(activities, "activities") };
  },
  async search_activities(input, context) {
    const activities = await getIntervalsIcu(context, {
      path: `${ownAthletePath}/activities/search`,
      query: {
        q: requiredInputString(input.query, "query"),
        limit: optionalInteger(input.limit) ?? intervalsIcuDefaultActivityLimit,
      },
    });
    return { activities: responseList(activities, "activity search") };
  },
  async get_activity(input, context) {
    const activity = await getIntervalsIcu(context, {
      path: activityPath(input.activityId),
      query: { intervals: optionalBoolean(input.includeIntervals) },
    });
    return { activity: requiredResponseRecord(activity, "Intervals.icu activity") };
  },
  async get_activity_streams(input, context) {
    const streams = await getIntervalsIcu(context, {
      path: `${activityPath(input.activityId)}/streams`,
      query: { types: requiredStringArray(input.types, "types", providerInputError).join(",") },
    });
    return { streams: responseList(streams, "activity streams") };
  },
  async list_wellness(input, context) {
    const oldest = requiredInputString(input.oldest, "oldest");
    const newest = requiredInputString(input.newest, "newest");
    checkDateOrder(oldest, newest);
    const records = await getIntervalsIcu(context, {
      path: `${ownAthletePath}/wellness`,
      query: { oldest, newest, fields: commaList(input.fields) },
    });
    return { records: responseList(records, "wellness records") };
  },
  async list_events(input, context) {
    const oldest = optionalString(input.oldest);
    const newest = optionalString(input.newest);
    if (oldest !== undefined) checkDateOrder(oldest, newest);
    const events = await getIntervalsIcu(context, {
      path: `${ownAthletePath}/events`,
      query: {
        oldest,
        newest,
        category: commaList(input.categories),
        limit: optionalInteger(input.limit),
      },
    });
    return { events: responseList(events, "events") };
  },
  async get_event(input, context) {
    const eventId = optionalInteger(input.eventId);
    if (eventId === undefined || eventId < 1) {
      throw providerInputError("eventId must be a positive integer.");
    }
    const event = await getIntervalsIcu(context, {
      path: `${ownAthletePath}/events/${encodePathSegment(eventId)}`,
    });
    return { event: requiredResponseRecord(event, "Intervals.icu event") };
  },
};

/**
 * The Authorization header for an API key: HTTP Basic with the literal user
 * name API_KEY and the key as the password, as Intervals.icu documents.
 */
export function intervalsIcuAuthorization(apiKey: string): string {
  return basicAuthorizationHeader(`API_KEY:${apiKey}`);
}

/**
 * Prove an API key works by reading the athlete profile, and describe the
 * athlete it belongs to.
 */
export async function validateIntervalsIcuApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const athlete = await getOwnAthlete({ apiKey, fetcher, signal });
  return {
    profile: {
      accountId: optionalString(athlete.id),
      displayName: optionalString(athlete.name) ?? "Intervals.icu athlete",
    },
  };
}

/**
 * Turn a failed Intervals.icu response into a provider error. Intervals.icu
 * answers errors with a short status phrase, such as
 * `{"status":401,"error":"Unauthorized"}`, so each status carries a message
 * that says what to check and the body is kept in the details.
 */
export async function readIntervalsIcuError(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const body = await readProviderErrorBody(response, "Intervals.icu", signal);
  switch (response.status) {
    case 401:
      return new ProviderRequestError(401, "Intervals.icu request was not authorized.", body, "provider_error");
    case 403:
      return new ProviderRequestError(403, "Intervals.icu refused access to this resource.", body, "provider_error");
    case 404:
      return new ProviderRequestError(404, "Intervals.icu found nothing with this identifier.", body);
    case 429:
      return new ProviderRequestError(
        429,
        "Intervals.icu rate limit reached. Wait before sending more requests.",
        withRetryAfterSeconds(response, body),
      );
    default:
      return new ProviderRequestError(
        response.status,
        `Intervals.icu request failed with HTTP ${response.status}.`,
        body,
      );
  }
}

/**
 * Read the athlete who owns the API key from the profile endpoint, which holds
 * the identity fields; /athlete/0 is the full settings record of about 160
 * fields.
 */
async function getOwnAthlete(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const profile = requiredResponseRecord(
    await getIntervalsIcu(context, { path: `${ownAthletePath}/profile` }),
    "Intervals.icu athlete profile",
  );
  return requiredResponseRecord(profile.athlete, "Intervals.icu athlete");
}

async function getIntervalsIcu(context: ApiKeyProviderContext, request: IntervalsIcuGetRequest): Promise<unknown> {
  const url = new URL(request.path, intervalsIcuApiBaseUrl);
  if (request.query) setSearchParams(url, queryParams(request.query));
  return runProviderRequest({ label: "Intervals.icu", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: intervalsIcuAuthorization(context.apiKey),
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw await readIntervalsIcuError(response, signal);
    }
    const body = await readProviderTextBody(response, "Intervals.icu response", undefined, signal);
    return parseProviderJsonBodyText(body, {
      emptyBody: null,
      invalidJsonMessage: "Intervals.icu returned invalid JSON",
    });
  });
}

/**
 * The API path of one activity. Activity ids are free-form strings, and an id
 * of "." or ".." would move the request to another endpoint.
 */
function activityPath(value: unknown): string {
  const path = `${intervalsIcuApiPathPrefix}/activity/${encodePathSegment(requiredInputString(value, "activityId"))}`;
  if (hasPathTraversalSegment(path)) {
    throw providerInputError("activityId is not a valid activity identifier.");
  }
  return path;
}

/**
 * Check that a range does not end on an earlier day than it starts. Only the
 * calendar days are compared, as text, because ISO-8601 dates sort that way and
 * a date-only bound on the same day as a date-and-time bound is left to
 * Intervals.icu to interpret.
 */
function checkDateOrder(oldest: string, newest: string | undefined): void {
  if (newest !== undefined && newest.slice(0, 10) < oldest.slice(0, 10)) {
    throw providerInputError("newest must not be before oldest.");
  }
}

/** Intervals.icu takes list parameters as one comma-separated value. */
function commaList(value: unknown): string | undefined {
  return optionalStringArray(value)?.join(",");
}

/** A list response, where an empty body means an empty list; any other shape is a provider error. */
function responseList(response: unknown, label: string): unknown[] {
  return response === null ? [] : requiredArray(response, `Intervals.icu ${label} response`, providerResponseError);
}
