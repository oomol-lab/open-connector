import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const baseUrl = "https://api.simplelocalize.io";

async function request(
  path: string,
  method: string,
  input: Record<string, unknown>,
  context: Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1],
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  if (method === "GET")
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      "x-simplelocalize-token": context.apiKey,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(input),
    signal: context.signal,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      `SimpleLocalize request failed with status ${response.status}`,
      payload,
    );
  return payload;
}
function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}
const handlers: ProviderActionHandlers<"simplelocalize", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_project(input, context) {
    return { data: record(await request("/api/v2/project", "GET", input, context)).data };
  },
  async list_translations(input, context) {
    const payload = record(await request("/api/v2/translations", "GET", input, context));
    return { translations: payload.data ?? [], pageDetails: payload.pageDetails ?? null };
  },
  async update_translation(input, context) {
    await request("/api/v2/translations", "PATCH", input, context);
    return { success: true };
  },
  async list_translation_keys(input, context) {
    const payload = record(await request("/api/v1/translation-keys", "GET", input, context));
    return { translationKeys: payload.data ?? [], pageDetails: payload.pageDetails ?? null };
  },
  async create_translation_key(input, context) {
    await request("/api/v1/translation-keys", "POST", input, context);
    return { success: true };
  },
  async list_languages(input, context) {
    return { languages: record(await request("/api/v1/languages", "GET", input, context)).data ?? [] };
  },
  async create_language(input, context) {
    return { language: record(await request("/api/v1/languages", "POST", input, context)).data };
  },
  async update_language(input, context) {
    const { languageKey, ...body } = input;
    if (body.key === undefined && body.name === undefined)
      throw new ProviderRequestError(400, "key or name is required");
    await request(`/api/v1/languages/${encodeURIComponent(String(languageKey))}`, "PATCH", body, context);
    return { success: true };
  },
  async delete_language(input, context) {
    await request(`/api/v1/languages/${encodeURIComponent(String(input.languageKey))}`, "DELETE", {}, context);
    return { success: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("simplelocalize", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "simplelocalize",
  baseUrl,
  auth: { type: "api_key_header", name: "X-SimpleLocalize-Token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    let result: unknown;
    try {
      result = await request("/api/v2/project", "GET", {}, { apiKey: input.apiKey, fetcher, signal });
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status < 500) {
        throw new ProviderRequestError(400, error.message, error.details);
      }
      throw error;
    }
    const payload = record(result);
    const data = record(payload.data);
    return {
      profile: {
        accountId: optionalString(data.projectToken) ?? "project",
        displayName: optionalString(data.name) ?? "SimpleLocalize Project",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationEndpoint: "/api/v2/project",
        ...(optionalString(data.projectToken) ? { projectToken: optionalString(data.projectToken) } : {}),
      },
    };
  },
};
