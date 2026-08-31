import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const triggerDevApiBaseUrl = "https://api.trigger.dev";

const triggerDevValidationPath = "/api/v1/runs";

type TriggerDevJsonObject = Record<string, unknown>;
type TriggerDevMode = "validate" | "execute";

interface TriggerDevRequestOptions {
  path: string;
  mode: TriggerDevMode;
  method?: string;
  query?: Array<[string, string | number | boolean | undefined]>;
  body?: unknown;
}

export const triggerDevActionHandlers: ProviderActionHandlers<
  "trigger_dev",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_runs(input, context) {
    return listRuns(input, context);
  },
  get_run(input, context) {
    return requestTriggerDevJson(
      {
        path: `/api/v3/runs/${encodeURIComponent(requiredInputString(input.runId, "runId"))}`,
        mode: "execute",
      },
      context,
    );
  },
  get_run_result(input, context) {
    return requestTriggerDevJson(
      {
        path: `/api/v1/runs/${encodeURIComponent(requiredInputString(input.runId, "runId"))}/result`,
        mode: "execute",
      },
      context,
    );
  },
  trigger_task(input, context) {
    return requestTriggerDevJson(
      {
        path: `/api/v1/tasks/${encodeURIComponent(requiredInputString(input.taskIdentifier, "taskIdentifier"))}/trigger`,
        method: "POST",
        body: compactObject({
          payload: input.payload,
          context: input.context,
          options: input.options,
        }),
        mode: "execute",
      },
      context,
    );
  },
  cancel_run(input, context) {
    return requestTriggerDevJson(
      {
        path: `/api/v2/runs/${encodeURIComponent(requiredInputString(input.runId, "runId"))}/cancel`,
        method: "POST",
        mode: "execute",
      },
      context,
    );
  },
  replay_run(input, context) {
    return requestTriggerDevJson(
      {
        path: `/api/v1/runs/${encodeURIComponent(requiredInputString(input.runId, "runId"))}/replay`,
        method: "POST",
        mode: "execute",
      },
      context,
    );
  },
};

export async function validateTriggerDevCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestTriggerDevJson(
    {
      path: triggerDevValidationPath,
      query: [["page[size]", 10]],
      mode: "validate",
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "trigger_dev",
      displayName: "Trigger.dev API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: triggerDevApiBaseUrl,
      validationEndpoint: triggerDevValidationPath,
    },
  };
}

async function listRuns(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTriggerDevJson(
    {
      path: "/api/v1/runs",
      query: listRunsQuery(input),
      mode: "execute",
    },
    context,
  );

  return {
    runs: Array.isArray(payload.data) ? payload.data : [],
    pagination: isRecord(payload.pagination) ? payload.pagination : {},
  };
}

function listRunsQuery(input: Record<string, unknown>): Array<[string, string | number | boolean | undefined]> {
  const query: Array<[string, string | number | boolean | undefined]> = [
    ["page[size]", typeof input.pageSize === "number" ? input.pageSize : undefined],
    ["page[after]", optionalString(input.pageAfter)],
    ["page[before]", optionalString(input.pageBefore)],
    ["filter[status]", commaSeparated(input.statuses)],
    ["filter[taskIdentifier]", commaSeparated(input.taskIdentifiers)],
    ["filter[version]", commaSeparated(input.versions)],
    ["filter[createdAt][from]", optionalString(input.createdFrom)],
    ["filter[createdAt][to]", optionalString(input.createdTo)],
    ["filter[createdAt][period]", optionalString(input.createdPeriod)],
    ["filter[bulkAction]", optionalString(input.bulkAction)],
    ["filter[schedule]", optionalString(input.schedule)],
  ];

  if (typeof input.isTest === "boolean") {
    query.push(["filter[isTest]", input.isTest]);
  }

  return query;
}

async function requestTriggerDevJson(
  options: TriggerDevRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<TriggerDevJsonObject> {
  const response = await triggerDevFetch(options, context);
  if (!response.ok) {
    const payload = await parseOptionalTriggerDevJson(response);
    throw toTriggerDevError(response, payload, options.mode);
  }

  return parseTriggerDevJson(response);
}

async function triggerDevFetch(
  options: TriggerDevRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Response> {
  const url = new URL(options.path, triggerDevApiBaseUrl);
  const method = options.method ?? "GET";
  for (const [key, value] of options.query ?? []) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }

  try {
    return await context.fetcher(url, {
      method,
      headers: triggerDevHeaders(context.apiKey, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Trigger.dev request failed for ${method} ${url.toString()}: ${error.message}`
        : `Trigger.dev request failed for ${method} ${url.toString()}`,
    );
  }
}

function triggerDevHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function parseTriggerDevJson(response: Response): Promise<TriggerDevJsonObject> {
  const payload = await parseOptionalTriggerDevJson(response);
  if (payload) {
    return payload;
  }

  throw new ProviderRequestError(502, "Trigger.dev returned an empty response body");
}

async function parseOptionalTriggerDevJson(response: Response): Promise<TriggerDevJsonObject | null> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Trigger.dev response body: ${error.message}`
        : "Failed to read Trigger.dev response body",
    );
  }

  if (!text) {
    return null;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload)) {
      return payload;
    }
  } catch {
    throw new ProviderRequestError(502, "Trigger.dev returned invalid JSON");
  }

  throw new ProviderRequestError(502, "Trigger.dev returned a non-object JSON payload");
}

function toTriggerDevError(
  response: Response,
  payload: TriggerDevJsonObject | null,
  mode: TriggerDevMode,
): ProviderRequestError {
  const message = readTriggerDevErrorMessage(payload) ?? `Trigger.dev request failed with status ${response.status}`;

  if (mode === "validate" && response.status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 409
  ) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message, payload);
}

function readTriggerDevErrorMessage(payload: TriggerDevJsonObject | null): string | undefined {
  if (!payload) {
    return undefined;
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error)) {
    return optionalString(error.message) ?? optionalString(error.code);
  }

  return optionalString(payload.message);
}

function commaSeparated(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map(String).join(",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
