import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  compactObject,
  optionalBoolean,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const acuitySchedulingApiBaseUrl = "https://acuityscheduling.com/api/v1";
const acuitySchedulingRequestTimeoutMs = 30_000;

type AcuitySchedulingCredential = {
  userId: string;
  apiKey: string;
};

type AcuitySchedulingRequestPhase = "validate" | "execute";
type AcuitySchedulingQueryValue = string | number | boolean | readonly number[] | undefined;
export interface AcuitySchedulingActionContext {
  credential: AcuitySchedulingCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
type AcuitySchedulingActionHandler = (
  input: Record<string, unknown>,
  context: AcuitySchedulingActionContext,
) => Promise<unknown>;

export const acuitySchedulingActionHandlers: ProviderActionHandlers<
  "acuity_scheduling",
  AcuitySchedulingActionHandler
> = {
  async get_account(_input, context) {
    const payload = await requestAcuityScheduling({
      path: "/me",
      ...context,
      phase: "execute",
    });
    return { account: normalizeAccount(payload) };
  },
  async list_calendars(_input, context) {
    const payload = await requestAcuityScheduling({
      path: "/calendars",
      ...context,
      phase: "execute",
    });
    return {
      calendars: requireArray(payload, "calendar list").map(normalizeCalendar),
    };
  },
  async list_appointment_types(input, context) {
    const payload = await requestAcuityScheduling({
      path: "/appointment-types",
      query: { includeDeleted: optionalBoolean(input.includeDeleted) },
      ...context,
      phase: "execute",
    });
    return {
      appointmentTypes: requireArray(payload, "appointment type list").map(normalizeAppointmentType),
    };
  },
  async list_intake_forms(_input, context) {
    const payload = await requestAcuityScheduling({
      path: "/forms",
      ...context,
      phase: "execute",
    });
    return {
      forms: requireArray(payload, "intake form list").map(normalizeIntakeForm),
    };
  },
  async list_available_dates(input, context) {
    const payload = await requestAcuityScheduling({
      path: "/availability/dates",
      query: {
        month: optionalString(input.month),
        appointmentTypeID: optionalInteger(input.appointmentTypeId),
        calendarID: optionalInteger(input.calendarId),
        "addonIDs[]": readNumberArray(input.addonIds),
        timezone: optionalString(input.timezone),
      },
      ...context,
      phase: "execute",
    });
    return {
      dates: requireArray(payload, "available date list").map((item) =>
        requireResponseString(optionalRecord(item)?.date, "date"),
      ),
    };
  },
  async list_available_times(input, context) {
    const payload = await requestAcuityScheduling({
      path: "/availability/times",
      query: {
        date: optionalString(input.date),
        appointmentTypeID: optionalInteger(input.appointmentTypeId),
        calendarID: optionalInteger(input.calendarId),
        "addonIDs[]": readNumberArray(input.addonIds),
        timezone: optionalString(input.timezone),
        "ignoreAppointmentIDs[]": readNumberArray(input.ignoreAppointmentIds),
      },
      ...context,
      phase: "execute",
    });
    return {
      times: requireArray(payload, "available time list").map((item) =>
        requireResponseString(optionalRecord(item)?.time, "time"),
      ),
    };
  },
  async list_appointments(input, context) {
    const payload = await requestAcuityScheduling({
      path: "/appointments",
      query: {
        max: optionalInteger(input.max),
        minDate: optionalString(input.minDate),
        maxDate: optionalString(input.maxDate),
        calendarID: optionalInteger(input.calendarId),
        appointmentTypeID: optionalInteger(input.appointmentTypeId),
        canceled: optionalBoolean(input.canceled),
        showall: optionalBoolean(input.showAll),
        firstName: optionalString(input.firstName),
        lastName: optionalString(input.lastName),
        email: optionalString(input.email),
        phone: optionalString(input.phone),
        excludeForms: optionalBoolean(input.excludeForms),
        direction: optionalString(input.direction),
      },
      ...context,
      phase: "execute",
    });
    return {
      appointments: requireArray(payload, "appointment list").map((appointment) => normalizeAppointment(appointment)),
    };
  },
  async get_appointment(input, context) {
    const appointmentId = requireInputInteger(input.appointmentId, "appointmentId");
    const payload = await requestAcuityScheduling({
      path: `/appointments/${appointmentId}`,
      query: { pastFormAnswers: optionalBoolean(input.pastFormAnswers) },
      ...context,
      phase: "execute",
    });
    return { appointment: normalizeAppointment(payload) };
  },
  async create_appointment(input, context) {
    const payload = await requestAcuityScheduling({
      method: "POST",
      path: "/appointments",
      query: buildRequestControlQuery(input),
      body: compactObject({
        datetime: optionalString(input.datetime),
        appointmentTypeID: optionalInteger(input.appointmentTypeId),
        calendarID: optionalInteger(input.calendarId),
        timezone: optionalString(input.timezone),
        addonIDs: readNumberArray(input.addonIds),
        ...buildAppointmentWriteBody(input),
      }),
      ...context,
      phase: "execute",
    });
    return { appointment: normalizeAppointment(payload) };
  },
  async update_appointment(input, context) {
    const appointmentId = requireInputInteger(input.appointmentId, "appointmentId");
    const payload = await requestAcuityScheduling({
      method: "PUT",
      path: `/appointments/${appointmentId}`,
      query: { admin: optionalBoolean(input.admin) },
      body: buildAppointmentWriteBody(input),
      ...context,
      phase: "execute",
    });
    return { appointment: normalizeAppointment(payload) };
  },
  async reschedule_appointment(input, context) {
    const appointmentId = requireInputInteger(input.appointmentId, "appointmentId");
    const payload = await requestAcuityScheduling({
      method: "PUT",
      path: `/appointments/${appointmentId}/reschedule`,
      query: buildRequestControlQuery(input),
      body: compactObject({
        datetime: optionalString(input.datetime),
        calendarID: input.calendarId === null ? null : optionalInteger(input.calendarId),
        timezone: optionalString(input.timezone),
      }),
      ...context,
      phase: "execute",
    });
    return { appointment: normalizeAppointment(payload) };
  },
  async cancel_appointment(input, context) {
    const appointmentId = requireInputInteger(input.appointmentId, "appointmentId");
    const payload = await requestAcuityScheduling({
      method: "PUT",
      path: `/appointments/${appointmentId}/cancel`,
      query: buildRequestControlQuery(input),
      body: compactObject({
        cancelNote: optionalString(input.cancelNote),
        noShow: optionalBoolean(input.noShow),
      }),
      ...context,
      phase: "execute",
    });
    return { appointment: normalizeAppointment(payload, { canceled: true }) };
  },
};

export async function validateAcuitySchedulingCredential(
  input: { apiKey: string; userId: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveAcuitySchedulingCredential(input);
  const payload = await requestAcuityScheduling({
    path: "/me",
    credential,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = normalizeAccount(payload);

  return {
    profile: {
      accountId: `acuity_scheduling:${account.id}`,
      displayName: account.name ?? account.email ?? `Acuity Scheduling ${credential.userId}`,
    },
    grantedScopes: [],
    metadata: {
      userId: credential.userId,
      accountId: account.id,
      apiBaseUrl: acuitySchedulingApiBaseUrl,
      validationEndpoint: "/me",
    },
  };
}

export function resolveAcuitySchedulingCredential(input: {
  apiKey?: string;
  userId?: string;
}): AcuitySchedulingCredential {
  const userId = input.userId?.trim() ?? "";
  const numericUserId = Number(userId);
  if (!userId || !Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
    throw new ProviderRequestError(400, "userId must be a positive numeric Acuity User ID");
  }

  return {
    apiKey:
      input.apiKey?.trim() ||
      (() => {
        throw new ProviderRequestError(400, "apiKey is required");
      })(),
    userId,
  };
}

async function requestAcuityScheduling(input: {
  credential: AcuitySchedulingCredential;
  fetcher: typeof fetch;
  path: string;
  phase: AcuitySchedulingRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, AcuitySchedulingQueryValue>;
  body?: unknown;
}) {
  const timeoutHandle = createProviderTimeout(input.signal, acuitySchedulingRequestTimeoutMs);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.credential.userId}:${input.credential.apiKey}`).toString("base64")}`,
    "user-agent": providerUserAgent,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  try {
    const response = await input.fetcher(buildAcuitySchedulingUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeoutHandle.signal,
    });
    const payload = await readAcuitySchedulingPayload(response);
    if (!response.ok) {
      throw createAcuitySchedulingError(response.status, payload, input.phase);
    }
    if (payload === null) {
      throw new ProviderRequestError(502, "Acuity Scheduling returned an empty response");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Acuity Scheduling request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Acuity Scheduling request failed: ${error.message}`
        : "Acuity Scheduling request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildAcuitySchedulingUrl(path: string, query: Record<string, AcuitySchedulingQueryValue> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${acuitySchedulingApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readAcuitySchedulingPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Acuity Scheduling returned invalid JSON");
  }
}

function createAcuitySchedulingError(status: number, payload: unknown, phase: AcuitySchedulingRequestPhase) {
  const message =
    extractAcuitySchedulingErrorMessage(payload) ?? `Acuity Scheduling request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractAcuitySchedulingErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message)?.trim() ??
    optionalString(record?.error)?.trim() ??
    optionalString(record?.detail)?.trim()
  );
}

function buildRequestControlQuery(input: Record<string, unknown>) {
  return {
    admin: optionalBoolean(input.admin),
    noEmail: optionalBoolean(input.noEmail),
  };
}

function buildAppointmentWriteBody(input: Record<string, unknown>) {
  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    email: optionalString(input.email),
    phone: optionalString(input.phone),
    certificate: optionalString(input.certificate),
    fields: readObjectArray(input.fields),
    notes: optionalString(input.notes),
    labels: readUnknownArray(input.labels),
    smsOptIn: optionalBoolean(input.smsOptIn),
  });
}

