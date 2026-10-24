import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ProviderActionHandlers,
  ApiKeyProviderContext,
  ProviderRuntimeHandler,
  ProviderActionName,
} from "../provider-executors.ts";

import { setTimeout as delay } from "node:timers/promises";
import {
  optionalNumberLike,
  optionalRawString,
  optionalRecord,
  optionalNumber,
  recordOrEmpty,
  objectArray,
} from "../../core/cast.ts";
import { mapProviderActionSources } from "../provider-executors.ts";
import {
  providerInputError,
  readProviderJsonBody,
  providerResponseError,
  ProviderRequestError,
  readRetryAfterSeconds,
  providerUserAgent,
  isAbortLikeError,
  requiredInputString,
  requiredInputNumber,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { xingpanZodiacSigns } from "./constants.ts";

export const xingpanApiBaseUrl = "https://www.xingpan.vip/astrology";
const configPath = "/common/planetconfig";
const actionPaths = {
  get_chart_config: configPath,
  calculate_natal_chart: "/chart/natal",
  calculate_comparison_chart: "/chart/comparision",
  calculate_composite_chart: "/chart/composite",
  calculate_synastry_chart: "/chart/synastry",
  calculate_transit_chart: "/chart/transit",
  calculate_solar_return_chart: "/chart/solarreturn",
  calculate_lunar_return_chart: "/chart/lunarreturn",
  get_daily_horoscope: "/Horoscope/index",
};
interface XingpanBirth {
  birthday: string;
  longitude: number;
  latitude: number;
  timezone?: number;
}
interface ResolvedXingpanBirth extends XingpanBirth {
  timezone: number;
}
export async function validateXingpanCredential(
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<CredentialValidationResult> {
  requiredResponseRecord(
    await requestXingpan(
      configPath,
      new URLSearchParams(),
      requiredInputString(apiKey, "apiKey"),
      fetcher,
      "validate",
      undefined,
      callerSignal,
    ),
    "Xingpan response data",
  );
  return {
    profile: { displayName: "Xingpan API Token" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: xingpanApiBaseUrl,
      validationEndpoint: configPath,
    },
  };
}
async function executeXingpanAction(
  actionName: ProviderActionName<"xingpan">,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
) {
  if (actionName === "get_daily_horoscope") {
    const form = new URLSearchParams();
    const date = optionalRawString(input.date);
    if (date !== undefined) {
      normalizeLocalTime(`${date} 00:00:00`, "date");
      form.set("date", date.replaceAll("-", ""));
    }
    const sign = optionalRawString(input.sign);
    if (sign !== undefined) form.set("sign", String(xingpanZodiacSigns.indexOf(sign) + 1));
    const data = await requestXingpan(actionPaths[actionName], form, apiKey, fetcher, "execute", true, callerSignal);
    const horoscopes = Array.isArray(data)
      ? objectArray(data, "Xingpan horoscopes", providerResponseError)
      : [requiredResponseRecord(data, "Xingpan horoscope")];
    return { horoscopes };
  }
  const form =
    actionName === "get_chart_config"
      ? new URLSearchParams()
      : await buildChartForm(actionName, input, apiKey, fetcher, callerSignal);
  const data = requiredResponseRecord(
    await requestXingpan(actionPaths[actionName], form, apiKey, fetcher, "execute", undefined, callerSignal),
    "Xingpan response data",
  );
  return actionName === "get_chart_config" ? { config: data } : { chart: data };
}
async function buildChartForm(
  actionName: ProviderActionName<"xingpan">,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
) {
  const form = new URLSearchParams();
  for (const [field, value] of Object.entries({
    planets: input.planets ?? ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    planet_xs: input.asteroids,
    virtual: input.virtualPoints,
    planet_xf: input.fixedStars,
  })) {
    if (Array.isArray(value)) {
      for (const id of value) form.append(`${field}[]`, String(id));
    }
  }
  form.set("h_sys", requiredInputString(input.houseSystem ?? "K", "houseSystem").toUpperCase());
  form.set("svg_type", input.chartStyle === "basic" ? "1" : input.chartStyle === "advanced" ? "0" : "-1");
  const orbs = optionalRecord(input.aspectOrbs);
  if (orbs) {
    for (const [angle, orb] of Object.entries(orbs)) {
      const degrees = Number(angle);
      if (!angle.trim() || !Number.isFinite(degrees) || degrees < 0 || degrees > 180) {
        throw providerInputError("aspectOrbs keys must be angles between 0 and 180 degrees");
      }
      form.set(`phase[${degrees}]`, String(orb));
    }
  }
  const isReturn = actionName === "calculate_solar_return_chart" || actionName === "calculate_lunar_return_chart";
  const births = Array.isArray(input.people)
    ? input.people.map((person, index) => prepareBirth(person, `people[${index}].birthday`))
    : [prepareBirth(input.birth, "birth.birthday")];
  if (isReturn) {
    const reference = recordOrEmpty(input.returnReference);
    births.push(prepareBirth({ ...reference, birthday: reference.dateTime }, "returnReference.dateTime"));
  }
  const transit =
    actionName === "calculate_transit_chart"
      ? {
          birthday: normalizeLocalTime(input.transitDateTime, "transitDateTime"),
          longitude: births[0]!.longitude,
          latitude: births[0]!.latitude,
          timezone: optionalNumber(input.transitTimezone),
        }
      : undefined;
  const resolvedBirths: ResolvedXingpanBirth[] = [];
  for (const birth of births) resolvedBirths.push(await resolveBirthTimezone(birth, apiKey, fetcher, callerSignal));
  if (Array.isArray(input.people) || isReturn) {
    resolvedBirths.forEach((birth, index) => appendBirth(form, birth, `user_list[${index}]`));
  } else {
    const birth = resolvedBirths[0]!;
    appendBirth(form, birth, "");
    if (transit) {
      const target = await resolveBirthTimezone(transit, apiKey, fetcher, callerSignal);
      // Transit accepts one offset: shift the target clock into the birth offset while preserving its UTC instant.
      const milliseconds =
        Date.parse(`${target.birthday.replace(" ", "T")}Z`) + (birth.timezone - target.timezone) * 3600000;
      form.set("transitday", new Date(milliseconds).toISOString().slice(0, 19).replace("T", " "));
    }
  }
  if (actionName === "calculate_natal_chart") {
    form.set("is_corpus", input.includeCorpus ? "1" : "0");
    form.set("asp", input.includeAspectPatterns ? "1" : "0");
  }
  return form;
}
function normalizeLocalTime(value: unknown, fieldName: string) {
  const localTime = requiredInputString(value, fieldName);
  const birthday = localTime.length === 16 ? `${localTime}:00` : localTime;
  const instant = new Date(`${birthday.replace(" ", "T")}Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 19).replace("T", " ") !== birthday) {
    throw providerInputError(`${fieldName} must be a valid local calendar date and time`);
  }
  return birthday;
}
function prepareBirth(value: unknown, fieldName: string): XingpanBirth {
  const birth = recordOrEmpty(value);
  return {
    birthday: normalizeLocalTime(birth.birthday, fieldName),
    longitude: requiredInputNumber(birth.longitude, "longitude"),
    latitude: requiredInputNumber(birth.latitude, "latitude"),
    timezone: optionalNumber(birth.timezone),
  };
}
async function resolveBirthTimezone(
  birth: XingpanBirth,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<ResolvedXingpanBirth> {
  if (birth.timezone !== undefined) return { ...birth, timezone: birth.timezone };
  const form = new URLSearchParams({
    datetime: birth.birthday,
    longitude: String(birth.longitude),
    latitude: String(birth.latitude),
  });
  const data = requiredResponseRecord(
    await requestXingpan("/chart/timezone", form, apiKey, fetcher, "execute", undefined, callerSignal),
    "Xingpan timezone data",
  );
  const seconds = optionalNumberLike(data.utc_offset_seconds);
  if (seconds === undefined || Math.abs(seconds) > 14 * 3600) {
    throw providerResponseError("Xingpan timezone response is missing a valid utc_offset_seconds");
  }
  return { ...birth, timezone: seconds / 3600 };
}
function appendBirth(form: URLSearchParams, birth: ResolvedXingpanBirth, prefix: string) {
  for (const [field, entry] of Object.entries({
    birthday: birth.birthday,
    longitude: birth.longitude,
    latitude: birth.latitude,
    tz: birth.timezone,
  })) {
    form.set(prefix ? `${prefix}[${field}]` : field, String(entry));
  }
}
async function requestXingpan(
  path: string,
  form: URLSearchParams,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  allowStatusEnvelope = false,
  callerSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Xingpan", signal: callerSignal }, async (signal) => {
    form.set("access_token", apiKey);
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetcher(`${xingpanApiBaseUrl}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": providerUserAgent,
        },
        body: form.toString(),
        signal,
      });
      let payload: unknown;
      try {
        payload = await readProviderJsonBody(response, {
          emptyBody: null,
          invalidJsonMessage: "Xingpan returned invalid JSON",
        });
      } catch (error) {
        if (isAbortLikeError(error)) throw error;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          "Xingpan returned invalid JSON",
          undefined,
          "provider_error",
        );
      }
      const envelope = requiredResponseRecord(payload, "Xingpan response");
      const code = optionalNumberLike(envelope.code);
      // Retry only the documented frequency denial within the shared timeout and cancellation budget.
      if (code === 1000002 && attempt < 2) {
        await delay(Math.max(1100, (readRetryAfterSeconds(response.headers) ?? 1) * 1000), undefined, { signal });
        continue;
      }
      const upstreamMessage = optionalRawString(envelope.msg) ?? optionalRawString(envelope.message);
      const message = (upstreamMessage ?? "Xingpan request failed").replaceAll(apiKey, "[REDACTED]");
      if (code !== undefined && code !== 0) {
        const details = { upstreamCode: code };
        if (code === 1000001) {
          throw new ProviderRequestError(
            phase === "validate" ? 400 : 401,
            message,
            details,
            phase === "validate" ? "invalid_input" : "authorization_failed",
          );
        }
        if (code === 1000002 || code === 1000003 || response.status === 429) {
          throw new ProviderRequestError(429, message, details, "rate_limited");
        }
        if (code === 1000007 || (code >= 1060001 && code <= 1060008)) {
          throw new ProviderRequestError(400, message, details, "invalid_input");
        }
        throw new ProviderRequestError(response.ok ? 502 : response.status, message, details, "provider_error");
      }
      if (!response.ok) {
        throw new ProviderRequestError(
          response.status,
          message,
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      if (code !== 0 && !(allowStatusEnvelope && envelope.code === undefined && envelope.status === "success")) {
        throw providerResponseError(
          upstreamMessage === undefined ? "Xingpan response is missing a valid success code" : message,
        );
      }
      return removeEchoedToken(envelope.data, apiKey);
    }
  });
}
// Remove credential echoes from objects and text before returning or auditing successful output.
function removeEchoedToken(value: unknown, apiKey: string): unknown {
  if (Array.isArray(value)) return value.map((item) => removeEchoedToken(item, apiKey));
  const record = optionalRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => key !== "access_token")
        .map(([key, item]) => [key, removeEchoedToken(item, apiKey)]),
    );
  }
  const text = optionalRawString(value);
  return text === undefined ? value : text.replaceAll(apiKey, "[REDACTED]");
}
export const xingpanActionHandlers: ProviderActionHandlers<
  "xingpan",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionSources(
  "xingpan",
  actionPaths,
  (name): ProviderRuntimeHandler<ApiKeyProviderContext> =>
    (input, context) =>
      executeXingpanAction(name, input, context.apiKey, context.fetcher, context.signal),
);
