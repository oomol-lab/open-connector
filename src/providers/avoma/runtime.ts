import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const avomaApiBaseUrl = "https://api.avoma.com";

const avomaValidationPath = "/v1/meetings/";

type AvomaRequestPhase = "validate" | "execute";
type AvomaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface AvomaRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const avomaActionHandlers: ProviderActionHandlers<"avoma", AvomaActionHandler> = {
  list_meetings(input, context) {
    return listAvomaMeetings(input, context);
  },
  get_meeting(input, context) {
    return getAvomaMeeting(input, context);
  },
  get_meeting_insights(input, context) {
    return getAvomaMeetingInsights(input, context);
  },
  list_transcriptions(input, context) {
    return listAvomaTranscriptions(input, context);
  },
  get_transcription(input, context) {
    return getAvomaTranscription(input, context);
  },
  get_recording_for_meeting(input, context) {
    return getAvomaRecordingForMeeting(input, context);
  },
  get_recording(input, context) {
    return getAvomaRecording(input, context);
  },
  list_users(_input, context) {
    return listAvomaUsers(context);
  },
  get_user(input, context) {
    return getAvomaUser(input, context);
  },
};

export async function validateAvomaCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await avomaRequestJson(
    {
      path: avomaValidationPath,
      query: {
        from_date: "1970-01-01T00:00:00Z",
        to_date: "1970-01-02T00:00:00Z",
        page_size: "1",
      },
    },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "Avoma API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: avomaApiBaseUrl,
      validationEndpoint: avomaValidationPath,
    },
  };
}

async function listAvomaMeetings(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: "/v1/meetings/",
      query: buildDateRangeQuery(input, {
        page: stringifyOptionalInteger(input.page),
        page_size: stringifyOptionalInteger(input.pageSize),
        recording_duration__gte: stringifyOptionalNumber(optionalNumber(input.recordingDurationGte)),
        is_call: stringifyOptionalBoolean(optionalBoolean(input.isCall)),
        is_internal: stringifyOptionalBoolean(optionalBoolean(input.isInternal)),
        attendee_emails: stringifyOptionalStringArray(input.attendeeEmails),
        crm_account_ids: stringifyOptionalStringArray(input.crmAccountIds),
        crm_opportunity_ids: stringifyOptionalStringArray(input.crmOpportunityIds),
        crm_contact_ids: stringifyOptionalStringArray(input.crmContactIds),
        crm_lead_ids: stringifyOptionalStringArray(input.crmLeadIds),
        include_crm_associations: stringifyOptionalBoolean(optionalBoolean(input.includeCrmAssociations)),
        o: optionalString(input.order),
      }),
    },
    context,
    "execute",
  );

  return normalizePaginatedPayload(payload, "meetings");
}

async function getAvomaMeeting(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: `/v1/meetings/${encodePathSegment(input.meetingUuid)}/`,
      query: {
        include_crm_associations: stringifyOptionalBoolean(optionalBoolean(input.includeCrmAssociations)),
      },
    },
    context,
    "execute",
  );

  return { meeting: requireAvomaObject(payload, "Avoma meeting") };
}

async function getAvomaMeetingInsights(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: `/v1/meetings/${encodePathSegment(input.meetingUuid)}/insights/`,
    },
    context,
    "execute",
  );

  return { insights: requireAvomaObject(payload, "Avoma meeting insights") };
}

async function listAvomaTranscriptions(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: "/v1/transcriptions/",
      query: buildDateRangeQuery(input, {
        page: stringifyOptionalInteger(input.page),
        page_size: stringifyOptionalInteger(input.pageSize),
        attendee_emails: stringifyOptionalStringArray(input.attendeeEmails),
        crm_account_ids: stringifyOptionalStringArray(input.crmAccountIds),
        crm_opportunity_ids: stringifyOptionalStringArray(input.crmOpportunityIds),
        crm_contact_ids: stringifyOptionalStringArray(input.crmContactIds),
        crm_lead_ids: stringifyOptionalStringArray(input.crmLeadIds),
      }),
    },
    context,
    "execute",
  );

  return normalizePaginatedPayload(payload, "transcriptions");
}

async function getAvomaTranscription(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: `/v1/transcriptions/${encodePathSegment(input.transcriptionUuid)}/`,
    },
    context,
    "execute",
  );

  return { transcription: requireAvomaObject(payload, "Avoma transcription") };
}