function normalizeAccount(value: unknown) {
  const record = requireObject(value, "account");
  return {
    id: requireResponseInteger(record.id, "id"),
    name: nullableString(record.name),
    email: nullableString(record.email),
    timezone: nullableString(record.timezone),
    currency: nullableString(record.currency),
    schedulingPage: nullableString(record.schedulingPage),
    plan: nullableString(record.plan),
    raw: record,
  };
}

function normalizeCalendar(value: unknown) {
  const record = requireObject(value, "calendar");
  return {
    id: requireResponseInteger(record.id, "id"),
    name: requireResponseString(record.name, "name"),
    email: nullableString(record.email),
    timezone: nullableString(record.timezone),
    description: nullableString(record.description),
    raw: record,
  };
}

function normalizeAppointmentType(value: unknown) {
  const record = requireObject(value, "appointment type");
  return {
    id: requireResponseInteger(record.id, "id"),
    name: requireResponseString(record.name, "name"),
    duration: nullableInteger(record.duration),
    price: nullableScalarString(record.price),
    category: nullableString(record.category),
    active: nullableBoolean(record.active),
    raw: record,
  };
}

function normalizeIntakeForm(value: unknown) {
  const record = requireObject(value, "intake form");
  return {
    id: requireResponseInteger(record.id, "id"),
    name: requireResponseString(record.name, "name"),
    description: nullableString(record.description),
    fields: readObjectArray(record.fields) ?? [],
    raw: record,
  };
}

