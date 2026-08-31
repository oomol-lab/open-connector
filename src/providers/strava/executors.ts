import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineOAuthProviderExecutors,
  providerInputError,
  ProviderRequestError,
  readTransitFileInput,
} from "../provider-runtime.ts";

const service = "strava";
const stravaApiBaseUrl = "https://www.strava.com/api/v3/";

type StravaActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const stravaActionHandlers: ProviderActionHandlers<"strava", StravaActionHandler> = {
  get_authenticated_athlete(input, context) {
    return stravaGetAuthenticatedAthlete(input, context);
  },
  update_athlete(input, context) {
    return stravaUpdateAthlete(input, context);
  },
  get_athlete_stats(input, context) {
    return stravaGetAthleteStats(input, context);
  },
  get_zones(input, context) {
    return stravaGetZones(input, context);
  },
  list_athlete_activities(input, context) {
    return stravaListAthleteActivities(input, context);
  },
  get_activity(input, context) {
    return stravaGetActivity(input, context);
  },
  update_activity(input, context) {
    return stravaUpdateActivity(input, context);
  },
  create_activity(input, context) {
    return stravaCreateActivity(input, context);
  },
  upload_activity(input, context) {
    return stravaUploadActivity(input, context);
  },
  get_upload(input, context) {
    return stravaGetUpload(input, context);
  },
  get_activity_streams(input, context) {
    return stravaGetActivityStreams(input, context);
  },
  get_activity_zones(input, context) {
    return stravaGetActivityZones(input, context);
  },
  list_activity_laps(input, context) {
    return stravaListActivityLaps(input, context);
  },
  list_activity_comments(input, context) {
    return stravaListActivityComments(input, context);
  },
  list_activity_kudoers(input, context) {
    return stravaListActivityKudoers(input, context);
  },
  list_athlete_clubs(input, context) {
    return stravaListAthleteClubs(input, context);
  },
  get_club(input, context) {
    return stravaGetClub(input, context);
  },
  list_club_members(input, context) {
    return stravaListClubMembers(input, context);
  },
  list_club_administrators(input, context) {
    return stravaListClubAdministrators(input, context);
  },
  list_club_activities(input, context) {
    return stravaListClubActivities(input, context);
  },
  get_equipment(input, context) {
    return stravaGetEquipment(input, context);
  },
  list_athlete_routes(input, context) {
    return stravaListAthleteRoutes(input, context);
  },
  get_route(input, context) {
    return stravaGetRoute(input, context);
  },
  get_route_streams(input, context) {
    return stravaGetRouteStreams(input, context);
  },
  export_route_gpx(input, context) {
    return stravaExportRoute(input, context, "gpx");
  },
  export_route_tcx(input, context) {
    return stravaExportRoute(input, context, "tcx");
  },
  get_segment(input, context) {
    return stravaGetSegment(input, context);
  },
  list_starred_segments(input, context) {
    return stravaListStarredSegments(input, context);
  },
  star_segment(input, context) {
    return stravaStarSegment(input, context);
  },
  explore_segments(input, context) {
    return stravaExploreSegments(input, context);
  },
  list_segment_efforts(input, context) {
    return stravaListSegmentEfforts(input, context);
  },
  get_segment_effort(input, context) {
    return stravaGetSegmentEffort(input, context);
  },
  get_segment_streams(input, context) {
    return stravaGetSegmentStreams(input, context);
  },
  get_segment_effort_streams(input, context) {
    return stravaGetSegmentEffortStreams(input, context);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, stravaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = await stravaJsonRequest<Record<string, unknown>>("/athlete", {
      accessToken: input.accessToken,
      fetcher,
      signal,
    });
    const accountId = stringifyId(payload.id);
    return {
      profile: {
        accountId,
        displayName: buildAthleteLabel(payload) ?? accountId,
      },
      grantedScopes: parseScopeList(input.metadata.scope),
      metadata: {
        currentUser: payload,
      },
    };
  },
};

async function stravaGetAuthenticatedAthlete(
  _input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  return stravaJsonRequest("/athlete", context);
}

