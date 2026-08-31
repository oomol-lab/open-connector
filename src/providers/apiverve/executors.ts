import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "apiverve";
const apiverveApiBaseUrl = "https://api.apiverve.com";
const apiverveDefaultRequestTimeoutMs = 30_000;

type ApivervePhase = "validate" | "execute";
type ApiverveQueryValue = number | string | undefined;
type ApiverveActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const apiverveActionHandlers: ProviderActionHandlers<"apiverve", ApiverveActionHandler> = {
  async get_word_definition(input, context) {
    const data = await requestApiverveData({
      path: "/v1/dictionary",
      params: {
        word: readRequiredString(input.word, "word"),
      },
      context,
      phase: "execute",
    });
    const record = readRequiredRecord(data, "data");

    return {
      word: readRequiredString(record.word, "word"),
      definitionCount: readRequiredNumber(record.definitionCount, "definitionCount"),
      definitions: readStringArray(record.definitions, "definitions"),
    };
  },
  async find_antonyms(input, context) {
    const data = await requestApiverveData({
      path: "/v1/antonym",
      params: {
        word: readRequiredString(input.word, "word"),
      },
      context,
      phase: "execute",
    });
    const record = readRequiredRecord(data, "data");

    return {
      word: readRequiredString(record.word, "word"),
      language: readNullableString(record.language),
      antonyms: readStringArray(record.antonyms, "antonyms"),
    };
  },
  async generate_advice(_input, context) {
    return normalizeAdvice(
      await requestApiverveData({
        path: "/v1/advice",
        params: {},
        context,
        phase: "execute",
      }),
    );
  },
  async convert_currency(input, context) {
    const data = await requestApiverveData({
      path: "/v1/currencyconverter",
      params: {
        value: readRequiredNumber(input.value, "value"),
        from: readUpperAlphaCode(input.from, "from", 3),
        to: readUpperAlphaCode(input.to, "to", 3),
      },
      context,
      phase: "execute",
    });
    const record = readRequiredRecord(data, "data");

    return {
      from: readRequiredString(record.from, "from"),
      to: readRequiredString(record.to, "to"),
      value: readRequiredNumber(record.value, "value"),
      convertedValue: readRequiredNumber(record.convertedValue, "convertedValue"),
      rate: readRequiredNumber(record.rate, "rate"),
      change24h: readNullableNumber(record.change24h),
      change24hPct: readNullableNumber(record.change24hPct),
      changeDirection: readNullableString(record.changeDirection),
      high24h: readNullableNumber(record.high24h),
      low24h: readNullableNumber(record.low24h),
    };
  },
  async calculate_age(input, context) {
    return normalizeAge(
      await requestApiverveData({
        path: "/v1/agecalculator",
        params: {
          dob: readRequiredString(input.dob, "dob"),
        },
        context,
        phase: "execute",
      }),
    );
  },
  async get_air_quality(input, context) {
    const data = await requestApiverveData({
      path: "/v1/airquality",
      params: compactObject({
        city: readOptionalString(input.city),
        zip: readOptionalString(input.zip),
      }),
      context,
      phase: "execute",
    });
    const record = readRequiredRecord(data, "data");

    return {
      pm25: readRequiredNumber(record.pm2_5, "pm2_5"),
      pm10: readRequiredNumber(record.pm10, "pm10"),
      carbonMonoxide: readRequiredNumber(record.carbonMonoxide, "carbonMonoxide"),
      ozone: readRequiredNumber(record.ozone, "ozone"),
      nitrogenDioxide: readRequiredNumber(record.nitrogenDioxide, "nitrogenDioxide"),
      sulfurDioxide: readRequiredNumber(record.sulfurdioxide, "sulfurdioxide"),
      usEpaIndex: readRequiredNumber(record.usEpaIndex, "usEpaIndex"),
      gbDefraIndex: readRequiredNumber(record.gbDefraIndex, "gbDefraIndex"),
      recommendation: readRequiredString(record.recommendation, "recommendation"),
      city: readNullableString(record.city),
    };
  },
  async get_airport_distance(input, context) {
    const data = await requestApiverveData({
      path: "/v1/airportdistance",
      params: {
        iata1: readUpperAlphaCode(input.iata1, "iata1", 3),
        iata2: readUpperAlphaCode(input.iata2, "iata2", 3),
      },
      context,
      phase: "execute",
    });
    const record = readRequiredRecord(data, "data");

    return {
      distanceMiles: readRequiredNumber(record.distanceMiles, "distanceMiles"),
      distanceKm: readRequiredNumber(record.distanceKm, "distanceKm"),
      distanceNauticalMiles: readRequiredNumber(record.distanceNauticalMiles, "distanceNauticalMiles"),
      estimatedFlightTime: readRequiredString(record.estimatedFlightTime, "estimatedFlightTime"),
      timezoneDiffHours: readNullableNumber(record.timezoneDiffHours),
      bearing: readNullableNumber(record.bearing),
      direction: readNullableString(record.direction),
      isInternational: readNullableBoolean(record.isInternational),
      carbonEstimateKg: readNullableNumber(record.carbonEstimateKg),
      airport1: normalizeDistanceAirport(record.airport1, "airport1"),
      airport2: normalizeDistanceAirport(record.airport2, "airport2"),
    };
  },
  async lookup_airport(input, context) {
    return normalizeAirport(
      await requestApiverveData({
        path: "/v1/airports",
        params: {
          iata: readUpperAlphaCode(input.iata, "iata", 3),
        },
        context,
        phase: "execute",
      }),
    );
  },
  async lookup_airlines(input, context) {
    const data = await requestApiverveData({
      path: "/v1/airlinelookup",
      params: compactObject({
        name: readOptionalString(input.name),
        iata: input.iata === undefined ? undefined : readUpperAlphaCode(input.iata, "iata", 2),
      }),
      context,
      phase: "execute",
    });

    return {
      airlines: readRecordArray(data, "data").map((item) => normalizeAirline(item)),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apiverveActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestApiverveData({
      path: "/v1/advice",
      params: {},
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        displayName: "APIVerve API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/advice",
        apiBaseUrl: apiverveApiBaseUrl,
      },
    };
  },
};

async function requestApiverveData(input: {
  path: string;
  params: Record<string, ApiverveQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: ApivervePhase;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(apiverveDefaultRequestTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(buildApiverveUrl(input.path, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": input.context.apiKey,
      },
      signal,
    });
    const payload = await readApivervePayload(response);

    if (!response.ok) {
      throw createApiverveError(response.status, payload, input.phase);
    }

    return extractApiverveData(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "APIVerve request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `APIVerve request failed: ${error.message}` : "APIVerve request failed",
    );
  }
}

function buildApiverveUrl(path: string, params: Record<string, ApiverveQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${apiverveApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readApivervePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "APIVerve returned invalid JSON");
  }
}

