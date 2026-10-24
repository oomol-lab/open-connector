import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalNumber, optionalRecord, optionalRawString, rawStringOrNull } from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const yuanfenjuApiBaseUrl = "https://api.yuanfenju.com/index.php/v1/";
export const yuanfenjuAccountPath = "Free/querymerchant";
interface YuanfenjuResponse {
  data: unknown;
  notice: string | null;
}
export async function requestYuanfenju(
  path: string,
  fields: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<YuanfenjuResponse> {
  return runProviderRequest({ signal: context.signal, label: "yuanfenju" }, async (signal) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) body.set(key, String(value));
    }
    body.set("api_key", context.apiKey);
    const response = await context.fetcher(new URL(path, yuanfenjuApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: body.toString(),
      signal,
      redirect: "manual",
    });
    const text = await readProviderTextBody(response, "Yuanfenju response");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "yuanfenju returned a non-JSON response",
        undefined,
        "provider_error",
      );
    }
    const envelope = optionalRecord(payload);
    const errorCode = envelope?.errcode;
    // Nonzero business codes cannot reliably distinguish keys from membership or quota failures.
    if (!response.ok || (envelope && errorCode !== 0 && errorCode !== "0")) {
      const message = optionalRawString(envelope?.errmsg) ?? optionalRawString(payload) ?? "yuanfenju request failed";
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        errorCode === undefined ? message : `${message} (errcode: ${String(errorCode)})`,
        undefined,
        "provider_error",
      );
    }
    const successfulEnvelope = requiredResponseRecord(envelope, "yuanfenju response");
    if (!Object.hasOwn(successfulEnvelope, "data") || successfulEnvelope.data === null) {
      throw providerResponseError("yuanfenju response is missing data");
    }
    return { data: successfulEnvelope.data, notice: rawStringOrNull(successfulEnvelope.notice) };
  });
}
function validateGregorianDate(year: number, month: number, day: number, fromResponse = false) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ProviderRequestError(
      fromResponse ? 502 : 400,
      fromResponse ? "yuanfenju returned an invalid Gregorian date" : "the Gregorian date is invalid",
      undefined,
      fromResponse ? "provider_error" : "invalid_input",
    );
  }
}
async function convertCalendar(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (input.direction === "solar_to_lunar") {
    validateGregorianDate(input.year as number, input.month as number, input.day as number);
  }
  const result = await requestYuanfenju(
    "Gongju/solarlunartrans",
    {
      type: input.direction === "solar_to_lunar" ? 0 : 1,
      year: input.year,
      month: input.month,
      day: input.day,
      hours: input.hour ?? 0,
      minute: input.minute ?? 0,
      second: input.second ?? 0,
    },
    context,
  );
  return {
    date: requiredResponseRecord(result.data, "yuanfenju converted date"),
    notice: result.notice,
  };
}
function validateTimezone(timezone: string) {
  try {
    if (timezone.startsWith("+") || timezone.startsWith("-")) throw new Error("fixed offset is not an IANA timezone");
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw providerInputError("timezone must be a valid IANA timezone");
  }
}
function validateCoordinates(input: Record<string, unknown>) {
  for (const key of ["longitude", "latitude"]) {
    const value = optionalNumber(input[key]);
    if (value !== undefined && Math.abs(value - Math.round(value * 1000000) / 1000000) > 1e-12) {
      throw providerInputError(`${key} supports at most six decimal places`);
    }
  }
}
async function normalizeBirthDate(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  let date: Record<string, unknown> = {
    year: input.year,
    month: input.month,
    day: input.day,
    hours: input.hour,
    minute: input.minute ?? 0,
  };
  const isLunar = input.calendarType === "lunar";
  const convertLunar = isLunar && (input.year as number) >= 1900 && (input.year as number) <= 2100;
  if (convertLunar) {
    const converted = await convertCalendar({ ...input, direction: "lunar_to_solar" }, context);
    const parts = ["year", "month", "day", "hour", "minute"].map((part) =>
      optionalNumber(converted.date[`solar_${part}`]),
    );
    if (
      parts.some((part) => part === undefined || !Number.isInteger(part)) ||
      parts[3]! < 0 ||
      parts[3]! > 23 ||
      parts[4]! < 0 ||
      parts[4]! > 59
    ) {
      throw providerResponseError(
        "yuanfenju conversion has missing or invalid Gregorian date/time fields required for the chart",
      );
    }
    date = { year: parts[0], month: parts[1], day: parts[2], hours: parts[3], minute: parts[4] };
  }
  if (!isLunar || convertLunar)
    validateGregorianDate(date.year as number, date.month as number, date.day as number, convertLunar);
  return { type: isLunar && !convertLunar ? 0 : 1, ...date };
}
async function requestTraditionalChart(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  defaultSect: number,
) {
  const mode = input.trueSolarTime ?? "none";
  const timezone = input.timezone ?? "Asia/Shanghai";
  if (mode === "global") {
    validateTimezone(timezone as string);
    validateCoordinates(input);
  }
  const date = await normalizeBirthDate(input, context);
  const result = await requestYuanfenju(
    path,
    {
      name: input.name,
      sex: input.sex === "male" ? 0 : 1,
      ...date,
      sect: input.sect ?? defaultSect,
      zhen: mode === "china" ? 1 : mode === "global" ? 3 : 2,
      province: mode === "china" ? input.province : undefined,
      city: mode === "china" ? input.city : undefined,
      longitude: mode === "global" ? input.longitude : undefined,
      latitude: mode === "global" ? input.latitude : undefined,
      timezone: mode === "global" ? timezone : undefined,
      lang: input.language ?? "zh-cn",
      factor: path === "Bazi/cesuan" ? (input.adjustInterpretations ? 1 : 0) : undefined,
    },
    context,
  );
  return {
    data: requiredResponseRecord(result.data, `yuanfenju ${path} result`),
    notice: result.notice,
  };
}
async function analyzeBaziCompatibility(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const first = input.firstPerson as Record<string, unknown>;
  const second = input.secondPerson as Record<string, unknown>;
  for (const person of [first, second]) {
    if (person.calendarType !== "lunar")
      validateGregorianDate(person.year as number, person.month as number, person.day as number);
  }
  const firstDate = await normalizeBirthDate(first, context);
  const secondDate = await normalizeBirthDate(second, context);
  const fields: Record<string, unknown> = {
    mode: input.scoringMode === "traditional" ? 1 : 2,
    lang: input.language ?? "zh-cn",
  };
  const partners: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["male", first, firstDate],
    ["female", second, secondDate],
  ];
  for (const [prefix, person, date] of partners) {
    fields[`${prefix}_name`] = person.name;
    for (const [key, value] of Object.entries(date)) fields[`${prefix}_${key}`] = value;
  }
  const result = await requestYuanfenju(input.scenario === "marriage" ? "Bazi/hehun" : "Bazi/hepan", fields, context);
  return {
    analysis: requiredResponseRecord(result.data, "yuanfenju compatibility analysis"),
    notice: result.notice,
  };
}
async function getNatalChart(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  validateGregorianDate(input.year as number, input.month as number, input.day as number);
  validateTimezone((input.timezone ?? "Asia/Shanghai") as string);
  validateCoordinates(input);
  const customOrbs = input.customOrbs as Record<string, unknown> | undefined;
  const orbModels: Record<string, number> = { strict: 1, standard: 2, wide: 3, custom: 4 };
  const fields: Record<string, unknown> = {
    year: input.year,
    month: input.month,
    day: input.day,
    hours: input.hour,
    minute: input.minute ?? 0,
    sex: input.sex === "male" ? 0 : 1,
    longitude: input.longitude,
    latitude: input.latitude,
    timezone: input.timezone ?? "Asia/Shanghai",
    house_system: input.houseSystem ?? "P",
    additional_objects: Array.isArray(input.additionalObjects) ? input.additionalObjects.join(",") : undefined,
    orb_model: orbModels[(input.orbModel ?? "standard") as string],
    lang: input.language ?? "zh-cn",
    compress: 1,
  };
  for (const [aspect, value] of Object.entries(customOrbs ?? {})) fields[`orb_${aspect}`] = value;
  const result = await requestYuanfenju("Astrology/natal", fields, context);
  return {
    chart: requiredResponseRecord(result.data, "yuanfenju natal chart"),
    notice: result.notice,
  };
}
export const yuanfenjuActionHandlers: ProviderActionHandlers<
  "yuanfenju",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  get_account: async (input, context) => {
    const result = await requestYuanfenju(yuanfenjuAccountPath, {}, context);
    return {
      account: requiredResponseRecord(result.data, "yuanfenju account"),
      notice: result.notice,
    };
  },
  get_bazi_chart: async (input, context) => {
    const result = await requestTraditionalChart("Bazi/pan", input, context, 2);
    return { chart: result.data, notice: result.notice };
  },
  interpret_bazi: async (input, context) => {
    const result = await requestTraditionalChart("Bazi/cesuan", input, context, 1);
    return { reading: result.data, notice: result.notice };
  },
  get_ziwei_chart: async (input, context) => {
    const result = await requestTraditionalChart("Bazi/zwpan", input, context, 2);
    return { chart: result.data, notice: result.notice };
  },
  analyze_bazi_compatibility: async (input, context) => {
    return analyzeBaziCompatibility(input, context);
  },
  get_natal_chart: async (input, context) => {
    return getNatalChart(input, context);
  },
  get_annual_usage: async (input, context) => {
    const result = await requestYuanfenju("Free/querytimes", {}, context);
    return {
      usage: requiredResponseRecord(result.data, "yuanfenju annual usage"),
      notice: result.notice,
    };
  },
  find_auspicious_dates: async (input, context) => {
    const periods: Record<string, number> = {
      seven_days: 0,
      half_month: 1,
      one_month: 2,
      three_months: 3,
    };
    const result = await requestYuanfenju(
      "Gongju/zeshi",
      {
        future: periods[(input.period ?? "seven_days") as string],
        incident: input.activityId,
        lang: input.language ?? "zh-cn",
      },
      context,
    );
    return {
      selection: requiredResponseRecord(result.data, "yuanfenju date selection"),
      notice: result.notice,
    };
  },
  convert_calendar: async (input, context) => {
    return convertCalendar(input, context);
  },
  interpret_tarot: async (input, context) => {
    const result = await requestYuanfenju(
      "Zhanbu/taluojiedu",
      { spread_id: input.spreadId, topic_id: input.topicId, lang: input.language ?? "zh-cn" },
      context,
    );
    return {
      reading: requiredResponseRecord(result.data, "yuanfenju tarot reading"),
      notice: result.notice,
    };
  },
  get_almanac: async (input, context) => {
    const result = await requestYuanfenju(
      "Gongju/laohuangli",
      { title_laohuangli: input.date, lang: input.language ?? "zh-cn" },
      context,
    );
    return {
      almanac: requiredResponseRecord(result.data, "yuanfenju almanac"),
      notice: result.notice,
    };
  },
  get_solar_terms: async (input, context) => {
    if (input.calendarType !== "lunar")
      validateGregorianDate(input.year as number, input.month as number, input.day as number);
    const result = await requestYuanfenju(
      "Gongju/jieqi",
      {
        type: input.calendarType === "lunar" ? 0 : 1,
        year: input.year,
        month: input.month,
        day: input.day,
        jieqi: input.includeAllTerms ? 1 : 0,
      },
      context,
    );
    if (!Array.isArray(result.data)) throw providerResponseError("yuanfenju solar terms must be an array");
    return { terms: result.data, notice: result.notice };
  },
};
