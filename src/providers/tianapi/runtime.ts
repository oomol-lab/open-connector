import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ProviderActionHandlers,
  ApiKeyProviderContext,
  ProviderRuntimeHandler,
  ProviderActionName,
} from "../provider-executors.ts";

import { setTimeout as delay } from "node:timers/promises";
import { optionalNumber, optionalRecord, optionalRawString, compactObject } from "../../core/cast.ts";
import { mapProviderActionSources } from "../provider-executors.ts";
import {
  providerInputError,
  providerResponseError,
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

interface TianapiRequest {
  path: string;
  query: Record<string, string | undefined>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  signal?: AbortSignal;
}

export const tianapiApiBaseUrl = "https://apis.tianapi.com";
const actionPaths = {
  list_zodiac_compatibilities: "/zodiac/index",
  get_account_usage: "/userinfo/index",
  list_network_trending: "/networkhot/index",
  list_netease_trending: "/networkhot/wangyi",
  list_phoenix_trending: "/networkhot/fenghuang",
  list_baidu_trending: "/nethot/index",
  list_weibo_trending: "/weibohot/index",
  list_douyin_trending: "/douyinhot/index",
  list_toutiao_trending: "/toutiaohot/index",
  list_tencent_trending: "/wxhottopic/index",
  get_daily_horoscope: "/star/index",
  get_constellation_compatibility: "/xingzuo/index",
  get_almanac: "/lunar/index",
  get_full_almanac: "/lunar/calendar",
  get_zodiac_compatibility: "/zodiac/index",
  get_blood_type_compatibility: "/blood/index",
  get_birthday_personality: "/dob/index",
  search_dream_interpretations: "/dream/index",
  get_number_fortune: "/jixiong/index",
  get_solar_term: "/jieqi/index",
  query_holidays: "/jiejiari/index",
};
const zodiacAnimals = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
const constellationNames = {
  aries: "白羊",
  taurus: "金牛",
  gemini: "双子",
  cancer: "巨蟹",
  leo: "狮子",
  virgo: "处女",
  libra: "天秤",
  scorpio: "天蝎",
  sagittarius: "射手",
  capricorn: "摩羯",
  aquarius: "水瓶",
  pisces: "双鱼",
};
type RequestPhase = "validate" | "execute";
export async function validateTianapiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestTianapiResult({
    path: "/userinfo/index",
    query: { apiid: "96" },
    apiKey: requiredInputString(apiKey, "apiKey"),
    fetcher,
    phase: "validate",
    signal,
  });
  return {
    profile: { displayName: "TianAPI API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tianapiApiBaseUrl,
      validationEndpoint: "/userinfo/index",
    },
  };
}
async function executeTianapiAction(
  actionName: ProviderActionName<"tianapi">,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  if (actionName === "list_zodiac_compatibilities") {
    return listZodiacCompatibilities(input, context);
  }
  const result = await requestTianapiResult({
    path: actionPaths[actionName],
    query: buildActionQuery(actionName, input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const expectsList =
    actionName.startsWith("list_") ||
    ["get_daily_horoscope", "search_dream_interpretations", "query_holidays"].includes(actionName);
  if (expectsList && !Array.isArray(result.list)) {
    throw providerResponseError("TianAPI result.list must be an array");
  }
  return result;
}
function buildActionQuery(
  actionName: ProviderActionName<"tianapi">,
  input: Record<string, unknown>,
): Record<string, string | undefined> {
  switch (actionName) {
    case "get_account_usage":
      return { apiid: String(input.apiId) };
    case "get_daily_horoscope":
      return compactObject({
        astro: normalizeSign(input.sign).english,
        date: optionalRawString(input.date),
      });
    case "get_constellation_compatibility": {
      if (input.compareWithAll === true && input.otherSign !== undefined) {
        throw providerInputError("otherSign and compareWithAll cannot be used together");
      }
      return compactObject({
        me: normalizeSign(input.sign).chinese,
        he: input.otherSign === undefined ? undefined : normalizeSign(input.otherSign).chinese,
        all: input.compareWithAll === true ? "1" : undefined,
      });
    }
    case "get_almanac": {
      const date = input.date === undefined ? undefined : requiredInputString(input.date, "date");
      if (input.calendar === "lunar") {
        if (!date) throw providerInputError("date is required for lunar queries");
        const rawParts = date.split("-");
        const parts = rawParts.map(Number);
        if (
          rawParts.some((part) => !part || [...part].some((character) => !"0123456789".includes(character))) ||
          parts.length !== 3 ||
          !parts.every(Number.isInteger) ||
          parts[0]! < 1970 ||
          parts[0]! > 2038 ||
          parts[1]! < 1 ||
          parts[1]! > 12 ||
          parts[2]! < 1 ||
          parts[2]! > 30
        ) {
          throw providerInputError("lunar date must be YYYY-M-D within years 1970-2038");
        }
        return { date: parts.join("-"), type: "1" };
      }
      if (date?.includes("-")) assertDateYear(date, 1970, 2038);
      else if (date !== undefined && [...date].some((character) => !"0123456789".includes(character))) {
        throw providerInputError("date must be YYYY-MM-DD or a Unix timestamp");
      }
      return compactObject({ date, type: "0" });
    }
    case "get_full_almanac": {
      const date = optionalRawString(input.date);
      if (date) assertDateYear(date, 1900, 2100);
      return compactObject({ date });
    }
    case "get_zodiac_compatibility":
      return {
        me: requiredInputString(input.animal, "animal"),
        he: requiredInputString(input.otherAnimal, "otherAnimal"),
      };
    case "get_blood_type_compatibility":
      return {
        me: requiredInputString(input.bloodType, "bloodType"),
        he: requiredInputString(input.otherBloodType, "otherBloodType"),
      };
    case "get_birthday_personality": {
      const month = Number(input.month);
      const day = Number(input.day);
      if (day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) {
        throw providerInputError("day is not valid for the birthday month");
      }
      return { m: String(month), d: String(day) };
    }
    case "search_dream_interpretations":
      return {
        word: requiredInputString(input.keyword, "keyword"),
        num: String(input.limit ?? 10),
        page: String(input.page ?? 1),
      };
    case "get_number_fortune":
      return { number: requiredInputString(input.number, "number") };
    case "get_solar_term":
      return compactObject({
        word: requiredInputString(input.name, "name"),
        year: input.year === undefined ? undefined : String(input.year),
      });
    case "query_holidays":
      return buildHolidayQuery(input);
    default:
      return {};
  }
}
function normalizeSign(value: unknown) {
  const sign = requiredInputString(value, "sign").toLowerCase();
  for (const [english, chinese] of Object.entries(constellationNames)) {
    if (sign === english || sign === chinese || sign === `${chinese}座`) return { english, chinese };
  }
  throw providerInputError("sign must be one of the twelve zodiac constellations");
}
function parseCalendarDate(value: string) {
  const parts = value.split("-");
  const [year, month, day] = parts.map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !part || [...part].some((character) => !"0123456789".includes(character))) ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month! < 1 ||
    month! > 12 ||
    day! < 1 ||
    day! > 31
  ) {
    throw providerInputError("date must be a valid YYYY-MM-DD Gregorian date");
  }
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw providerInputError("date must be a valid Gregorian date");
  }
  return { year: year!, month: month!, day: day!, time: date.getTime() };
}
function assertDateYear(value: string, minimum: number, maximum: number) {
  const { year } = parseCalendarDate(value);
  if (year < minimum || year > maximum) {
    throw providerInputError(`date year must be between ${minimum} and ${maximum}`);
  }
}
function buildHolidayQuery(input: Record<string, unknown>) {
  const date = requiredInputString(input.date, "date");
  const mode = optionalRawString(input.queryType) ?? "dates";
  const queryTypes: Record<string, string> = { dates: "0", year: "1", month: "2", range: "3" };
  if (mode === "year") {
    if (date.length !== 4 || [...date].some((character) => !"0123456789".includes(character))) {
      throw providerInputError("annual holiday queries require a YYYY year");
    }
  } else if (mode === "month") {
    const parts = date.split("-");
    if (parts.length !== 2 && parts.length !== 3) {
      throw providerInputError("monthly holiday queries require YYYY-MM or YYYY-MM-DD");
    }
    parseCalendarDate(parts.length === 2 ? `${date}-1` : date);
  } else if (mode === "range") {
    const parts = date.split("~").map((part) => part.trim());
    if (parts.length !== 2) throw providerInputError("holiday ranges require start~end");
    const start = parseCalendarDate(parts[0]!).time;
    const end = parseCalendarDate(parts[1]!).time;
    const days = (end - start) / 86400000 + 1;
    if (days < 1 || days > 31) throw providerInputError("holiday ranges must contain 1-31 dates");
  } else {
    const dates = date.split(",").map((part) => part.trim());
    if (dates.length > 31) throw providerInputError("holiday queries contain at most 31 dates");
    dates.forEach(parseCalendarDate);
  }
  return { date, type: queryTypes[mode]!, mode: input.includeFestivals === true ? "1" : "0" };
}
async function listZodiacCompatibilities(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const animal = requiredInputString(input.animal, "animal");
  const animals = zodiacAnimals.filter((other) => input.includeSelf === true || other !== animal);
  const list: Array<{
    animal: string;
    otherAnimal: string;
    result: Record<string, unknown>;
  }> = [];
  for (const otherAnimal of animals) {
    if (list.length > 0) await delay(350, undefined, { signal: context.signal });
    const result = await requestTianapiResult({
      path: "/zodiac/index",
      query: { me: animal, he: otherAnimal },
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    list.push({ animal, otherAnimal, result });
  }
  return { list };
}
async function requestTianapiResult(input: TianapiRequest) {
  const url = new URL(input.path, tianapiApiBaseUrl);
  for (const [name, value] of Object.entries(input.query)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  url.searchParams.set("key", input.apiKey);
  try {
    return await runProviderRequest({ signal: input.signal, label: "TianAPI" }, async (signal) => {
      const response = await input.fetcher(url, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": providerUserAgent },
        signal,
      });
      const text = await readProviderTextBody(response, "TianAPI response");
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          response.ok ? "TianAPI returned invalid JSON" : `TianAPI HTTP ${response.status}`,
          undefined,
          "provider_error",
        );
      }
      const envelope = optionalRecord(payload);
      const code = optionalNumber(envelope?.code);
      if (!response.ok || code !== 200) {
        throw createTianapiError(response.status, code, envelope?.msg, input.phase);
      }
      return requiredResponseRecord(envelope?.result, "TianAPI result");
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      const message = error.message
        .replaceAll(input.apiKey, "[REDACTED]")
        .replaceAll(encodeURIComponent(input.apiKey), "[REDACTED]")
        .replaceAll(new URLSearchParams({ key: input.apiKey }).toString().slice(4), "[REDACTED]");
      throw new ProviderRequestError(error.status, message, error.details, error.code);
    }
    throw error;
  }
}
function createTianapiError(status: number, code: number | undefined, value: unknown, phase: RequestPhase) {
  const detail = optionalRawString(value)?.trim();
  const message =
    code === undefined
      ? `TianAPI HTTP ${status}: ${detail || "missing business status code"}`
      : `TianAPI ${code}: ${detail || "request failed"}`;
  const data = { providerCode: code, upstreamStatus: status };
  if (code === 190 || code === 230) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      message,
      data,
      phase === "validate" ? "invalid_input" : "authorization_failed",
    );
  }
  if (code === 130 || status === 429) {
    return new ProviderRequestError(429, message, data, "rate_limited");
  }
  if (code !== undefined && [240, 260, 270, 280, 290].includes(code)) {
    return new ProviderRequestError(400, message, data, "invalid_input");
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, data, "provider_error");
}
export const tianapiActionHandlers: ProviderActionHandlers<
  "tianapi",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionSources(
  "tianapi",
  actionPaths,
  (name): ProviderRuntimeHandler<ApiKeyProviderContext> =>
    (input, context) =>
      executeTianapiAction(name, input, context),
);
