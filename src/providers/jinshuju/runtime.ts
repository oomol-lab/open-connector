import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const baseUrl = "https://jinshuju.net/api/v1";
export const headers = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Jinshuju-Version": "2026-11-12",
};

// Reject path traversal before encoding: encodeURIComponent leaves dot segments unchanged.
function encodeToken(token: string) {
  if (token === "." || token === "..") throw providerInputError("Invalid form token");
  return encodeURIComponent(token);
}

interface JinshujuRequest {
  endpoint: string;
  method?: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

export async function requestJinshuju(
  input: JinshujuRequest,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const { endpoint, method = "GET", body, query = {} } = input;
  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (key === "q" && Array.isArray(value)) {
      for (const term of value) url.searchParams.append("q[]", String(term));
    } else {
      url.searchParams.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
  }
  return runProviderRequest({ label: "Jinshuju", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      method,
      headers: { ...headers, Authorization: `Bearer ${context.apiKey}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Jinshuju returned invalid JSON (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const description = optionalString(optionalRecord(payload)?.error_description);
      throw new ProviderRequestError(
        response.status,
        description ?? `Jinshuju request failed (HTTP ${response.status})`,
        payload,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Jinshuju response");
  });
}

interface JinshujuRoute {
  method: string;
  endpoint(input: Record<string, unknown>): string;
  body?: "entry" | "entries" | "rest";
}

const routes: Record<string, JinshujuRoute> = {
  list_forms: { method: "GET", endpoint: () => "/forms" },
  get_form: { method: "GET", endpoint: formPath },
  copy_form: { method: "POST", endpoint: (input) => `${formPath(input)}/copy`, body: "rest" },
  list_folders: { method: "GET", endpoint: () => "/folders" },
  create_folder: { method: "POST", endpoint: () => "/folders", body: "rest" },
  move_form_to_folder: { method: "PATCH", endpoint: (input) => `${formPath(input)}/folder`, body: "rest" },
  list_entries: { method: "GET", endpoint: (input) => `${formPath(input)}/entries` },
  get_entry: { method: "GET", endpoint: entryPath },
  create_entry: { method: "POST", endpoint: (input) => `${formPath(input)}/entries`, body: "entry" },
  batch_create_entries: { method: "POST", endpoint: (input) => `${formPath(input)}/entries/batch`, body: "entries" },
  update_entry: { method: "PATCH", endpoint: entryPath, body: "entry" },
  replace_entry: { method: "PUT", endpoint: entryPath, body: "entry" },
  delete_entry: { method: "DELETE", endpoint: entryPath },
  get_current_user: { method: "GET", endpoint: () => "/me" },
};

function formPath(input: Record<string, unknown>): string {
  return `/forms/${encodeToken(String(input.form_token))}`;
}

function entryPath(input: Record<string, unknown>): string {
  return `${formPath(input)}/entries/${encodeURIComponent(String(input.serial_number))}`;
}

export const jinshujuHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = Object.fromEntries(
  Object.entries(routes).map(([name, route]) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      if (
        typeof input.page === "number" &&
        (input.page - 1) * (typeof input.limit === "number" ? input.limit : 50) > 10000
      )
        throw providerInputError("(page - 1) * limit must not exceed 10000");
      const { form_token: _formToken, serial_number: _serialNumber, ...rest } = input;
      let body: unknown = undefined;
      switch (route.body) {
        case "entry":
          body = rest.entry;
          break;
        case "entries":
          body = { entries: rest.entries };
          break;
        case "rest":
          body = rest;
          break;
      }
      return requestJinshuju(
        {
          endpoint: route.endpoint(input),
          method: route.method,
          body,
          query: route.method === "GET" ? rest : undefined,
        },
        context,
      );
    },
  ]),
);
