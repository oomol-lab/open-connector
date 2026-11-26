import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  readProviderErrorTextBody,
  parseProviderJsonBodyText,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const baseUrl = "https://api.salesforge.ai/public/v2";

interface Route {
  method: string;
  suffix: string;
}
const routes: Record<string, Route> = {
  get_current_user: { method: "GET", suffix: "/me" },
  list_workspaces: { method: "GET", suffix: "/workspaces" },
  get_workspace: { method: "GET", suffix: "" },
  list_contacts: { method: "GET", suffix: "/contacts" },
  count_contacts: { method: "GET", suffix: "/contacts/count" },
  get_contact: { method: "GET", suffix: "/contacts" },
  create_contact: { method: "POST", suffix: "/contacts" },
  delete_contact: { method: "DELETE", suffix: "/contacts" },
  list_tags: { method: "GET", suffix: "/tags" },
  list_dncs: { method: "GET", suffix: "/dnc" },
  create_dncs: { method: "POST", suffix: "/dnc/bulk" },
  remove_dncs: { method: "POST", suffix: "/dnc/bulk/remove" },
};

const handlers: Record<string, (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>> =
  {};

for (const [name, route] of Object.entries(routes)) {
  handlers[name] = async (input, context) => {
    const { workspaceID, contactID, ...parameters } = input;
    if (name === "list_contacts") {
      const cursorMode = parameters.pagination === "cursor" || parameters.cursor !== undefined;
      if (cursorMode && parameters.offset !== undefined && parameters.offset !== 0)
        throw new ProviderRequestError(400, "Cursor pagination cannot use a nonzero offset");
      if (parameters.cursor !== undefined && parameters.pagination === "offset")
        throw new ProviderRequestError(400, "A cursor cannot be combined with offset pagination");
    }
    const workspacePath = workspaceID === undefined ? "" : `/workspaces/${encodeSegment(String(workspaceID))}`;
    const contactPath = contactID === undefined ? "" : `/${encodeSegment(String(contactID))}`;
    return request(`${workspacePath}${route.suffix}${contactPath}`, route.method, parameters, context);
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("salesforge", handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const result = await request("/me", "GET", {}, { ...context, apiKey: input.apiKey });
    return {
      profile: {
        accountId: optionalString(result.accountId),
        displayName: optionalString(result.apiKeyName) || "Salesforge API Key",
      },
      metadata: { readOnly: result.readOnly },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "salesforge",
  baseUrl,
  async readError(response) {
    const payload = parseProviderJsonBodyText(await readProviderErrorTextBody(response, "Salesforge error response"), {
      emptyBody: null,
      invalidJsonMessage: "Salesforge returned invalid JSON",
      invalidJsonFallback: (text) => text.slice(0, 500),
    });
    return new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ??
        optionalString(payload) ??
        `Salesforge request failed (HTTP ${response.status})`,
      undefined,
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  auth: { type: "api_key_header", name: "Authorization" },
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
  skipDnsValidation: true,
});

function encodeSegment(value: string): string {
  if (value === "." || value === "..") throw new ProviderRequestError(400, "Invalid Salesforge resource ID");
  return encodeURIComponent(value);
}

async function request(
  endpoint: string,
  method: string,
  parameters: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Salesforge", signal: context.signal }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    if (method === "GET") {
      for (const [key, value] of Object.entries(parameters)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
      }
    }
    const response = await context.fetcher(url, {
      method,
      signal,
      headers: { "Authorization": context.apiKey, "accept": "application/json", "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(parameters) : undefined,
    });
    if (response.status === 204) return { success: true };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Salesforge returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        optionalString(optionalRecord(payload)?.message) ?? `Salesforge request failed (HTTP ${response.status})`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    return requiredResponseRecord(payload, "Salesforge response");
  });
}
