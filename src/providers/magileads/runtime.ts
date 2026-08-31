import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const magileadsApiBaseUrl = "https://app.api-magileads.net";

const request =
  (
    method: "DELETE" | "GET" | "POST" | "PUT",
    path: (input: Record<string, unknown>) => string,
    body = false,
  ): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    requestMagileads(path(input), method, body ? contactListBody(input) : undefined, context, "execute");

function listId(input: Record<string, unknown>): string {
  if (!Number.isInteger(input.contact_list_id))
    throw new ProviderRequestError(400, "contact_list_id must be an integer");
  return String(input.contact_list_id);
}

export const magileadsActionHandlers: ProviderActionHandlers<
  "magileads",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_contact_lists: request("GET", () => "/contact-lists"),
  get_contact_list: request("GET", (input) => `/contact-lists/${listId(input)}`),
  create_contact_list: request("POST", () => "/contact-lists", true),
  update_contact_list: request("PUT", (input) => `/contact-lists/${listId(input)}`, true),
  delete_contact_list: request("DELETE", (input) => `/contact-lists/${listId(input)}`),
};

export async function validateMagileadsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMagileads("/users/me/quick", "GET", undefined, { apiKey, fetcher, signal }, "validate");
  const response = optionalRecord(payload);
  if (!response) throw new ProviderRequestError(502, "Magileads returned an invalid profile response");
  const profile = optionalRecord(response.user_profile);
  const id = profile?.id;
  const firstName = optionalString(profile?.first_name);
  const lastName = optionalString(profile?.last_name);
  const email = optionalString(profile?.email);
  return {
    profile: {
      accountId: typeof id === "string" || typeof id === "number" ? String(id) : "magileads",
      displayName: [firstName, lastName].filter(Boolean).join(" ") || email || "Magileads API Key",
    },
    grantedScopes: [],
    metadata: { apiBaseUrl: magileadsApiBaseUrl, validationEndpoint: "/users/me/quick" },
  };
}

function contactListBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    tags_ids: input.tags_ids,
    folder_id: input.folder_id,
    language: input.language,
    country: input.country,
    pin: input.pin,
  });
}

async function requestMagileads(
  path: string,
  method: "DELETE" | "GET" | "POST" | "PUT",
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: "execute" | "validate",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(new URL(path, `${magileadsApiBaseUrl}/`), {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Magileads returned malformed JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
    });
    if (!response.ok) throw magileadsError(response, payload, phase);
    if (!optionalRecord(payload)) throw new ProviderRequestError(502, "Magileads returned an invalid JSON object");
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Magileads request timed out");
    throw new ProviderRequestError(502, "Magileads request failed");
  } finally {
    timeout.cleanup();
  }
}

function magileadsError(response: Response, payload: unknown, phase: "execute" | "validate"): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.state_message) ??
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    (response.statusText || `Magileads request failed with ${response.status}`);
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}
