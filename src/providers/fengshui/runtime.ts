import type { ProviderActionHandlers, ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";

import { looseArray, optionalRecord, optionalRawString } from "../../core/cast.ts";
import { mapProviderActionSources } from "../provider-executors.ts";
import {
  readProviderJsonBody,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const fengshuiApiBaseUrl = "https://fengshui-api.com/api/v2";
export function requestFengshuiJson(
  path: string,
  params: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Feng Shui API", signal: callerSignal }, async (signal) => {
    const url = new URL(`${fengshuiApiBaseUrl}${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && name !== "type") {
        url.searchParams.set(name, String(value));
      }
    }
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "X-API-Key": apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    let payload: unknown;
    try {
      payload = await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Feng Shui API returned invalid JSON",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        response.ok
          ? "Feng Shui API returned invalid JSON"
          : `Feng Shui API request failed with status ${response.status}`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const problem = optionalRecord(payload);
      const detail = optionalRawString(problem?.detail) ?? optionalRawString(problem?.title);
      const errors = looseArray(problem?.errors).flatMap((value) => {
        const entry = optionalRecord(value);
        const message = optionalRawString(entry?.message);
        const parameter = optionalRawString(entry?.parameter);
        return message ? [parameter ? `${parameter}: ${message}` : message] : [];
      });
      const message =
        [detail, ...errors].filter(Boolean).join("; ") || `Feng Shui API request failed with status ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : response.status === 422 ? "invalid_input" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Feng Shui API response");
  });
}

const actionPaths = {
  get_zodiac_year: "/zodiac/year",
  get_zodiac_month: "/zodiac/month",
  get_zodiac_day: "/zodiac/day",
  get_zodiac_hour: "/zodiac/hour",
  get_zodiac_allies: "/zodiac/allies",
  get_zodiac_enemy: "/zodiac/enemy",
  get_zodiac_secret_friend: "/zodiac/secret-friend",
  get_zodiac_peach_blossom: "/zodiac/peach-blossom",
  get_compatibility: "/compatibility",
  get_kua: "/feng-shui/kua",
  get_eight_mansions: "/feng-shui/eight-mansions",
  get_flying_star: "/feng-shui/flying-star",
  check_lucky_dimension: "/feng-shui/lucky-dimension",
  get_key_status: "/me",
};
export const fengshuiActionHandlers: ProviderActionHandlers<
  "fengshui",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionSources(
  "fengshui",
  actionPaths,
  (name, path): ProviderRuntimeHandler<ApiKeyProviderContext> =>
    (input, context) => {
      const params = { ...input };
      if (
        [
          "get_zodiac_year",
          "get_zodiac_month",
          "get_zodiac_allies",
          "get_zodiac_enemy",
          "get_zodiac_secret_friend",
          "get_zodiac_peach_blossom",
          "get_compatibility",
          "get_kua",
        ].includes(name)
      )
        params.calendar ??= "lunar";
      if (name === "check_lucky_dimension") params.unit ??= "mm";
      for (const field of ["date", "date1", "date2"]) {
        const date = optionalRawString(params[field]);
        if (date !== undefined && (date < "1700-01-01" || date > "2300-12-31"))
          throw providerInputError(`${field} must be between 1700-01-01 and 2300-12-31`);
      }
      for (const field of ["animal", "animal1", "animal2"]) {
        const value = optionalRawString(params[field]);
        if (value !== undefined)
          params[field] = value.trim().slice(0, 1).toUpperCase() + value.trim().slice(1).toLowerCase();
      }
      const facing = optionalRawString(params.facing);
      if (facing !== undefined) params.facing = facing.trim();
      return requestFengshuiJson(
        name === "get_compatibility" ? `${path}/${params.type}` : path,
        params,
        context.apiKey,
        context.fetcher,
        context.signal,
      );
    },
);
