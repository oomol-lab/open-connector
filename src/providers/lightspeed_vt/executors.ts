import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "lightspeed_vt";
const baseUrl = "https://webservices.lightspeedvt.net/REST/V1";
interface Context {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

function secret(values: Record<string, unknown>): string {
  const value = optionalString(values.apiSecret)?.trim();
  if (!value) throw new ProviderRequestError(400, "LightSpeed VT apiSecret is required");
  return value;
}
async function request(path: string, query: Record<string, unknown>, context: Context): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  const response = await context.fetcher(url, {
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${context.apiKey}:${context.apiSecret}`).toString("base64")}`,
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "LightSpeed VT returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ?? `LightSpeed VT request failed with HTTP ${response.status}`,
      payload,
    );
  return payload;
}
const handlers = {
  async list_users(input: Record<string, unknown>, context: Context) {
    const value = await request("/users", input, context);
    return { users: Array.isArray(value) ? value : [] };
  },
  async get_user(input: Record<string, unknown>, context: Context) {
    return { user: await request(`/users/${encodeURIComponent(requiredString(input.userId, "userId"))}`, {}, context) };
  },
  async list_courses(input: Record<string, unknown>, context: Context) {
    const value = await request("/courses", input, context);
    return { courses: Array.isArray(value) ? value : [] };
  },
  async get_course(input: Record<string, unknown>, context: Context) {
    return {
      course: await request(`/courses/${encodeURIComponent(requiredString(input.courseId, "courseId"))}`, {}, context),
    };
  },
  async list_locations(input: Record<string, unknown>, context: Context) {
    const value = await request("/locations", input, context);
    return { locations: Array.isArray(value) ? value : [] };
  },
  async get_location(input: Record<string, unknown>, context: Context) {
    return {
      location: await request(
        `/locations/${encodeURIComponent(requiredString(input.locationId, "locationId"))}`,
        {},
        context,
      ),
    };
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, apiSecret: secret(credential.values), fetcher, signal: context.signal };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_basic" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${credential.apiKey}:${secret(credential.values)}`).toString("base64")}`,
    );
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, apiSecret: secret(input.values), fetcher, signal };
    await request("/users/count", {}, context);
    return {
      profile: { displayName: "LightSpeed VT API Account" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/users/count" },
    };
  },
};
