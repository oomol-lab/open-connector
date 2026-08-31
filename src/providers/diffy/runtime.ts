import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const diffyApiBaseUrl = "https://app.diffy.website/api/";
interface DiffyContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const diffyActionHandlers: ProviderActionHandlers<
  "diffy",
  (input: Record<string, unknown>, context: DiffyContext) => Promise<unknown>
> = {
  async list_projects(_input, context) {
    const payload = await authorizedRequest(context, "projects");
    return { projects: readObjectArray(payload.projects, "Diffy projects response") };
  },
  async get_project(input, context) {
    return { project: await authorizedRequest(context, `projects/${positiveId(input.projectId, "projectId")}`) };
  },
  async list_screenshots(input, context) {
    const payload = await authorizedRequest(
      context,
      `projects/${positiveId(input.projectId, "projectId")}/screenshots`,
    );
    return { screenshots: readObjectArray(payload.screenshotsForDiff, "Diffy screenshots response") };
  },
  async get_screenshot(input, context) {
    return {
      screenshot: await authorizedRequest(context, `snapshots/${positiveId(input.screenshotId, "screenshotId")}`),
    };
  },
  async list_diffs(input, context) {
    const page = optionalInteger(input.page) ?? 0;
    const payload = await authorizedRequest(
      context,
      `projects/${positiveId(input.projectId, "projectId")}/diffs?page=${page}`,
    );
    return {
      diffs: readObjectArray(payload.diffs, "Diffy comparisons response"),
      page,
      totalPages: optionalInteger(payload.totalPages) ?? null,
    };
  },
  async get_diff(input, context) {
    return { diff: await authorizedRequest(context, `diffs/${positiveId(input.diffId, "diffId")}`) };
  },
};

export async function validateDiffyCredential(context: DiffyContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const token = await exchangeDiffyApiKey(context, "validate");
  const payload = await requestDiffyJson(context, "projects", "validate", token);
  const projects = readObjectArray(payload.projects, "Diffy projects response");
  return {
    profile: { accountId: "diffy:api-key", displayName: "Diffy API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: diffyApiBaseUrl, validationEndpoint: "/api/projects", projectCount: projects.length },
  };
}

export async function exchangeDiffyApiKey(
  context: DiffyContext,
  mode: "validate" | "execute" = "execute",
): Promise<string> {
  const payload = await requestDiffyJson(context, "auth/key", mode, undefined, {
    method: "POST",
    body: JSON.stringify({ key: context.apiKey }),
  });
  const token = optionalString(payload.token);
  if (!token) throw new ProviderRequestError(502, "Diffy auth response did not include token", payload);
  return token;
}

async function authorizedRequest(context: DiffyContext, path: string): Promise<Record<string, unknown>> {
  return requestDiffyJson(context, path, "execute", await exchangeDiffyApiKey(context));
}
async function requestDiffyJson(
  context: DiffyContext,
  path: string,
  mode: "validate" | "execute",
  token?: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await context.fetcher(new URL(path, diffyApiBaseUrl), {
      ...init,
      headers,
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { message: text };
      }
    }
    if (!response.ok) throw mapError(response.status, payload, mode);
    const record = optionalRecord(payload);
    if (!record) throw new ProviderRequestError(502, "Diffy returned invalid JSON", payload);
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? "Diffy request timed out"
        : error instanceof Error
          ? `Diffy request failed: ${error.message}`
          : "Diffy request failed",
    );
  } finally {
    timeout.cleanup();
  }
}
function mapError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors)
    ? record.errors.filter((value): value is string => typeof value === "string").join(". ")
    : undefined;
  const message = optionalString(record?.message) ?? errors ?? `Diffy request failed (${status})`;
  return new ProviderRequestError(
    (status === 401 || status === 403) && mode === "validate" ? 400 : status >= 500 ? 502 : status,
    message,
    payload,
  );
}
function readObjectArray(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item)))
    throw new ProviderRequestError(502, `${context} is invalid`, value);
  return value as Record<string, unknown>[];
}
function positiveId(value: unknown, field: string): number {
  const id = optionalInteger(value);
  if (id === undefined || id < 1) throw new ProviderRequestError(400, `${field} must be a positive integer`);
  return id;
}
