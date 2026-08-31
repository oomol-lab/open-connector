import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

export const genpageApiBaseUrl = "https://backend.genpage.ai";
type Method = "GET" | "POST";
type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

function listHandler(path: string, outputKey: string): Handler {
  return async (input, context) => ({
    [outputKey]: requireArray(await request({ context, method: "GET", path, query: input, phase: "execute" })),
  });
}
function resultHandler(method: Method, path: string): Handler {
  return async (input, context) => ({
    result: requireObject(
      await request({
        context,
        method,
        path,
        query: method === "GET" ? input : undefined,
        body: method === "POST" ? input : undefined,
        phase: "execute",
      }),
    ),
  });
}

export const genpageActionHandlers: ProviderActionHandlers<"genpage", Handler> = {
  list_workspaces: listHandler("/api/external/v1/workspaces/get-list", "workspaces"),
  list_workspace_variables: listHandler("/api/external/v1/workspaces/get-variable-list", "variables"),
  get_credit_balance: resultHandler("GET", "/api/external/v1/account/credits"),
  list_campaigns: listHandler("/api/external/v1/campaigns/get-list", "campaigns"),
  create_campaign: resultHandler("POST", "/api/external/v1/campaigns/create"),
  get_campaign_analytics: resultHandler("GET", "/api/external/v1/campaigns/analytics"),
  list_audiences: listHandler("/api/external/v1/audiences/get-list", "audiences"),
  create_audience: resultHandler("POST", "/api/external/v1/audiences/create"),
  add_audience_leads: resultHandler("POST", "/api/external/v1/audiences/add-leads"),
  remove_audience_leads: resultHandler("POST", "/api/external/v1/audiences/remove-leads"),
  link_audience_to_campaign: resultHandler("POST", "/api/external/v1/audiences/link-to-campaign"),
  unlink_audience_from_campaign: resultHandler("POST", "/api/external/v1/audiences/unlink-from-campaign"),
  delete_audience: resultHandler("POST", "/api/external/v1/audiences/delete"),
};

export async function validateGenpageCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const workspaces = requireArray(
    await request({ context, method: "GET", path: "/api/external/v1/workspaces/get-list", phase: "validate" }),
  );
  const workspace = optionalRecord(workspaces[0]);
  const id = workspace?.id;
  return {
    profile: {
      accountId: `genpage:${typeof id === "number" || typeof id === "string" ? id : "account"}`,
      displayName: optionalString(workspace?.name) || "GenPage API Token",
    },
    metadata: { apiBaseUrl: genpageApiBaseUrl, validationEndpoint: "/api/external/v1/workspaces/get-list" },
  };
}

interface RequestInput {
  context: ApiKeyProviderContext;
  method: Method;
  path: string;
  phase: Phase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}
async function request(input: RequestInput): Promise<unknown> {
  const url = new URL(input.path, genpageApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return runProviderRequest({ signal: input.context.signal, label: "GenPage" }, async (signal) => {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, input.phase);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "GenPage returned invalid JSON");
  }
}
function createError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.detail) || optionalString(record?.message) || `GenPage request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && 400 <= status && status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 500, message);
}
function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, "GenPage response is not an array");
  return value;
}
function requireObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, "GenPage response is not an object");
  return record;
}
