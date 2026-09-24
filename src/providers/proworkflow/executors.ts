import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "proworkflow";
const baseUrl = "https://api.proworkflow.com/api/v4";

const handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_projects: (input, context) => request(context, "/projects", { query: buildListQuery(input) }),
  get_project: (input, context) =>
    request(context, `/projects/${positiveInteger(input.projectId, "projectId")}`, {
      query: { fields: input.fields },
    }),
  update_project: (input, context) =>
    request(context, `/projects/${positiveInteger(input.projectId, "projectId")}`, {
      method: "PUT",
      body: requireUpdateFields(
        compactObject({
          title: input.title,
          number: input.number,
          description: input.description,
          startdate: input.startDate,
          duedate: input.dueDate,
          completedate: input.completedDate,
          priorityid: input.priorityId,
          managerid: input.managerId,
          companyid: input.companyId,
          notification: input.notification,
        }),
      ),
    }),
  list_project_items: (input, context) =>
    request(context, "/projects/items", {
      query: { ...buildListQuery(input), projectid: input.projectId },
    }),
  get_project_item: (input, context) => request(context, `/projects/items/${positiveInteger(input.itemId, "itemId")}`),
  update_project_item: (input, context) =>
    request(context, `/projects/items/${positiveInteger(input.itemId, "itemId")}`, {
      method: "PUT",
      body: requireUpdateFields(
        compactObject({
          name: input.name,
          code: input.code,
          description: input.description,
          startdate: input.startDate,
          duedate: input.dueDate,
          completedate: input.completedDate,
          status: input.status,
          priorityid: input.priorityId,
          manualPercentageComplete: input.percentComplete,
        }),
      ),
    }),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = requiredResponseRecord(
      await request({ apiKey: input.apiKey, fetcher, signal }, "/settings/account", {}, "validate"),
      "ProWorkflow account settings response",
    );
    const data = requiredResponseRecord(payload.data, "ProWorkflow account settings data");
    return {
      profile: { accountId: "api_key", displayName: optionalString(data.accounturl) ?? "ProWorkflow API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/settings/account" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

interface RequestOptions {
  method?: "GET" | "PUT";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

async function request(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "ProWorkflow" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await context.fetcher(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "ProWorkflow returned invalid JSON",
      trimEmptyBody: false,
    });
    if (!response.ok) throw createError(response.status, payload, phase);
    return requiredResponseRecord(payload, "ProWorkflow response");
  });
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  if ((input.pageNumber == null) !== (input.pageSize == null)) {
    throw providerInputError("pageNumber and pageSize must be provided together");
  }
  return {
    fields: input.fields,
    q: input.q,
    status: input.status,
    sortby: input.sortBy,
    sortorder: input.sortOrder,
    pagenumber: input.pageNumber,
    pagesize: input.pageSize,
    includetotalrows: input.includeTotalRows,
    companyid: input.companyId,
  };
}

function requireUpdateFields(body: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(body).length === 0) throw providerInputError("at least one update field is required");
  return body;
}

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw providerInputError(`${fieldName} must be a positive integer`);
  }
  return value;
}

function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const messages = looseArray(record?.data)
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .join("; ");
  const message = messages || optionalString(record?.message) || `ProWorkflow request failed with ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload, "invalid_input");
  }
  return new ProviderRequestError(status || 500, message, payload);
}
