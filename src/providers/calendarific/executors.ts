import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "calendarific";
const calendarificApiBaseUrl = "https://calendarific.com/api/v2";

type CalendarificPhase = "validate" | "execute";
type CalendarificActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const calendarificActionHandlers: ProviderActionHandlers<"calendarific", CalendarificActionHandler> = {
  async list_supported_countries(_input, context) {
    const payload = await requestCalendarificJson({
      path: "/countries",
      params: {},
      context,
      phase: "execute",
    });
    const response = requireResponseRecord(payload);

    return {
      meta: normalizeMeta(payload.meta),
      countries: normalizeCountryList(response.countries),
    };
  },

  async list_supported_languages(_input, context) {
    const payload = await requestCalendarificJson({
      path: "/languages",
      params: {},
      context,
      phase: "execute",
    });
    const response = requireResponseRecord(payload);

    return {
      meta: normalizeMeta(payload.meta),
      languages: normalizeLanguageList(response.languages),
    };
  },

  async get_holidays(input, context) {
    const holidayTypes = readStringList(input.type);
    const payload = await requestCalendarificJson({
      path: "/holidays",
      params: compactObject({
        country: readRequiredCountryCode(input.country),
        year: String(readRequiredNumber(input.year, "year")),
        month: readOptionalNumberString(input.month),
        day: readOptionalNumberString(input.day),
        location: optionalString(input.location),
        type: holidayTypes.length > 0 ? holidayTypes.join(",") : undefined,
        language: optionalString(input.language),
        uuid: typeof input.uuid === "boolean" ? String(input.uuid) : undefined,
      }),
      context,
      phase: "execute",
    });
    const response = requireResponseRecord(payload);

    return {
      meta: normalizeMeta(payload.meta),
      holidays: normalizeHolidayList(response.holidays),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, calendarificActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestCalendarificJson({
      path: "/countries",
      params: {},
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const response = requireResponseRecord(payload);
    const countries = normalizeCountryList(response.countries);
    const firstCountry = countries[0];

    return {
      profile: {
        accountId: "calendarific",
        displayName: "Calendarific API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/countries",
        countryCount: countries.length,
        firstCountryName: firstCountry?.name,
        firstCountryCode: firstCountry?.isoCode,
      }),
    };
  },
};

async function requestCalendarificJson(input: {
  path: string;
  params: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: CalendarificPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.context.signal, label: "Calendarific" }, async (signal) => {
    const response = await input.context.fetcher(buildCalendarificUrl(input.path, input.context.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readCalendarificPayload(response);

    if (!response.ok) {
      throw createCalendarificError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Calendarific returned an invalid payload");
    }
    return payloadRecord;
  });
}

function buildCalendarificUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${calendarificApiBaseUrl}/`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readCalendarificPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Calendarific returned invalid JSON");
  }
}

function createCalendarificError(status: number, payload: unknown, phase: CalendarificPhase): ProviderRequestError {
  const message = extractCalendarificErrorMessage(payload) ?? `Calendarific request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractCalendarificErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelError = optionalString(record.error);
  if (topLevelError) {
    return topLevelError;
  }

  const meta = optionalRecord(record.meta);
  return optionalString(meta?.error_detail) ?? optionalString(meta?.error_message);
}

function normalizeMeta(value: unknown): Record<string, number> {
  const meta = optionalRecord(value);
  return {
    code: optionalInteger(meta?.code) ?? 200,
  };
}

function requireResponseRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const response = optionalRecord(payload.response);
  if (!response) {
    throw new ProviderRequestError(502, "Calendarific response envelope is missing");
  }
  return response;
}

function normalizeCountryList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      name: optionalString(item.country_name) ?? "",
      isoCode: optionalString(item["iso-3166"]) ?? "",
      totalHolidays: optionalInteger(item.total_holidays) ?? null,
      supportedLanguages: optionalInteger(item.supported_languages) ?? null,
      raw: item,
    }));
}

function normalizeLanguageList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      code: optionalString(item.key) ?? "",
      name: optionalString(item.value) ?? "",
      raw: item,
    }));
}

function normalizeHolidayList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => {
      const date = optionalRecord(item.date);
      const datetime = optionalRecord(date?.datetime);
      const holidayTypes = Array.isArray(item.type)
        ? item.type.filter((entry): entry is string => typeof entry === "string")
        : [];

      return {
        name: optionalString(item.name) ?? "",
        description: optionalString(item.description) ?? null,
        dateIso: optionalString(date?.iso) ?? null,
        date: {
          iso: optionalString(date?.iso) ?? null,
          datetime: {
            year: optionalInteger(datetime?.year) ?? null,
            month: optionalInteger(datetime?.month) ?? null,
            day: optionalInteger(datetime?.day) ?? null,
          },
        },
        type: holidayTypes,
        primaryType: holidayTypes[0] ?? null,
        locations: optionalString(item.locations) ?? null,
        states: optionalString(item.states) ?? null,
        uuid: optionalString(item.uuid) ?? null,
        raw: item,
      };
    });
}

function readRequiredCountryCode(value: unknown): string {
  return requiredString(value, "country").toUpperCase();
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalNumberString(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return String(value);
}
