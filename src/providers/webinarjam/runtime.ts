import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const webinarjamApiBaseUrl = "https://api.webinarjam.com/webinarjam";

type WebinarjamRequestPhase = "validate" | "execute";
type WebinarjamFormValue = unknown;

interface WebinarjamRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const webinarjamActionHandlers: ProviderActionHandlers<
  "webinarjam",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_webinars(_input, context) {
    const raw = await requestWebinarjam({
      path: "/webinars",
      form: {},
      context,
      phase: "execute",
    });
    return {
      webinars: readObjectArrayField(raw, ["webinars"]),
      raw,
    };
  },

  async get_webinar(input, context) {
    const raw = await requestWebinarjam({
      path: "/webinar",
      form: {
        webinar_id: input.webinarId,
      },
      context,
      phase: "execute",
    });
    return {
      webinar: readObjectFieldOrSelf(raw, "webinar"),
      raw,
    };
  },

  async list_registrants(input, context) {
    const raw = await requestWebinarjam({
      path: "/registrants",
      form: {
        webinar_id: input.webinarId,
        schedule_id: input.scheduleId,
        page: input.page,
        attended_live: input.attendedLive,
        attended_replay: input.attendedReplay,
        purchased: input.purchased,
        attended_live_timestamp: input.attendedLiveTimestamp,
        attended_replay_timestamp: input.attendedReplayTimestamp,
        date_range: input.dateRange,
        search: input.search,
      },
      context,
      phase: "execute",
    });
    return {
      registrants: readObjectArrayField(raw, ["registrants", "attendees", "users", "data"]),
      raw,
    };
  },

  async register_user(input, context) {
    const customFields = readCustomFields(input.customFields);
    const raw = await requestWebinarjam({
      path: "/register",
      form: {
        webinar_id: input.webinarId,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        schedule: input.schedule,
        country: input.country,
        state: input.state,
        timezone_id: input.timezoneId,
        ip_address: input.ipAddress,
        phone_country_code: input.phoneCountryCode,
        phone: input.phone,
        twilio_consent: input.twilioConsent,
        ...customFields,
      },
      context,
      phase: "execute",
    });
    return {
      registration: readObjectFieldOrSelf(raw, "user"),
      raw,
    };
  },
};

export async function validateWebinarjamCredential(
  input: WebinarjamRequestContext,
): Promise<CredentialValidationResult> {
  const raw = await requestWebinarjam({
    path: "/webinars",
    form: {},
    context: input,
    phase: "validate",
  });
  return {
    profile: {
      accountId: "webinarjam-api-key",
      displayName: "WebinarJam API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: webinarjamApiBaseUrl,
      validationEndpoint: "/webinars",
      webinarCount: readOptionalObjectArrayField(raw, ["webinars"])?.length,
    }),
  };
}

async function requestWebinarjam(input: {
  path: string;
  form: Record<string, WebinarjamFormValue>;
  context: WebinarjamRequestContext;
  phase: WebinarjamRequestPhase;
}): Promise<Record<string, unknown>> {
  const url = `${webinarjamApiBaseUrl}${input.path}`;
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body: buildWebinarjamForm({
        api_key: input.context.apiKey,
        ...input.form,
      }),
      signal: input.context.signal,
    });
    payload = await readWebinarjamPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `WebinarJam request failed: ${error.message}` : "WebinarJam request failed",
    );
  }

  if (!response.ok) {
    throw createWebinarjamError(response, payload, input.phase);
  }

  const providerStatusError = readProviderStatusError(payload);
  if (providerStatusError) {
    throw mapWebinarjamProviderStatusError(providerStatusError, input.phase);
  }

  return readObjectPayload(payload);
}

function buildWebinarjamForm(input: Record<string, WebinarjamFormValue>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === "") {
      continue;
    }
    if (isWebinarjamFormScalar(value)) {
      form.set(key, String(value));
      continue;
    }
    if (isWebinarjamCustomFieldArray(value)) {
      form.set(key, JSON.stringify(value));
      continue;
    }
    throw new ProviderRequestError(400, `webinarjam ${key} must be a form value`);
  }
  return form;
}

function isWebinarjamFormScalar(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isWebinarjamCustomFieldArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" || typeof item === "number")
  );
}

async function readWebinarjamPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "WebinarJam response was not a JSON object");
  }
  return record;
}

function createWebinarjamError(
  response: Response,
  payload: unknown,
  phase: WebinarjamRequestPhase,
): ProviderRequestError {
  const message = readWebinarjamMessage(payload) ?? `WebinarJam request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function readProviderStatusError(payload: unknown): string | null {
  const record = optionalRecord(payload);
  if (!record || typeof record.status !== "string") {
    return null;
  }

  const normalizedStatus = record.status.trim().toLowerCase();
  if (normalizedStatus === "" || normalizedStatus === "success" || normalizedStatus === "ok") {
    return null;
  }

  return readWebinarjamMessage(payload) ?? "WebinarJam request failed";
}

function mapWebinarjamProviderStatusError(message: string, phase: WebinarjamRequestPhase): ProviderRequestError {
  if (phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (message.toLowerCase().includes("api")) {
    return new ProviderRequestError(401, message);
  }
  return new ProviderRequestError(400, message);
}

function readWebinarjamMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "reason", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readObjectFieldOrSelf(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  return optionalRecord(payload[field]) ?? payload;
}

function readObjectArrayField(payload: Record<string, unknown>, fields: string[]): Array<Record<string, unknown>> {
  const array = readOptionalObjectArrayField(payload, fields);
  if (array) {
    return array;
  }
  throw new ProviderRequestError(502, `WebinarJam response missing array field: ${fields.join(" or ")}`);
}

function readOptionalObjectArrayField(
  payload: Record<string, unknown>,
  fields: string[],
): Array<Record<string, unknown>> | undefined {
  for (const field of fields) {
    const value = payload[field];
    if (Array.isArray(value)) {
      return value.map((item) => optionalRecord(item) ?? { value: item });
    }
  }

  const data = optionalRecord(payload.data);
  if (data) {
    return readOptionalObjectArrayField(data, fields);
  }
  return undefined;
}

function readCustomFields(value: unknown): Record<string, WebinarjamFormValue> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, child]) => {
      if (isWebinarjamFormScalar(child) || isWebinarjamCustomFieldArray(child)) {
        return [[key, child]];
      }
      return [];
    }),
  ) as Record<string, WebinarjamFormValue>;
}
