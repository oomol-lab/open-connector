import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { MeetGeekActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const meetGeekApiBaseUrls = {
  default: "https://api.meetgeek.ai",
  eu: "https://api-eu.meetgeek.ai",
  us: "https://api-us.meetgeek.ai",
};

type MeetGeekRegion = keyof typeof meetGeekApiBaseUrls;
type MeetGeekQueryValue = string | number | undefined;
type MeetGeekPhase = "validate" | "execute";
type MeetGeekActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MeetGeekActionHandler = (input: Record<string, unknown>, context: MeetGeekActionContext) => Promise<unknown>;

export const meetGeekActionHandlers: Record<MeetGeekActionName, MeetGeekActionHandler> = {
  list_meetings(input, context) {
    return executeMeetingsPage("/v1/meetings", input, context);
  },
  list_team_meetings(input, context) {
    const teamId = positiveInputInteger(input.teamId, "teamId");
    return executeMeetingsPage(`/v1/teams/${teamId}/meetings`, input, context);
  },
  get_meeting(input, context) {
    return executeMeeting(input, context);
  },
  get_summary(input, context) {
    return executeSummary(input, context);
  },
  get_transcript(input, context) {
    return executeTranscript(input, context);
  },
  get_highlights(input, context) {
    return executeHighlights(input, context);
  },
  get_insights(input, context) {
    return executeInsights(input, context);
  },
  list_teams(input, context) {
    return executeTeams(input, context, "execute");
  },
};

export async function validateMeetGeekCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const result = await executeTeams(
    {},
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "meet_geek",
      displayName: "MeetGeek API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/v1/teams",
      apiBaseUrl: meetGeekApiBaseUrls.default,
      authMethod: "bearer_header",
      shareAccessTeamCount: result.shareAccess.length,
      viewAccessTeamCount: result.viewAccess.length,
    },
  };
}

async function executeMeetingsPage(
  path: string,
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const payload = await meetGeekJsonRequest(path, buildPaginationQuery(input), readRegion(input), context, "execute");
  const record = requireProviderRecord(payload, "MeetGeek response");
  const pagination = readPagination(record.pagination);
  return {
    meetings: readObjectArray(record.meetings, "meetings"),
    pagination,
    nextCursor: readNextCursor(pagination),
  };
}

async function executeMeeting(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const meetingId = readMeetingId(input);
  const payload = await meetGeekJsonRequest(
    `/v1/meetings/${encodeURIComponent(meetingId)}`,
    {},
    readRegion(input),
    context,
    "execute",
  );
  return {
    meeting: requireProviderRecord(payload, "MeetGeek meeting response"),
  };
}

async function executeSummary(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const meetingId = readMeetingId(input);
  const payload = await meetGeekJsonRequest(
    `/v1/meetings/${encodeURIComponent(meetingId)}/summary`,
    {},
    readRegion(input),
    context,
    "execute",
  );
  const record = requireProviderRecord(payload, "MeetGeek summary response");
  return {
    meetingId: readOutputString(record.meeting_id, "meeting_id"),
    summary: readOutputString(record.summary, "summary"),
    aiInsights: readOutputString(record.ai_insights, "ai_insights"),
    raw: record,
  };
}

async function executeTranscript(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const meetingId = readMeetingId(input);
  const payload = await meetGeekJsonRequest(
    `/v1/meetings/${encodeURIComponent(meetingId)}/transcript`,
    buildPaginationQuery(input),
    readRegion(input),
    context,
    "execute",
  );
  const record = requireProviderRecord(payload, "MeetGeek transcript response");
  const pagination = readPagination(record.pagination);
  return {
    meetingId: readOutputString(record.meeting_id, "meeting_id"),
    sentences: readObjectArray(record.sentences, "sentences"),
    pagination,
    nextCursor: readNextCursor(pagination),
  };
}

async function executeHighlights(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const meetingId = readMeetingId(input);
  const payload = await meetGeekJsonRequest(
    `/v1/meetings/${encodeURIComponent(meetingId)}/highlights`,
    compactObject({
      type: optionalString(input.type),
    }),
    readRegion(input),
    context,
    "execute",
  );
  const record = requireProviderRecord(payload, "MeetGeek highlights response");
  return {
    meetingId: readOutputString(record.meeting_id, "meeting_id"),
    highlights: readObjectArray(record.highlights, "highlights"),
  };
}

async function executeInsights(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
): Promise<Record<string, unknown>> {
  const meetingId = readMeetingId(input);
  const payload = await meetGeekJsonRequest(
    `/v1/meetings/${encodeURIComponent(meetingId)}/insights`,
    {},
    readRegion(input),
    context,
    "execute",
  );
  return {
    insights: requireProviderRecord(payload, "MeetGeek insights response"),
  };
}

async function executeTeams(
  input: Record<string, unknown>,
  context: MeetGeekActionContext,
  phase: MeetGeekPhase,
): Promise<{ shareAccess: Array<Record<string, unknown>>; viewAccess: Array<Record<string, unknown>> }> {
  const payload = await meetGeekJsonRequest("/v1/teams", {}, readRegion(input), context, phase);
  const record = requireProviderRecord(payload, "MeetGeek teams response");
  return {
    shareAccess: readObjectArray(record.share_access, "share_access"),
    viewAccess: readObjectArray(record.view_access, "view_access"),
  };
}

async function meetGeekJsonRequest(
  path: string,
  query: Record<string, MeetGeekQueryValue>,
  region: MeetGeekRegion,
  context: MeetGeekActionContext,
  phase: MeetGeekPhase,
): Promise<unknown> {
  const url = new URL(path, meetGeekApiBaseUrls[region]);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MeetGeek request failed: ${error.message}` : "MeetGeek request failed",
      error,
    );
  }

  if (response.status === 204) {
    return {};
  }
  if (!response.ok) {
    throw buildMeetGeekError(response.status, payload, phase);
  }

  return payload;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "MeetGeek returned invalid JSON");
  }
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, MeetGeekQueryValue> {
  return compactObject({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
  });
}

function readRegion(input: Record<string, unknown>): MeetGeekRegion {
  const region = optionalString(input.region);
  if (region === "eu" || region === "us" || region === "default" || region === undefined) {
    return region ?? "default";
  }
  throw new ProviderRequestError(400, "region must be default, eu, or us");
}

function readMeetingId(input: Record<string, unknown>): string {
  return requiredString(input.meetingId, "meetingId", (message) => new ProviderRequestError(400, message));
}

function positiveInputInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOutputString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `MeetGeek response did not include ${fieldName}`),
  );
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return objectArray(
    value,
    fieldName,
    () => new ProviderRequestError(502, `MeetGeek response did not include ${fieldName}`),
  );
}

function readPagination(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  return requireProviderRecord(value, "pagination");
}

function readNextCursor(pagination: Record<string, unknown>): string | null {
  return (
    optionalString(pagination.next) ??
    optionalString(pagination.next_cursor) ??
    optionalString(pagination.cursor) ??
    null
  );
}

function buildMeetGeekError(status: number, payload: unknown, phase: MeetGeekPhase): ProviderRequestError {
  const message = readMeetGeekErrorMessage(payload) ?? `MeetGeek request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readMeetGeekErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error);
}

function requireProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `MeetGeek response did not include ${fieldName}`, value);
  }
  return record;
}
