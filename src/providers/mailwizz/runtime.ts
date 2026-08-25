import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export interface MailWizzContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
export function createMailWizzContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): MailWizzContext {
  return { apiKey, baseUrl: normalizeMailWizzBaseUrl(values.baseUrl), fetcher, signal };
}

export const mailWizzActionHandlers: ProviderActionHandlers<"mailwizz", ProviderRuntimeHandler<MailWizzContext>> = {
  list_lists(input, context) {
    return request(context, "/lists", { query: pagination(input) });
  },
  get_list(input, context) {
    return request(context, `/lists/${path(input, "listUid")}`);
  },
  list_subscribers(input, context) {
    return request(context, `/lists/${path(input, "listUid")}/subscribers`, { query: pagination(input) });
  },
  get_subscriber(input, context) {
    return request(context, `/lists/${path(input, "listUid")}/subscribers/${path(input, "subscriberUid")}`);
  },
  create_or_update_subscriber(input, context) {
    return request(context, `/lists/${path(input, "listUid")}/subscribers`, {
      method: "POST",
      form: { ...(optionalRecord(input.fields) ?? {}), EMAIL: string(input, "email") },
    });
  },
  unsubscribe_subscriber(input, context) {
    return request(
      context,
      `/lists/${path(input, "listUid")}/subscribers/${path(input, "subscriberUid")}/unsubscribe`,
      { method: "PUT" },
    );
  },
};

export async function validateMailWizzCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const context = createMailWizzContext(values, apiKey, fetcher, signal);
  await request(context, "/lists", { query: { page: 1, per_page: 1 }, validating: true });
  const host = new URL(context.baseUrl).host;
  return {
    profile: { accountId: `mailwizz:${host}`, displayName: `MailWizz ${host}` },
    grantedScopes: [],
    metadata: { baseUrl: context.baseUrl },
  };
}

export function normalizeMailWizzBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, "baseUrl is required");
  const url = assertPublicHttpUrl(value.trim(), {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.username || url.password) throw new ProviderRequestError(400, "baseUrl must not contain credentials");
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/`;
  return url.toString().replace(/\/$/u, "");
}

interface RequestOptions {
  method?: "POST" | "PUT";
  query?: Record<string, number | undefined>;
  form?: Record<string, unknown>;
  validating?: boolean;
}
async function request(context: MailWizzContext, requestPath: string, options: RequestOptions = {}): Promise<unknown> {
  const url = new URL(requestPath.replace(/^\//u, ""), `${context.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {}))
    if (value != null) url.searchParams.set(key, String(value));
  const body = options.form ? new FormData() : undefined;
  if (body) for (const [key, value] of Object.entries(options.form ?? {})) body.set(key, String(value));
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: { accept: "application/json", "x-api-key": context.apiKey },
    body,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      typeof record?.error === "string"
        ? record.error
        : typeof record?.message === "string"
          ? record.message
          : `MailWizz request failed with HTTP ${response.status}`;
    throw new ProviderRequestError(
      options.validating && (response.status === 401 || response.status === 403) ? 400 : response.status,
      message,
    );
  }
  return payload;
}
function pagination(input: Record<string, unknown>) {
  return { page: optionalInteger(input.page), per_page: optionalInteger(input.perPage) };
}
function path(input: Record<string, unknown>, field: string) {
  return encodeURIComponent(string(input, field));
}
function string(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value === "string" && value) return value;
  throw new ProviderRequestError(400, `${field} is required`);
}
