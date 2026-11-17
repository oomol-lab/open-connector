import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { rendiActions } from "./actions.ts";

const baseUrl = "https://api.rendi.dev";

interface Endpoint {
  method: string;
  path: string;
  idField?: string;
  listField?: string;
}

const endpoints: Record<string, Endpoint> = {
  run_ffmpeg_command: { method: "POST", path: "/v1/run-ffmpeg-command" },
  run_chained_ffmpeg_commands: { method: "POST", path: "/v1/run-chained-ffmpeg-commands" },
  get_command: { method: "GET", path: "/v1/commands/{id}", idField: "command_id" },
  list_commands: { method: "GET", path: "/v1/commands", listField: "commands" },
  store_file: { method: "POST", path: "/v1/files/store-file" },
  get_file: { method: "GET", path: "/v1/files/{id}", idField: "file_id" },
  list_files: { method: "GET", path: "/v1/files", listField: "files" },
  delete_file: { method: "DELETE", path: "/v1/files/{id}", idField: "file_id" },
  delete_files: { method: "POST", path: "/v1/files/bulk-delete" },
  delete_command_files: {
    method: "DELETE",
    path: "/v1/commands/{id}/files",
    idField: "command_id",
  },
};

async function request(
  apiKey: string,
  url: URL,
  method: string,
  body: unknown,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Rendi", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method,
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (response.ok && method === "DELETE" && response.status === 204) {
      return { deleted: true };
    }

    const text = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ProviderRequestError(502, "Rendi returned invalid JSON");
      }
    }

    if (!response.ok) {
      const detail = optionalRecord(payload)?.detail;
      const message =
        optionalString(detail) ??
        (Array.isArray(detail)
          ? detail
              .map((item) => optionalString(optionalRecord(item)?.msg))
              .filter(Boolean)
              .join("; ")
          : undefined) ??
        `Rendi request failed (${response.status})`;
      if (response.status === 401 && detail === "Invalid authorization key") {
        throw new ProviderRequestError(401, message, undefined, "authorization_failed");
      }

      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }

    return payload;
  });
}

const handlers = mapProviderActionHandlers(
  "rendi",
  rendiActions,
  (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const endpoint = endpoints[actionName];
    if (!endpoint) {
      throw new ProviderRequestError(400, `Unknown Rendi action: ${actionName}`);
    }

    const id = endpoint.idField ? String(input[endpoint.idField]) : undefined;
    if (id === "." || id === "..") {
      throw new ProviderRequestError(400, "Invalid Rendi resource ID");
    }

    const url = new URL(
      id === undefined ? endpoint.path : endpoint.path.replace("{id}", encodeURIComponent(id)),
      baseUrl,
    );
    if (endpoint.method === "GET") {
      for (const [key, value] of Object.entries(input)) {
        if (key !== endpoint.idField && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const payload = await request(
      context.apiKey,
      url,
      endpoint.method,
      endpoint.method === "POST" ? input : undefined,
      context.fetcher,
      context.signal,
    );
    if (endpoint.listField) {
      if (!Array.isArray(payload)) {
        throw new ProviderRequestError(502, "Rendi list response must be an array");
      }

      return { [endpoint.listField]: payload };
    }

    const result = requiredResponseRecord(payload, "Rendi response");
    const handleField =
      actionName.startsWith("run_") || actionName === "get_command"
        ? "command_id"
        : actionName === "store_file" || actionName === "get_file"
          ? "file_id"
          : undefined;
    if (handleField && !optionalString(result[handleField])?.trim()) {
      throw new ProviderRequestError(502, `Rendi response is missing ${handleField}`);
    }

    if (actionName === "get_command" && !optionalString(result.status)?.trim()) {
      throw new ProviderRequestError(502, "Rendi command response is missing status");
    }

    return result;
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("rendi", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "rendi",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  async readError(response) {
    const message = await readProviderProxyErrorMessage(response, "rendi proxy request failed");
    if (response.status === 401) {
      let payload: unknown;
      try {
        payload = JSON.parse(message);
      } catch {
        // Preserve unstructured upstream errors without inferring credential failure.
      }

      if (optionalRecord(payload)?.detail === "Invalid authorization key") {
        return new ProviderRequestError(401, message, undefined, "authorization_failed");
      }
    }

    return new ProviderRequestError(response.status, message, undefined, "provider_error");
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request(
      input.apiKey,
      new URL("/v1/commands?limit=1", baseUrl),
      "GET",
      undefined,
      fetcher,
      signal,
    );
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Rendi command list must be an array");
    }

    return { profile: { displayName: "Rendi API Key" } };
  },
};
