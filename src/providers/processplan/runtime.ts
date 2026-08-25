import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const processplanApiBaseUrl = "https://apius0.processplan.com/api/v4";
const timeoutMs = 30_000;

export const processplanActionHandlers: ProviderActionHandlers<
  "processplan",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_process_templates(input, context) {
    return {
      processTemplates: readList(
        await requestProcessplan(
          "/process_template_header/list/for/starting",
          { query: listQuery(input) },
          context,
          "execute",
        ),
        "process_template_header_list",
      ),
    };
  },
  async start_process(input, context) {
    const templateId = encodeURIComponent(requiredString(input.processTemplateId, "processTemplateId"));
    return {
      processInstance: requireObject(
        await requestProcessplan(
          `/process_template_header/${templateId}/start`,
          { method: "POST", body: { fields: optionalRecord(input.fields) ?? {} } },
          context,
          "execute",
        ),
        "ProcessPlan returned an invalid process instance payload",
      ),
    };
  },
  async list_process_instances(input, context) {
    return {
      processInstances: readList(
        await requestProcessplan(instanceListPath(input), { query: listQuery(input) }, context, "execute"),
        "process_instance_header_list",
      ),
    };
  },
  async list_my_pending_tasks(input, context) {
    return {
      tasks: readList(
        await requestProcessplan(
          "/user/me/process_instance_task/list/pending",
          { query: listQuery(input) },
          context,
          "execute",
        ),
        "process_instance_task_list",
      ),
    };
  },
};

export async function validateProcessplanCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireObject(
    await requestProcessplan("/user/me", {}, { apiKey, fetcher, signal }, "validate"),
    "ProcessPlan returned an invalid user payload",
  );
  return {
    profile: { displayName: pickString(user, "u_full_name", "u_name", "u_email", "email") ?? "ProcessPlan API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: processplanApiBaseUrl, validationEndpoint: "/user/me" },
  };
}

function listQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    take: typeof input.take === "number" ? input.take : undefined,
    skip: typeof input.skip === "number" ? input.skip : undefined,
    filter: optionalString(input.filter),
  });
}

function instanceListPath(input: Record<string, unknown>): string {
  const templateId = optionalString(input.processTemplateId);
  const status = optionalString(input.status) ?? "all";
  const prefix = templateId
    ? `/process_template_header/${encodeURIComponent(templateId)}/process_instance_header/list`
    : "/process_instance_header/list";
  return status === "all" ? prefix : `${prefix}/${status}`;
}

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
}

async function requestProcessplan(
  path: string,
  options: RequestOptions,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${processplanApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        tkn_id: context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "ProcessPlan returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
    });
    if (!response.ok) throw processplanError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "ProcessPlan request timed out");
    throw new ProviderRequestError(502, "ProcessPlan request failed");
  } finally {
    timeout.cleanup();
  }
}

function readList(payload: unknown, key: string): Array<Record<string, unknown>> {
  const list = requireObject(payload, "ProcessPlan returned an invalid list payload")[key];
  if (!Array.isArray(list) || list.some((item) => optionalRecord(item) === undefined)) {
    throw new ProviderRequestError(502, `ProcessPlan response did not include ${key}`);
  }
  return list as Array<Record<string, unknown>>;
}

function requireObject(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function processplanError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    optionalString(body?.detail) ??
    `ProcessPlan request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
