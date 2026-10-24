import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, requiredRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { flotiqActions } from "./actions.ts";
const baseUrl = "https://api.flotiq.com";
function encodePathSegment(value: string) {
  if (value === "." || value === "..") {
    throw new ProviderRequestError(400, "Flotiq path identifiers cannot be dot segments", undefined, "invalid_input");
  }
  return encodeURIComponent(value);
}
async function requestFlotiq(
  apiKey: string,
  fetcher: typeof fetch,
  pathname: string,
  method = "GET",
  query: Record<string, unknown> = {},
  body?: unknown,
  preview = false,
  parentSignal?: AbortSignal,
) {
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ signal: parentSignal, label: "Flotiq" }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      "X-AUTH-TOKEN": apiKey,
      "user-agent": providerUserAgent,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (preview) headers.set("X-MODE", "preview");
    const response = await fetcher(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await readProviderTextBody(response, "flotiq response", undefined, signal);
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "Flotiq returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const object = optionalRecord(payload);
      const message =
        optionalRawString(object?.message) ??
        flotiqValidationMessage(object) ??
        `Flotiq request failed (${response.status})`;
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (method === "DELETE" && response.status === 204) return {};
    return requiredResponseRecord(payload, "Flotiq response");
  });
}
function flotiqValidationMessage(payload: Record<string, unknown> | undefined) {
  if (!payload) return undefined;
  const messages: string[] = [];
  for (const [field, errors] of Object.entries(payload)) {
    if (!Array.isArray(errors)) continue;
    for (const error of errors) {
      const message = optionalRawString(error);
      if (message) messages.push(`${field}: ${message}`);
    }
  }
  return messages.length ? messages.join("; ") : undefined;
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "flotiq",
  mapProviderActionHandlers(
    "flotiq",
    flotiqActions,
    (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = input;
      const name = encodePathSegment(requiredRawString(data.contentType, "contentType", providerInputError));
      const apiKey = context.apiKey;
      const fetcher = context.fetcher;
      if (action.name === "get_content_type") {
        const contentType = await requestFlotiq(
          apiKey,
          fetcher,
          `/api/v1/internal/contenttype/${name}`,
          "GET",
          {
            resolveRef: data.resolveRef,
            strictSchema: data.strictSchema,
          },
          undefined,
          undefined,
          context.signal,
        );
        return { contentType };
      }
      const collection = `/api/v1/content/${name}`;
      if (action.name === "list_content_objects") {
        return requestFlotiq(
          apiKey,
          fetcher,
          collection,
          "GET",
          {
            page: data.page,
            limit: data.limit,
            order_by: data.order_by,
            order_direction: data.order_direction,
            empty_first: data.empty_first,
            filters: data.filters === undefined ? undefined : JSON.stringify(data.filters),
            hydrate: data.hydrate,
          },
          undefined,
          data.preview === true,
          context.signal,
        );
      }
      if (action.name === "create_content_object") {
        return {
          object: await requestFlotiq(apiKey, fetcher, collection, "POST", {}, data.content, undefined, context.signal),
        };
      }
      const objectPath = `${collection}/${encodePathSegment(requiredRawString(data.id, "id", providerInputError))}`;
      if (action.name === "delete_content_object") {
        await requestFlotiq(apiKey, fetcher, objectPath, "DELETE", undefined, undefined, undefined, context.signal);
        return { deleted: true };
      }
      if (action.name === "update_content_object") {
        return {
          object: await requestFlotiq(
            apiKey,
            fetcher,
            objectPath,
            optionalRawString(data.method) ?? "PATCH",
            {},
            data.content,
            undefined,
            context.signal,
          ),
        };
      }
      return {
        object: await requestFlotiq(
          apiKey,
          fetcher,
          objectPath,
          "GET",
          { hydrate: data.hydrate },
          undefined,
          data.preview === true,
          context.signal,
        ),
      };
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await requestFlotiq(requiredInputString(input.apiKey, "API Key"), fetcher, "/api/auth-context");
    return {
      profile: { displayName: "Flotiq API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/api/auth-context" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "flotiq",
  baseUrl,
  auth: { type: "api_key_header", name: "X-AUTH-TOKEN" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