async function stravaUpdateAthlete(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const formData = new FormData();
  formData.append("weight", String(requireNumber(input.weight, "weight")));
  return stravaJsonRequest("/athlete", {
    ...context,
    method: "PUT",
    body: formData,
  });
}

async function stravaGetAthleteStats(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/athletes/${requireId(input.athleteId, "athleteId")}/stats`, context);
}

async function stravaGetZones(_input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>("/athlete/zones", context);
  return { zones: Array.isArray(payload) ? payload : [] };
}

async function stravaListAthleteActivities(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>("/athlete/activities", {
    ...context,
    query: compactObject({
      before: optionalInteger(input.before),
      after: optionalInteger(input.after),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
  });
  return { activities: Array.isArray(payload) ? payload : [] };
}

async function stravaGetActivity(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/activities/${requireId(input.activityId, "activityId")}`, {
    ...context,
    query: compactObject({
      include_all_efforts: optionalBoolean(input.includeAllEfforts),
    }),
  });
}

async function stravaUpdateActivity(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const activity = requiredRecord(input.activity, "activity", providerInputError);
  return stravaJsonRequest(`/activities/${requireId(input.activityId, "activityId")}`, {
    ...context,
    method: "PUT",
    jsonBody: compactObject({
      commute: optionalBoolean(activity.commute),
      trainer: optionalBoolean(activity.trainer),
      hide_from_home: optionalBoolean(activity.hideFromHome),
      description: optionalString(activity.description),
      name: optionalString(activity.name),
      type: optionalString(activity.type),
      sport_type: optionalString(activity.sportType),
      gear_id: optionalString(activity.gearId),
    }),
  });
}

async function stravaCreateActivity(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const formData = new FormData();
  formData.append("name", requireString(input.name, "name"));
  formData.append("sport_type", requireString(input.sportType, "sportType"));
  formData.append("start_date_local", requireString(input.startDateLocal, "startDateLocal"));
  formData.append("elapsed_time", String(requireInteger(input.elapsedTime, "elapsedTime")));
  appendOptionalFormString(formData, "type", input.type);
  appendOptionalFormString(formData, "description", input.description);
  const distance = optionalNumber(input.distance);
  if (distance !== undefined) {
    formData.append("distance", String(distance));
  }
  appendOptionalIntegerFlag(formData, "trainer", input.trainer);
  appendOptionalIntegerFlag(formData, "commute", input.commute);
  return stravaJsonRequest("/activities", {
    ...context,
    method: "POST",
    body: formData,
  });
}

async function stravaUploadActivity(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const uploadSource = await readTransitFileInput(input.file, context);
  const formData = new FormData();
  formData.append("file", uploadSource.file);
  formData.append("data_type", requireString(input.dataType, "dataType"));
  appendOptionalFormString(formData, "name", input.name);
  appendOptionalFormString(formData, "description", input.description);
  appendOptionalBooleanFlag(formData, "trainer", input.trainer);
  appendOptionalBooleanFlag(formData, "commute", input.commute);
  appendOptionalFormString(formData, "external_id", input.externalId);
  return stravaJsonRequest("/uploads", {
    ...context,
    method: "POST",
    body: formData,
  });
}

async function stravaGetUpload(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/uploads/${requireId(input.uploadId, "uploadId")}`, context);
}

async function stravaGetActivityStreams(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest(`/activities/${requireId(input.activityId, "activityId")}/streams`, {
    ...context,
    query: {
      keys: requireStringArray(input.keys, "keys").join(","),
      key_by_type: String(optionalBoolean(input.keyByType) ?? false),
    },
  });
  return { streams: payload };
}

async function stravaGetActivityZones(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(
    `/activities/${requireId(input.activityId, "activityId")}/zones`,
    context,
  );
  return { zones: Array.isArray(payload) ? payload : [] };
}

async function stravaListActivityLaps(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(
    `/activities/${requireId(input.activityId, "activityId")}/laps`,
    context,
  );
  return { laps: Array.isArray(payload) ? payload : [] };
}

async function stravaListActivityComments(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(
    `/activities/${requireId(input.activityId, "activityId")}/comments`,
    {
      ...context,
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        page_size: optionalInteger(input.pageSize),
        after_cursor: optionalString(input.afterCursor),
      }),
    },
  );
  return { comments: Array.isArray(payload) ? payload : [] };
}

async function stravaListActivityKudoers(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(`/activities/${requireId(input.activityId, "activityId")}/kudos`, {
    ...context,
    query: paginationQuery(input),
  });
  return { athletes: Array.isArray(payload) ? payload : [] };
}

async function stravaListAthleteClubs(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>("/athlete/clubs", {
    ...context,
    query: paginationQuery(input),
  });
  return { clubs: Array.isArray(payload) ? payload : [] };
}

async function stravaGetClub(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/clubs/${requireId(input.clubId, "clubId")}`, context);
}

