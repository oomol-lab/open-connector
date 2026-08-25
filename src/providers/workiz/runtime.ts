import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const workizApiBaseUrl = "https://api.workiz.com/api/v1";
const timeoutMs = 30_000;

function setQuery(query: URLSearchParams, name: string, value: unknown) {
  if (value !== undefined) query.set(name, String(value));
}
async function execute(name: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (name === "list_team_members") return { teamMembers: records(await request("/team/all/", context, "execute")) };
  const resource = name.includes("job") ? "job" : "lead";
  if (name.startsWith("list_")) {
    const query = new URLSearchParams();
    setQuery(query, "start_date", optionalString(input.startDate));
    setQuery(query, "offset", optionalInteger(input.offset));
    setQuery(query, "records", optionalInteger(input.records));
    setQuery(query, "only_open", optionalBoolean(input.onlyOpen));
    if (Array.isArray(input.statuses))
      for (const status of input.statuses) if (typeof status === "string") query.append("status", status);
    const values = records(await request(`/${resource}/all/${query.size ? `?${query}` : ""}`, context, "execute"));
    return { [`${resource}s`]: resource === "job" ? values.map(unwrapData) : values };
  }
  const values = records(
    await request(`/${resource}/get/${encodeURIComponent(requiredString(input.uuid, "uuid"))}/`, context, "execute"),
  );
  if (!values[0]) throw new ProviderRequestError(502, `workiz did not return the requested ${resource}`);
  return { [resource]: unwrapData(values[0]) };
}
const handler =
  (name: string): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    execute(name, input, context);
export const workizActionHandlers: ProviderActionHandlers<"workiz", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_jobs: handler("list_jobs"),
  get_job: handler("get_job"),
  list_leads: handler("list_leads"),
  get_lead: handler("get_lead"),
  list_team_members: handler("list_team_members"),
};
export async function validateWorkizCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await request("/team/all/", { apiKey, fetcher, signal }, "validate");
  return {
    profile: { displayName: "Workiz API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: workizApiBaseUrl },
  };
}
async function request(path: string, context: ApiKeyProviderContext, phase: "validate" | "execute") {
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  try {
    const response = await context.fetcher(`${workizApiBaseUrl}/${encodeURIComponent(context.apiKey)}${path}`, {
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        if (response.ok) throw new ProviderRequestError(502, "workiz returned invalid JSON");
      }
    }
    if (!response.ok) throw mapError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "workiz request timed out");
    throw new ProviderRequestError(502, "workiz request failed");
  } finally {
    timeout.cleanup();
  }
}
function records(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  const data = optionalRecord(payload)?.data;
  if (Array.isArray(data)) return data;
  throw new ProviderRequestError(502, "workiz response did not include a record list");
}
function unwrapData(value: unknown) {
  return optionalRecord(value)?.data ?? value;
}
function mapError(status: number, payload: unknown, phase: "validate" | "execute") {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? `workiz request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (phase === "validate" && status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
