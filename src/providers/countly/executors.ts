import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString, optionalStringArray, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "countly";
const validationPath = "/o/users/me";
interface Context {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export function normalizeBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const text = requiredString(value, "baseUrl", providerInputError);
  const url = assertPublicHttpUrl(text, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password || url.pathname !== "/") {
    throw providerInputError("baseUrl must be an HTTP(S) instance root URL without credentials or a path");
  }
  url.search = "";
  url.hash = "";
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
async function request(context: Context, path: string, query: Record<string, unknown> = {}): Promise<unknown> {
  const url = new URL(path, `${context.baseUrl}/`);
  url.searchParams.set("api_key", context.apiKey);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Countly returned invalid JSON");
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    throw new ProviderRequestError(
      response.status,
      optionalString(record?.message) ??
        optionalString(record?.error) ??
        optionalString(record?.result) ??
        `Countly request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
function record(value: unknown): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, "Countly returned an invalid object response", value);
  return result;
}
function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, "Countly returned an invalid array response", value);
  }
  return value as Array<Record<string, unknown>>;
}

const handlers = {
  async get_current_user(_input: Record<string, unknown>, context: Context) {
    return { user: record(await request(context, validationPath)) };
  },
  async list_apps(_input: Record<string, unknown>, context: Context) {
    const data = record(await request(context, "/o/apps/mine"));
    return { adminOf: record(data.admin_of), userOf: record(data.user_of) };
  },
  async get_app_details(input: Record<string, unknown>, context: Context) {
    return {
      details: record(
        await request(context, "/o/apps/details", { app_id: requiredString(input.appId, "appId", providerInputError) }),
      ),
    };
  },
  async get_dashboard_analytics(input: Record<string, unknown>, context: Context) {
    return {
      analytics: record(
        await request(context, "/o/analytics/dashboard", {
          app_id: requiredString(input.appId, "appId", providerInputError),
        }),
      ),
    };
  },
  async list_session_analytics(input: Record<string, unknown>, context: Context) {
    return {
      sessions: records(
        await request(
          context,
          "/o/analytics/sessions",
          compactObject({
            app_id: requiredString(input.appId, "appId", providerInputError),
            period: optionalString(input.period),
          }),
        ),
      ),
    };
  },
  async list_event_analytics(input: Record<string, unknown>, context: Context) {
    const event = optionalString(input.event);
    const events = optionalStringArray(input.events);
    if (!event && !events?.length) throw providerInputError("event or events is required");
    return {
      events: records(
        await request(
          context,
          "/o/analytics/events",
          compactObject({
            app_id: requiredString(input.appId, "appId", providerInputError),
            event,
            events: events ? JSON.stringify(events) : undefined,
            segmentation: optionalString(input.segmentation),
            period: optionalString(input.period),
          }),
        ),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl);
  },
  auth: { type: "api_key_query", name: "api_key" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const user = record(
      await request({ apiKey: input.apiKey, baseUrl, fetcher: guardedFetcher, signal }, validationPath),
    );
    const userId = optionalString(user._id);
    return {
      profile: {
        accountId: userId ? `countly:${new URL(baseUrl).host}:user:${userId}` : "api_key",
        displayName:
          optionalString(user.full_name) ??
          optionalString(user.username) ??
          optionalString(user.email) ??
          "Countly API Key",
      },
      grantedScopes: [],
      metadata: compactObject({ baseUrl, apiBaseUrl: baseUrl, validationEndpoint: validationPath, userId }),
    };
  },
};
