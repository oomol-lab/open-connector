import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const papertrailApiBaseUrl = "https://papertrailapp.com/api/v1/";
interface PapertrailRequestInput {
  apiKey: string;
  path: string;
  phase?: "validate" | "execute";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
type PapertrailHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const papertrailActionHandlers: ProviderActionHandlers<"papertrail", PapertrailHandler> = {
  async search_events(input, context) {
    const payload = requiredResponseRecord(
      await requestPapertrail({
        apiKey: context.apiKey,
        path: "events/search.json",
        query: compactObject({
          q: optionalString(input.query),
          system_id: optionalString(input.systemId),
          group_id: optionalInteger(input.groupId),
          min_id: optionalString(input.minId),
          min_time: optionalInteger(input.minTime),
          max_id: optionalString(input.maxId),
          max_time: optionalInteger(input.maxTime),
          limit: optionalInteger(input.limit),
          tail: optionalBoolean(input.tail),
        }),
        fetcher: context.fetcher,
        signal: context.signal,
      }),
      "Papertrail event search response",
    );
    return {
      events: requireArray(payload.events, "Papertrail events"),
      minId: optionalString(payload.min_id) ?? null,
      maxId: optionalString(payload.max_id) ?? null,
      minTimeAt: optionalString(payload.min_time_at) ?? null,
      maxTimeAt: optionalString(payload.max_time_at) ?? null,
    };
  },
  async list_systems(_input, context) {
    return {
      systems: requireArray(
        await requestPapertrail({
          apiKey: context.apiKey,
          path: "systems.json",
          fetcher: context.fetcher,
          signal: context.signal,
        }),
        "Papertrail systems response",
      ),
    };
  },
  async list_groups(_input, context) {
    return {
      groups: requireArray(
        await requestPapertrail({
          apiKey: context.apiKey,
          path: "groups.json",
          fetcher: context.fetcher,
          signal: context.signal,
        }),
        "Papertrail groups response",
      ),
    };
  },
  async list_saved_searches(_input, context) {
    return {
      savedSearches: requireArray(
        await requestPapertrail({
          apiKey: context.apiKey,
          path: "searches.json",
          fetcher: context.fetcher,
          signal: context.signal,
        }),
        "Papertrail saved-search response",
      ),
    };
  },
  async create_saved_search(input, context) {
    return {
      savedSearch: requiredResponseRecord(
        await requestPapertrail({
          apiKey: context.apiKey,
          path: "searches.json",
          method: "POST",
          body: { search: savedSearchBody(input) },
          fetcher: context.fetcher,
          signal: context.signal,
        }),
        "Papertrail saved-search response",
      ),
    };
  },
  async update_saved_search(input, context) {
    return {
      savedSearch: requiredResponseRecord(
        await requestPapertrail({
          apiKey: context.apiKey,
          path: `searches/${optionalInteger(input.id)}.json`,
          method: "PUT",
          body: { search: savedSearchBody(input) },
          fetcher: context.fetcher,
          signal: context.signal,
        }),
        "Papertrail saved-search response",
      ),
    };
  },
  async delete_saved_search(input, context) {
    const payload = requiredResponseRecord(
      await requestPapertrail({
        apiKey: context.apiKey,
        path: `searches/${optionalInteger(input.id)}.json`,
        method: "DELETE",
        fetcher: context.fetcher,
        signal: context.signal,
      }),
      "Papertrail saved-search deletion response",
    );
    return { message: optionalString(payload.message) ?? "Saved search deleted" };
  },
};

export async function validatePapertrailCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const systems = requireArray(
    await requestPapertrail({ apiKey, path: "systems.json", phase: "validate", fetcher, signal }),
    "Papertrail systems response",
  );
  return {
    profile: { accountId: "papertrail", displayName: "Papertrail API Token" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: papertrailApiBaseUrl,
      validationEndpoint: "/api/v1/systems.json",
      systemCount: systems.length,
    },
  };
}
function savedSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    query: optionalString(input.query),
    group_id: optionalInteger(input.groupId),
  });
}
async function requestPapertrail(input: PapertrailRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Papertrail", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, papertrailApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-papertrail-token": input.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPapertrailPayload(response);
    if (!response.ok) throw mapPapertrailError(response.status, payload, input.phase ?? "execute");
    return payload;
  });
}
async function readPapertrailPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Papertrail response");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Papertrail returned invalid JSON");
  }
}
function mapPapertrailError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Papertrail request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status === 401) return new ProviderRequestError(400, message, payload);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}
function requireArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new ProviderRequestError(502, `${label} must be an array`);
}