async function getAvomaRecordingForMeeting(input: Record<string, unknown>, context: AvomaRequestContext) {
  const response = await avomaRequestJsonWithStatus(
    {
      path: "/v1/recordings/",
      query: {
        meeting_uuid: String(input.meetingUuid),
      },
    },
    context,
    "execute",
  );

  return {
    status: response.status,
    recording: requireAvomaObject(response.payload, "Avoma recording"),
  };
}

async function getAvomaRecording(input: Record<string, unknown>, context: AvomaRequestContext) {
  const response = await avomaRequestJsonWithStatus(
    {
      path: `/v1/recordings/${encodePathSegment(input.recordingUuid)}/`,
    },
    context,
    "execute",
  );

  return {
    status: response.status,
    recording: requireAvomaObject(response.payload, "Avoma recording"),
  };
}

async function listAvomaUsers(context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: "/v1/users/",
    },
    context,
    "execute",
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Avoma users response must be an array");
  }

  return { users: payload.map((item) => requireAvomaObject(item, "Avoma user")) };
}

async function getAvomaUser(input: Record<string, unknown>, context: AvomaRequestContext) {
  const payload = await avomaRequestJson(
    {
      path: `/v1/users/${encodePathSegment(input.userUuid)}/`,
    },
    context,
    "execute",
  );

  return { user: requireAvomaObject(payload, "Avoma user") };
}

async function avomaRequestJson(
  request: { path: string; query?: Record<string, string | undefined> },
  context: AvomaRequestContext,
  phase: AvomaRequestPhase,
): Promise<unknown> {
  const response = await avomaRequestJsonWithStatus(request, context, phase);
  return response.payload;
}

async function avomaRequestJsonWithStatus(
  request: { path: string; query?: Record<string, string | undefined> },
  context: AvomaRequestContext,
  phase: AvomaRequestPhase,
): Promise<{ status: number; payload: unknown }> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildAvomaUrl(request.path, request.query), {
      method: "GET",
      headers: avomaHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readAvomaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Avoma request failed: ${error.message}` : "Avoma request failed",
    );
  }

  if (!response.ok) {
    throw createAvomaError(response, payload, phase);
  }

  return { status: response.status, payload };
}

function buildAvomaUrl(path: string, query?: Record<string, string | undefined>): URL {
  const url = new URL(path, avomaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function avomaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readAvomaPayload(response: Response): Promise<unknown> {
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

function createAvomaError(response: Response, payload: unknown, phase: AvomaRequestPhase): ProviderRequestError {
  const message = extractAvomaErrorMessage(payload) ?? response.statusText ?? "Avoma request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractAvomaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["detail", "message", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      if (typeof first === "string") {
        return first.trim();
      }
    }
  }

  for (const value of Object.values(record)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const first = value.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") {
      return first.trim();
    }
  }

  return undefined;
}

function buildDateRangeQuery(
  input: Record<string, unknown>,
  extra: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    from_date: String(input.fromDate),
    to_date: String(input.toDate),
    ...extra,
  };
}

function normalizePaginatedPayload(payload: unknown, itemField: "meetings" | "transcriptions") {
  const object = requireAvomaObject(payload, "Avoma paginated response");
  const results = object.results;
  if (!Array.isArray(results)) {
    throw new ProviderRequestError(502, "Avoma paginated response results must be an array");
  }

  return {
    count: readIntegerField(object.count, "count"),
    next: readNullableStringField(object.next, "next"),
    previous: readNullableStringField(object.previous, "previous"),
    [itemField]: results.map((item) => requireAvomaObject(item, `Avoma ${itemField} item`)),
  };
}

function requireAvomaObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
  return record;
}

function readIntegerField(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer !== undefined) {
    return integer;
  }
  throw new ProviderRequestError(502, `Avoma response field ${fieldName} must be an integer`);
}

function readNullableStringField(value: unknown, fieldName: string): string | null {
  if (value === null || typeof value === "string") {
    return value;
  }
  throw new ProviderRequestError(502, `Avoma response field ${fieldName} must be a string or null`);
}

function stringifyOptionalStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => String(item).trim()).filter(Boolean);
  return values.length > 0 ? values.join(",") : undefined;
}

function stringifyOptionalInteger(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function stringifyOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
