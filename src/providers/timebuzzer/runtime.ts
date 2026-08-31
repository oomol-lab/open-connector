import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const timebuzzerApiBaseUrl = "https://my.timebuzzer.com";
const apiPath = "/open-api";

export const timebuzzerActionHandlers: ProviderActionHandlers<
  "timebuzzer",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  get_current_user: (_input, context) => requestTimebuzzer("/account/me", {}, context, "execute"),
  async list_layers(_input, context) {
    return { layers: requireArray(await requestTimebuzzer("/layers", {}, context, "execute"), "layers") };
  },
  async list_tiles(input, context) {
    return {
      tiles: requireArray(
        await requestTimebuzzer(
          "/tiles",
          { query: queryParams({ archived: optionalString(input.archived) }) },
          context,
          "execute",
        ),
        "tiles",
      ),
    };
  },
  list_activities(input, context) {
    return requestTimebuzzer(
      "/activities",
      {
        query: queryParams({
          count: integer(input.count, "count"),
          offset: optionalInteger(input.offset),
          embed: optionalBoolean(input.embedTiles) ? "tile" : undefined,
        }),
      },
      context,
      "execute",
    );
  },
  get_activity: (input, context) =>
    requestTimebuzzer(`/activities/${integer(input.activityId, "activityId")}`, {}, context, "execute"),
  create_activity: (input, context) =>
    requestTimebuzzer("/activities", { method: "POST", body: activityBody(input) }, context, "execute"),
  async update_activity(input, context) {
    await requestTimebuzzer(
      `/activities/${integer(input.activityId, "activityId")}`,
      { method: "PUT", body: activityBody(input) },
      context,
      "execute",
    );
    return { success: true };
  },
  async delete_activity(input, context) {
    await requestTimebuzzer(
      `/activities/${integer(input.activityId, "activityId")}`,
      { method: "DELETE" },
      context,
      "execute",
    );
    return { success: true };
  },
};

export async function validateTimebuzzerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = optionalRecord(await requestTimebuzzer("/account/me", {}, { apiKey, fetcher, signal }, "validate"));
  if (!payload) throw new ProviderRequestError(502, "timeBuzzer current user response was not an object");
  const firstName = optionalString(payload.firstName);
  const lastName = optionalString(payload.lastName);
  const email = optionalString(payload.email);
  return {
    profile: { displayName: [firstName, lastName].filter(Boolean).join(" ") || email || "timeBuzzer API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: timebuzzerApiBaseUrl,
      validationEndpoint: `${apiPath}/account/me`,
      accountId: optionalInteger(payload.accountId),
    }),
  };
}

function activityBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    tiles: input.tiles,
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    startUtcOffset: optionalString(input.startUtcOffset),
    endUtcOffset: optionalString(input.endUtcOffset),
    note: optionalString(input.note),
    userId: optionalInteger(input.userId),
    billed: optionalBoolean(input.billed),
    customData: input.customData === null ? null : optionalString(input.customData),
  });
}

interface RequestOptions {
  method?: "DELETE" | "GET" | "POST" | "PUT";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

async function requestTimebuzzer(
  path: string,
  options: RequestOptions,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${apiPath}${path}`, timebuzzerApiBaseUrl);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `APIKey ${context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "timeBuzzer returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
    });
    if (!response.ok) throw timebuzzerError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "timeBuzzer request timed out");
    throw new ProviderRequestError(502, "timeBuzzer request failed");
  } finally {
    timeout.cleanup();
  }
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `timeBuzzer ${context} response was not an array`);
  return value;
}

function timebuzzerError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(optionalRecord(body?.error)?.message) ??
    optionalString(body?.message) ??
    `timeBuzzer request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
