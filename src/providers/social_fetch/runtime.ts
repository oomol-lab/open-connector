import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const socialFetchApiBaseUrl = "https://api.socialfetch.dev";

interface SocialFetchContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode?: "validate" | "execute";
}

export const socialFetchActionHandlers: ProviderActionHandlers<
  "social_fetch",
  (input: Record<string, unknown>, context: SocialFetchContext) => Promise<unknown>
> = {
  async get_account(_input, context) {
    const payload = requireObject(await requestSocialFetch("/v1/whoami", context), "response");
    return { ...requireObject(payload.data, "data"), meta: requireObject(payload.meta, "meta") };
  },
  async get_balance(_input, context) {
    const payload = requireObject(await requestSocialFetch("/v1/balance", context), "response");
    return { ...requireObject(payload.data, "data"), meta: requireObject(payload.meta, "meta") };
  },
  async get_profile(input, context) {
    const platform = requiredString(input.platform, "platform", badInput);
    const rawHandle = requiredString(input.handle, "handle", badInput);
    const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : rawHandle;
    const path =
      platform === "telegram"
        ? `/v1/telegram/channels/${encodeURIComponent(handle)}`
        : `/v1/${platform}/profiles/${encodeURIComponent(handle)}`;
    const payload = requireObject(await requestSocialFetch(path, context), "response");
    const data = requireObject(payload.data, "data");
    return {
      lookupStatus: data.lookupStatus,
      profile:
        optionalRecord(data.profile) ??
        optionalRecord(data.channel) ??
        optionalRecord(data.entity) ??
        optionalRecord(data.user) ??
        null,
      metrics: optionalRecord(data.metrics) ?? null,
      raw: data,
      meta: requireObject(payload.meta, "meta"),
    };
  },
};

export async function validateSocialFetchCredential(context: Omit<SocialFetchContext, "mode">): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const envelope = requireObject(await requestSocialFetch("/v1/whoami", { ...context, mode: "validate" }), "response");
  const user = requireObject(requireObject(envelope.data, "data").user, "data.user");
  const id = optionalString(user.id);
  if (!id) throw new ProviderRequestError(502, "Social Fetch whoami response did not include a user id", envelope);
  return {
    profile: {
      accountId: id,
      displayName: optionalString(user.name) ?? optionalString(user.email) ?? `Social Fetch ${id}`,
    },
    grantedScopes: [],
    metadata: { apiBaseUrl: socialFetchApiBaseUrl, validationEndpoint: "/v1/whoami" },
  };
}

async function requestSocialFetch(path: string, context: SocialFetchContext): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, socialFetchApiBaseUrl), {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Social Fetch request failed: ${error.message}` : "Social Fetch request failed",
    );
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "Social Fetch returned invalid JSON");
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const error = optionalRecord(record?.error);
    const message =
      optionalString(error?.message) ??
      optionalString(record?.message) ??
      `Social Fetch request failed with status ${response.status}`;
    throw new ProviderRequestError(
      context.mode === "validate" && response.status === 401 ? 400 : response.status >= 500 ? 502 : response.status,
      message,
      payload,
    );
  }
  return payload;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record)
    throw new ProviderRequestError(502, `Social Fetch response did not include an object at ${field}`, value);
  return record;
}
function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