function normalizeAppointment(value: unknown, overrides: { canceled?: boolean } = {}) {
  const record = requireObject(value, "appointment");
  return {
    id: requireResponseInteger(record.id, "id"),
    firstName: nullableString(record.firstName),
    lastName: nullableString(record.lastName),
    email: nullableString(record.email),
    phone: nullableString(record.phone),
    datetime: nullableString(record.datetime),
    date: nullableString(record.date),
    time: nullableString(record.time),
    endTime: nullableString(record.endTime),
    timezone: nullableString(record.timezone),
    type: nullableString(record.type),
    appointmentTypeId: nullableInteger(record.appointmentTypeID),
    calendar: nullableString(record.calendar),
    calendarId: nullableInteger(record.calendarID),
    duration: nullableInteger(record.duration),
    canceled: overrides.canceled ?? optionalBoolean(record.canceled) ?? "noShow" in record,
    noShow: optionalBoolean(record.noShow) ?? false,
    notes: nullableString(record.notes),
    labels: readUnknownArray(record.labels) ?? [],
    forms: readObjectArray(record.forms) ?? [],
    raw: record,
  };
}

function requireObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Acuity Scheduling ${label} response must be an object`);
  }
  return record;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Acuity Scheduling ${label} response must be an array`);
  }
  return value;
}

function requireInputInteger(value: unknown, fieldName: string) {
  const number = optionalInteger(value);
  if (number === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return number;
}

function requireResponseInteger(value: unknown, fieldName: string) {
  const number = optionalInteger(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `Acuity Scheduling response field ${fieldName} must be an integer`);
  }
  return number;
}

function requireResponseString(value: unknown, fieldName: string) {
  const string = optionalString(value)?.trim();
  if (!string) {
    throw new ProviderRequestError(502, `Acuity Scheduling response field ${fieldName} must be a string`);
  }
  return string;
}

function nullableString(value: unknown) {
  return optionalString(value) ?? null;
}

function nullableScalarString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  const number = optionalNumber(value);
  return number === undefined ? null : String(number);
}

function nullableInteger(value: unknown) {
  return optionalInteger(value) ?? null;
}

function nullableBoolean(value: unknown) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return optionalBoolean(value) ?? null;
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalInteger(item)).filter((item) => item !== undefined);
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map(optionalRecord).filter((item) => item !== undefined);
}

function readUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}