function extractApiverveData(payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "APIVerve returned an invalid payload", payload);
  }

  if (record.status === "error") {
    throw new ProviderRequestError(502, extractApiverveErrorMessage(record) ?? "APIVerve request failed", payload);
  }
  if (record.status !== "ok") {
    throw new ProviderRequestError(502, "APIVerve response envelope is missing", payload);
  }
  if (!Object.hasOwn(record, "data")) {
    throw new ProviderRequestError(502, "APIVerve response data is missing", payload);
  }

  return record.data;
}

function createApiverveError(status: number, payload: unknown, phase: ApivervePhase): ProviderRequestError {
  const message = extractApiverveErrorMessage(payload) ?? `APIVerve request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 405)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(500, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractApiverveErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeAdvice(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "data");

  return {
    id: readRequiredString(record.id, "id"),
    advice: readRequiredString(record.advice, "advice"),
    lang: readRequiredString(record.lang, "lang"),
  };
}

function normalizeAge(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "data");
  const insights = readRequiredRecord(record.insights, "insights");

  return {
    dob: readRequiredString(record.dob, "dob"),
    ageBreakdown: normalizeBreakdown(record.age_breakdown, "age_breakdown"),
    ageWords: normalizeAgeWords(record.age_words),
    timezone: readRequiredString(record.timezone, "timezone"),
    locale: readRequiredString(record.locale, "locale"),
    nextBirthday: normalizeNextBirthday(record.next_birthday),
    insights: {
      generation: readNullableString(insights.generation),
      zodiacSign: readNullableString(insights.zodiacSign),
      chineseZodiac: readNullableString(insights.chineseZodiac),
      birthstone: readNullableString(insights.birthstone),
      dayOfWeekBorn: readNullableString(insights.dayOfWeekBorn),
      isLeapYearBirth: readNullableBoolean(insights.isLeapYearBirth),
      milestones: normalizeMilestones(insights.milestones),
    },
  };
}

function normalizeAgeWords(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "age_words");

  return {
    years: readRequiredString(record.years, "age_words.years"),
    ordinal: readRequiredString(record.ordinal, "age_words.ordinal"),
    full: readRequiredString(record.full, "age_words.full"),
    locale: readRequiredString(record.locale, "age_words.locale"),
  };
}

function normalizeBreakdown(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readRequiredRecord(value, fieldName);

  return {
    years: readRequiredNumber(record.years, `${fieldName}.years`),
    months: readRequiredNumber(record.months, `${fieldName}.months`),
    weeks: readRequiredNumber(record.weeks, `${fieldName}.weeks`),
    days: readRequiredNumber(record.days, `${fieldName}.days`),
    hours: readRequiredNumber(record.hours, `${fieldName}.hours`),
    minutes: readRequiredNumber(record.minutes, `${fieldName}.minutes`),
    seconds: readRequiredNumber(record.seconds, `${fieldName}.seconds`),
  };
}

function normalizeNextBirthday(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "next_birthday");

  return {
    months: readRequiredNumber(record.months, "next_birthday.months"),
    weeks: readRequiredNumber(record.weeks, "next_birthday.weeks"),
    days: readRequiredNumber(record.days, "next_birthday.days"),
    hours: readRequiredNumber(record.hours, "next_birthday.hours"),
    minutes: readRequiredNumber(record.minutes, "next_birthday.minutes"),
    seconds: readRequiredNumber(record.seconds, "next_birthday.seconds"),
  };
}

function normalizeMilestones(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "milestones");

  return {
    canVoteUS: readNullableBoolean(record.canVoteUS),
    canDrinkUS: readNullableBoolean(record.canDrinkUS),
    canRentCarUS: readNullableBoolean(record.canRentCarUS),
    seniorDiscount: readNullableBoolean(record.seniorDiscount),
  };
}

function normalizeDistanceAirport(value: unknown, fieldName: string): Record<string, unknown> {
  const record = readRequiredRecord(value, fieldName);

  return {
    name: readRequiredString(record.name, `${fieldName}.name`),
    iata: readRequiredString(record.iata, `${fieldName}.iata`),
    icao: readRequiredString(record.icao, `${fieldName}.icao`),
    city: readRequiredString(record.city, `${fieldName}.city`),
    state: readNullableString(record.state),
    country: readRequiredString(record.country, `${fieldName}.country`),
    elevation: readNullableNumber(record.elevation),
    latitude: readRequiredNumber(record.latitude, `${fieldName}.latitude`),
    longitude: readRequiredNumber(record.longitude, `${fieldName}.longitude`),
    timezone: readNullableString(record.timezone),
  };
}

function normalizeAirport(value: unknown): Record<string, unknown> {
  const record = readRequiredRecord(value, "data");

  return {
    icao: readRequiredString(record.icao, "icao"),
    iata: readRequiredString(record.iata, "iata"),
    name: readRequiredString(record.name, "name"),
    city: readRequiredString(record.city, "city"),
    state: readNullableString(record.state),
    country: readRequiredString(record.country, "country"),
    elevation: readNullableNumber(record.elevation),
    latitude: readRequiredNumber(record.lat, "lat"),
    longitude: readRequiredNumber(record.lon, "lon"),
    timezone: readNullableString(record.tz),
    cityInfo: normalizeAirportCityInfo(record.city_info),
    raw: record,
  };
}

function normalizeAirportCityInfo(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    name: readRequiredString(record.name, "city_info.name"),
    altName: readNullableString(record.altName),
    country: readRequiredString(record.country, "city_info.country"),
  };
}

function normalizeAirline(record: Record<string, unknown>): Record<string, unknown> {
  return {
    name: readRequiredString(record.name, "name"),
    alias: readNullableString(record.alias),
    iata: readNullableString(record.iata),
    icao: readNullableString(record.icao),
    callsign: readNullableString(record.callsign),
    country: readNullableString(record.country),
    id: readNullableString(record.id),
    isLowCost: readNullableBoolean(record.islowcost),
    logoUrl: readNullableString(record.logourl),
    raw: record,
  };
}

function readRequiredRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `APIVerve response missing object field: ${fieldName}`, value);
  }
  return record;
}

function readRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `APIVerve response missing array field: ${fieldName}`, value);
  }

  return value.map((item, index) => readRequiredRecord(item, `${fieldName}.${index}`));
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `APIVerve response missing array field: ${fieldName}`, value);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `APIVerve response missing string field: ${fieldName}.${index}`, value);
    }
    return item;
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ProviderRequestError(502, `APIVerve response missing string field: ${fieldName}`, value);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readUpperAlphaCode(value: unknown, fieldName: string, length: number): string {
  const text = readRequiredString(value, fieldName).trim().toUpperCase();
  if (text.length !== length || ![...text].every((char) => char >= "A" && char <= "Z")) {
    throw new ProviderRequestError(400, `${fieldName} must be a ${length}-letter code`);
  }
  return text;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `APIVerve response missing numeric field: ${fieldName}`, value);
  }
  return value;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