async function stravaListClubMembers(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(`/clubs/${requireId(input.clubId, "clubId")}/members`, {
    ...context,
    query: paginationQuery(input),
  });
  return { athletes: Array.isArray(payload) ? payload : [] };
}

async function stravaListClubAdministrators(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(`/clubs/${requireId(input.clubId, "clubId")}/admins`, {
    ...context,
    query: paginationQuery(input),
  });
  return { athletes: Array.isArray(payload) ? payload : [] };
}

async function stravaListClubActivities(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(`/clubs/${requireId(input.clubId, "clubId")}/activities`, {
    ...context,
    query: paginationQuery(input),
  });
  return { activities: Array.isArray(payload) ? payload : [] };
}

async function stravaGetEquipment(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/gear/${requireString(input.gearId, "gearId")}`, context);
}

async function stravaListAthleteRoutes(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>(`/athletes/${requireId(input.athleteId, "athleteId")}/routes`, {
    ...context,
    query: paginationQuery(input),
  });
  return { routes: Array.isArray(payload) ? payload : [] };
}

async function stravaGetRoute(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/routes/${requireId(input.routeId, "routeId")}`, context);
}

async function stravaGetRouteStreams(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest(`/routes/${requireId(input.routeId, "routeId")}/streams`, context);
  return { streams: payload };
}

async function stravaExportRoute(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  format: "gpx" | "tcx",
): Promise<unknown> {
  const routeId = requireId(input.routeId, "routeId");
  const response = await stravaRequest(`/routes/${routeId}/export_${format}`, context);
  return {
    routeId,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    content: await response.text(),
  };
}

