import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const cronlyApiBaseUrl = "https://cronly.app/api";
type CronlyPhase = "validate" | "execute";
type CronlyMethod = "GET" | "POST" | "DELETE";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cronlyActionHandlers: ProviderActionHandlers<"cronly", Handler> = {
  async list_projects(_input, context) {
    return {
      projects: requireObjectArray(
        await requestCronlyJson({ context, path: "/projects", phase: "execute" }),
        "Cronly projects response",
      ),
    };
  },
  async get_project(input, context) {
    return {
      project: requireObject(
        await requestCronlyJson({ context, path: `/projects/${readResourceId(input.id)}`, phase: "execute" }),
        "Cronly project response",
      ),
    };
  },
  async create_project(input, context) {
    return {
      project: requireObject(
        await requestCronlyJson({
          context,
          path: "/projects",
          method: "POST",
          body: { name: input.name },
          phase: "execute",
        }),
        "Cronly create project response",
      ),
    };
  },
  async delete_project(input, context) {
    const id = readResourceId(input.id);
    await requestCronlyJson({ context, path: `/projects/${id}`, method: "DELETE", phase: "execute" });
    return { deleted: true, id };
  },
  async list_monitors(_input, context) {
    const monitors = requireObjectArray(
      await requestCronlyJson({ context, path: "/monitors", phase: "execute" }),
      "Cronly monitors response",
    );
    return { monitors: monitors.map(normalizeMonitor) };
  },
  async get_monitor(input, context) {
    const monitor = requireObject(
      await requestCronlyJson({ context, path: `/monitors/${readResourceId(input.id)}`, phase: "execute" }),
      "Cronly monitor response",
    );
    return { monitor: normalizeMonitor(monitor) };
  },
  async create_monitor(input, context) {
    const body = compactObject({
      name: input.name,
      timezone: input.timezone,
      schedule: input.schedule,
      duration: input.duration,
      project_id: input.project_id,
    });
    const monitor = requireObject(
      await requestCronlyJson({ context, path: "/monitors", method: "POST", body, phase: "execute" }),
      "Cronly create monitor response",
    );
    return { monitor: normalizeMonitor(monitor) };
  },
  async delete_monitor(input, context) {
    const id = readResourceId(input.id);
    await requestCronlyJson({ context, path: `/monitors/${id}`, method: "DELETE", phase: "execute" });
    return { deleted: true, id };
  },
};

export async function validateCronlyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const company = requireObject(
    await requestCronlyJson({ context, path: "/companies", phase: "validate" }),
    "Cronly company response",
  );
  return {
    profile: {
      accountId: `cronly:${readOptionalPositiveInteger(company.id) ?? "account"}`,
      displayName: optionalString(company.name)?.trim() || "Cronly API Token",
    },
    metadata: compactObject({
      apiBaseUrl: cronlyApiBaseUrl,
      companyId: readOptionalPositiveInteger(company.id),
      timezone: optionalString(company.timezone),
      validationEndpoint: "/companies",
    }),
  };
}

interface CronlyRequestInput {
  context: ApiKeyProviderContext;
  path: string;
  phase: CronlyPhase;
  method?: CronlyMethod;
  body?: Record<string, unknown>;
}
async function requestCronlyJson(input: CronlyRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, 30_000);
  try {
    const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
    const response = await input.context.fetcher(new URL(path, `${cronlyApiBaseUrl}/`), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readCronlyPayload(response);
    if (!response.ok || optionalString(optionalRecord(payload)?.status) === "error")
      throw createCronlyError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "Cronly request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cronly request failed: ${error.message}` : "Cronly request failed",
    );
  } finally {
    timeout.cleanup();
  }
}
async function readCronlyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cronly returned invalid JSON");
  }
}
function createCronlyError(status: number, payload: unknown, phase: CronlyPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.reason)?.trim() ||
    optionalString(record?.error)?.trim() ||
    optionalString(record?.message)?.trim() ||
    `Cronly request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && (status === 200 || (400 <= status && status < 500)))
    return new ProviderRequestError(400, message);
  if (400 <= status && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status === 200 ? 502 : status || 500, message);
}
function requireObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${context} is not an object`);
  return record;
}
function requireObjectArray(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item)))
    throw new ProviderRequestError(502, `${context} is not an object array`);
  return value as Record<string, unknown>[];
}
function normalizeMonitor(monitor: Record<string, unknown>): Record<string, unknown> {
  return { ...monitor, duration: normalizeInteger(monitor.duration) };
}
function normalizeInteger(value: unknown): unknown {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue)) return numberValue;
  }
  return value;
}
function readResourceId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(400, "Cronly resource id must be an integer");
  return value;
}
function readOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
