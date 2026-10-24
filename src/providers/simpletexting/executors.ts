import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
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
import { simpletextingActions } from "./actions.ts";

const baseUrl = "https://api-app2.simpletexting.com/v2";

function segment(values: Record<string, unknown>, field: string) {
  const value = requiredInputString(values[field], field);
  if (value === "." || value === "..") throw providerInputError(`${field} must not be a dot path segment`);
  return encodeURIComponent(value);
}

interface RequestOptions {
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  emptySuccess?: boolean;
}

async function request(context: ApiKeyProviderContext, endpoint: string, options: RequestOptions = {}) {
  const { apiKey, fetcher } = context;
  const { method = "GET", query = {}, body, emptySuccess = false } = options;
  return runProviderRequest({ label: "SimpleTexting", signal: context.signal }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": providerUserAgent,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetcher(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await readProviderTextBody(response, "simpletexting response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalRawString(record?.message) ??
        optionalRawString(record?.errorMessage) ??
        optionalRawString(record?.error) ??
        text;
      const code = optionalRawString(record?.errorCode) ?? optionalRawString(record?.code);
      const detail = message.trim() || `SimpleTexting request failed with status ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        (code ? `${code}: ${detail}` : detail).split(apiKey).join("[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (emptySuccess && !text.trim()) return { success: true };
    return requiredResponseRecord(payload, "SimpleTexting response");
  });
}
const handlers = mapProviderActionHandlers(
  "simpletexting",
  simpletextingActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    let endpoint = "";
    let method = "GET";
    let emptySuccess = false;
    let body: Record<string, unknown> | undefined;
    const query: Record<string, unknown> = {};
    switch (action.name) {
      case "get_account":
        endpoint = "/api/tenant";
        break;
      case "list_contacts":
      case "list_contact_lists":
      case "list_segments":
      case "list_custom_fields": {
        const endpoints: Record<string, string> = {
          list_contacts: "/api/contacts",
          list_contact_lists: "/api/contact-lists",
          list_segments: "/api/contact-segments",
          list_custom_fields: "/api/custom-fields",
        };
        endpoint = endpoints[action.name]!;
        Object.assign(query, values);
        break;
      }
      case "get_contact":
      case "delete_contact":
        endpoint = `/api/contacts/${segment(values, "contactIdOrNumber")}`;
        if (action.name === "delete_contact") {
          method = "DELETE";
          emptySuccess = true;
        }
        break;
      case "create_contact":
      case "update_contact": {
        const { contactIdOrNumber: _contactId, upsert, listsReplacement, ...fields } = values;
        endpoint =
          action.name === "create_contact" ? "/api/contacts" : `/api/contacts/${segment(values, "contactIdOrNumber")}`;
        method = action.name === "create_contact" ? "POST" : "PUT";
        query.upsert = upsert;
        query.listsReplacement = listsReplacement;
        body = fields;
        break;
      }
      case "get_contact_list":
      case "delete_contact_list":
      case "create_contact_list":
      case "update_contact_list":
        endpoint =
          action.name === "create_contact_list"
            ? "/api/contact-lists"
            : `/api/contact-lists/${segment(values, "listIdOrName")}`;
        if (action.name === "delete_contact_list") {
          method = "DELETE";
          emptySuccess = true;
        }
        if (action.name === "create_contact_list" || action.name === "update_contact_list") {
          method = action.name === "create_contact_list" ? "POST" : "PUT";
          body = { name: values.name };
        }
        break;
      case "add_contact_to_list":
        endpoint = `/api/contact-lists/${segment(values, "listIdOrName")}/contacts`;
        method = "POST";
        body = { contactPhoneOrId: values.contactPhoneOrId };
        emptySuccess = true;
        break;
      case "remove_contact_from_list":
        endpoint = `/api/contact-lists/${segment(values, "listIdOrName")}/contacts/${segment(values, "contactPhoneOrId")}`;
        method = "DELETE";
        emptySuccess = true;
        break;
      default:
        throw providerInputError("Unsupported SimpleTexting action");
    }
    return request(context, endpoint, { method, query, body, emptySuccess });
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("simpletexting", handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await request(
      { apiKey: requiredInputString(input.apiKey, "API Key"), fetcher, signal },
      "/api/tenant",
    );
    const email = optionalRawString(result.email);
    if (!email?.trim()) throw providerResponseError("SimpleTexting account response is missing email");
    return {
      profile: { displayName: email },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/api/tenant" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "simpletexting",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "user-agent": providerUserAgent }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
