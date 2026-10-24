import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";

const baseUrl = "https://api.commoninja.com/platform/api/v1";
const defaultHeaders = { accept: "application/json", "user-agent": providerUserAgent };

function encodePathSegment(input: unknown) {
  const value = requiredInputString(input, "id");
  if (value === "." || value === "..") {
    throw providerInputError("id cannot be a dot path segment");
  }
  return encodeURIComponent(value);
}

interface RequestOptions {
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

async function request(context: ApiKeyProviderContext, endpoint: string, options: RequestOptions = {}) {
  const { apiKey, fetcher } = context;
  const { method = "GET", query = {}, body } = options;
  return runProviderRequest({ label: "Common Ninja", signal: context.signal }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers(defaultHeaders);
    headers.set("CN-API-Token", apiKey);
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await readProviderTextBody(response, "commonninja response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const message =
        optionalRawString(optionalRecord(payload)?.message) ??
        `Common Ninja request failed with status ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        message.split(apiKey).join("[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (response.status === 204 && method === "DELETE") return {};
    return requiredResponseRecord(payload, "Common Ninja response");
  });
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "commonninja",
  {
    get_user(_input, context) {
      return request(context, "/user");
    },
    list_widgets(input, context) {
      return request(context, "/widgets", { query: input });
    },
    list_widget_types(input, context) {
      return request(context, "/widget-types", { query: input });
    },
    list_projects(input, context) {
      return request(context, "/projects", { query: input });
    },
    create_widget(input, context) {
      return request(context, "/widgets", { method: "POST", body: input });
    },
    get_widget(input, context) {
      return request(context, `/widgets/${encodePathSegment(input.id)}`);
    },
    get_widget_embed_code(input, context) {
      return request(context, `/widgets/${encodePathSegment(input.id)}/embed-code`);
    },
    get_widget_editor_url(input, context) {
      return request(context, `/widgets/${encodePathSegment(input.id)}/editor`);
    },
    get_widget_type(input, context) {
      return request(context, `/widget-types/${encodePathSegment(input.id)}`);
    },
    get_widget_type_schema(input, context) {
      return request(context, `/widget-types/${encodePathSegment(input.id)}/schema`);
    },
    get_project(input, context) {
      return request(context, `/projects/${encodePathSegment(input.id)}`);
    },
    delete_widget(input, context) {
      return request(context, `/widgets/${encodePathSegment(input.id)}`, {
        method: "DELETE",
        query: { permanent: input.permanent },
      });
    },
    update_widget(input, context) {
      const { id, ...body } = input;
      return request(context, `/widgets/${encodePathSegment(id)}`, { method: "PUT", body });
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await request({ apiKey: requiredInputString(input.apiKey, "API Key"), fetcher, signal }, "/user");
    const accountId = optionalRawString(user.id);
    if (!accountId) {
      throw providerResponseError("Common Ninja profile is missing an account ID");
    }
    return {
      profile: { displayName: optionalRawString(user.name) || optionalRawString(user.email) || "Common Ninja Account" },
      grantedScopes: [],
      metadata: { accountId, apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "commonninja",
  baseUrl,
  auth: { type: "api_key_header", name: "CN-API-Token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries(defaultHeaders)) if (!headers.has(name)) headers.set(name, value);
  },
});