async function stravaGetSegment(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/segments/${requireId(input.segmentId, "segmentId")}`, context);
}

async function stravaListStarredSegments(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>("/segments/starred", {
    ...context,
    query: paginationQuery(input),
  });
  return { segments: Array.isArray(payload) ? payload : [] };
}

async function stravaStarSegment(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const formData = new FormData();
  formData.append("starred", String(Boolean(input.starred)));
  return stravaJsonRequest(`/segments/${requireId(input.segmentId, "segmentId")}/starred`, {
    ...context,
    method: "PUT",
    body: formData,
  });
}

async function stravaExploreSegments(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await stravaJsonRequest<Record<string, unknown>>("/segments/explore", {
    ...context,
    query: compactObject({
      bounds: requireNumberArray(input.bounds, "bounds").join(","),
      activity_type: optionalString(input.activityType),
      min_cat: optionalInteger(input.minCat),
      max_cat: optionalInteger(input.maxCat),
    }),
  });
  return {
    segments: Array.isArray(payload.segments) ? payload.segments : [],
  };
}

async function stravaListSegmentEfforts(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest<unknown[]>("/segment_efforts", {
    ...context,
    query: compactObject({
      segment_id: requireId(input.segmentId, "segmentId"),
      start_date_local: optionalString(input.startDateLocal),
      end_date_local: optionalString(input.endDateLocal),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
  });
  return { efforts: Array.isArray(payload) ? payload : [] };
}

async function stravaGetSegmentEffort(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return stravaJsonRequest(`/segment_efforts/${requireId(input.segmentEffortId, "segmentEffortId")}`, context);
}

async function stravaGetSegmentStreams(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest(`/segments/${requireId(input.segmentId, "segmentId")}/streams`, {
    ...context,
    query: {
      keys: requireStringArray(input.keys, "keys").join(","),
      key_by_type: String(optionalBoolean(input.keyByType) ?? false),
    },
  });
  return { streams: payload };
}

async function stravaGetSegmentEffortStreams(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const payload = await stravaJsonRequest(
    `/segment_efforts/${requireId(input.segmentEffortId, "segmentEffortId")}/streams`,
    {
      ...context,
      query: {
        keys: requireStringArray(input.keys, "keys").join(","),
        key_by_type: String(optionalBoolean(input.keyByType) ?? false),
      },
    },
  );
  return { streams: payload };
}

interface StravaRequestInput extends Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal"> {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, unknown>;
  body?: BodyInit;
  jsonBody?: Record<string, unknown>;
}

async function stravaJsonRequest<T = unknown>(path: string, input: StravaRequestInput): Promise<T> {
  const response = await stravaRequest(path, input);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "malformed strava api response");
  }
}

async function stravaRequest(path: string, input: StravaRequestInput): Promise<Response> {
  const url = new URL(normalizeStravaPath(path), stravaApiBaseUrl);
  appendQuery(url, input.query);
  const response = await input.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers: buildStravaHeaders(input.accessToken, input.body == null, input.jsonBody != null),
    body: input.jsonBody != null ? JSON.stringify(input.jsonBody) : input.body != null ? input.body : undefined,
    signal: input.signal,
  });
  await assertStravaResponse(response);
  return response;
}

function buildStravaHeaders(accessToken: string, acceptJson: boolean, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  };
  if (acceptJson) {
    headers.accept = "application/json";
  }
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function appendQuery(url: URL, query?: Record<string, unknown>): void {
  if (!query) {
    return;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
}

async function assertStravaResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  throw new ProviderRequestError(response.status, await readStravaErrorMessage(response));
}

async function readStravaErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const fallbackMessage = `strava request failed with status ${response.status}`;
  if (contentType.includes("application/json")) {
    const payload = await tryReadStravaJsonPayload(response.clone());
    const record = optionalRecord(payload);
    if (record) {
      const message = optionalString(record.message);
      const details = summarizeStravaErrorDetails(record.errors);
      if (message && details) {
        return `${message}: ${details}`;
      }
      if (message) {
        return message;
      }
      if (details) {
        return details;
      }
    }
  }
  const text = optionalString(await response.text());
  return text ?? fallbackMessage;
}

async function tryReadStravaJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function summarizeStravaErrorDetails(errors: unknown): string | undefined {
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }
  const details = errors
    .map((item) => {
      const record = optionalRecord(item);
      if (!record) {
        return undefined;
      }
      return [optionalString(record.resource), optionalString(record.field), optionalString(record.code)]
        .filter(Boolean)
        .join(".");
    })
    .filter((detail) => !!detail);
  return details.length > 0 ? details.join(", ") : undefined;
}

function normalizeStravaPath(path: string): string {
  let normalized = path;
  while (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function requireId(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a number`);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`);
  }
  return value.map((item, index) => requireString(item, `${fieldName}[${index}]`));
}

function requireNumberArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty number array`);
  }
  return value.map((item) => requireNumber(item, fieldName));
}

function appendOptionalFormString(formData: FormData, fieldName: string, value: unknown): void {
  const text = optionalString(value);
  if (text) {
    formData.append(fieldName, text);
  }
}

function appendOptionalIntegerFlag(formData: FormData, fieldName: string, value: unknown): void {
  const flag = optionalBoolean(value);
  if (flag !== undefined) {
    formData.append(fieldName, flag ? "1" : "0");
  }
}

function appendOptionalBooleanFlag(formData: FormData, fieldName: string, value: unknown): void {
  const flag = optionalBoolean(value);
  if (flag !== undefined) {
    formData.append(fieldName, flag ? "true" : "false");
  }
}

function paginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
  });
}

function stringifyId(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  throw new ProviderRequestError(502, "missing strava athlete id");
}

function buildAthleteLabel(payload: Record<string, unknown>): string | undefined {
  const firstName = optionalString(payload.firstname);
  const lastName = optionalString(payload.lastname);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return fullName || optionalString(payload.username);
}

function parseScopeList(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
