import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderActionSources } from "../provider-executors.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionSources } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "dataforb2b";
const dataForB2BApiBaseUrl = "https://api.dataforb2b.ai";
const filterOperators = new Set(["=", ">", ">=", "<", "<=", "between", "in", "like"]);

interface DataForB2BActionRequest {
  method: "GET" | "POST";
  path: string;
}

const requestByAction: ProviderActionSources<"dataforb2b", DataForB2BActionRequest> = {
  get_account: { method: "GET", path: "/account" },
  search_people: { method: "POST", path: "/search/people" },
  search_companies: { method: "POST", path: "/search/companies" },
  count_results: { method: "POST", path: "/search/count" },
  enrich_profile: { method: "POST", path: "/enrich/profile" },
  enrich_company: { method: "POST", path: "/enrich/company" },
  typeahead: { method: "GET", path: "/typeahead" },
};

type DataForB2BHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"dataforb2b", DataForB2BHandler> = mapProviderActionSources(
  service,
  requestByAction,
  (actionName, request) => async (input, context) => {
    validateActionInput(actionName, input);
    const body = normalizeActionInput(actionName, input);
    return requestDataForB2B({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      request,
      body,
      phase: "execute",
    });
  },
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dataForB2BApiBaseUrl,
  auth: { type: "api_key_header", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDataForB2BCredential(input.apiKey, fetcher, signal);
  },
};

async function validateDataForB2BCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = optionalRecord(
    await requestDataForB2B({
      apiKey,
      fetcher,
      signal,
      request: requestByAction.get_account,
      body: {},
      phase: "validate",
    }),
  );
  if (account?.valid !== true) throw providerInputError("DataForB2B API key is not valid");
  return {
    profile: { displayName: "DataForB2B API Key" },
    metadata: compactObject({
      apiBaseUrl: dataForB2BApiBaseUrl,
      validationEndpoint: "/account",
      credits: typeof account.credits == "number" ? account.credits : undefined,
    }),
  };
}

interface DataForB2BRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  request: DataForB2BActionRequest;
  body: Record<string, unknown>;
  phase: "validate" | "execute";
}

async function requestDataForB2B(input: DataForB2BRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "DataForB2B", signal: input.signal }, async (signal) => {
    const url = new URL(input.request.path, dataForB2BApiBaseUrl);
    if (input.request.method == "GET") {
      for (const [key, value] of Object.entries(input.body)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await input.fetcher(url, {
      method: input.request.method,
      headers: {
        accept: "application/json",
        api_key: input.apiKey,
        ...(input.request.method == "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.request.method == "POST" ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, input.phase);
    if (!optionalRecord(payload)) throw new ProviderRequestError(502, "DataForB2B returned an invalid response");
    return payload;
  });
}

function normalizeActionInput(actionName: string, input: Record<string, unknown>): Record<string, unknown> {
  if (actionName == "enrich_profile") return { ...input, profile_identifier: optionalString(input.profile_identifier) };
  if (actionName == "enrich_company") return { ...input, company_identifier: optionalString(input.company_identifier) };
  return input;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DataForB2B returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const detail = optionalRecord(payload)?.detail;
  const message =
    optionalString(detail) ??
    optionalString(optionalRecord(detail)?.error) ??
    `DataForB2B request failed with status ${status}`;
  if (phase == "validate" && status == 401) return providerInputError(message);
  return new ProviderRequestError(status, message);
}

function validateActionInput(actionName: string, input: Record<string, unknown>): void {
  if (actionName == "search_people" || actionName == "search_companies" || actionName == "count_results") {
    const filters = optionalRecord(input.filters);
    if (filters) validateFilterGroup(filters);
  }
  if (actionName == "enrich_profile") {
    const enabled = ["enrich_profile", "enrich_work_email", "enrich_personal_email", "enrich_phone", "enrich_github"];
    if (!enabled.some((name) => input[name] === true))
      throw providerInputError("At least one enrich option must be true");
  }
}

function validateFilterGroup(group: Record<string, unknown>): void {
  if ((group.op !== "and" && group.op !== "or") || !Array.isArray(group.conditions) || group.conditions.length == 0) {
    throw providerInputError("Filter group requires op and non-empty conditions");
  }
  for (const value of group.conditions) validateFilterNode(value);
}

function validateFilterNode(value: unknown): void {
  const node = optionalRecord(value);
  if (!node) throw providerInputError("Filter node must be an object");
  const leaf =
    node.column !== undefined || node.type !== undefined || node.value !== undefined || node.value2 !== undefined;
  const group = node.op !== undefined || node.conditions !== undefined;
  if (leaf && !group) {
    if (
      typeof node.column != "string" ||
      node.column.trim() == "" ||
      typeof node.type != "string" ||
      !filterOperators.has(node.type) ||
      node.value === undefined ||
      (node.type == "between" && node.value2 === undefined)
    ) {
      throw providerInputError("Filter condition requires column, type and value");
    }
    return;
  }
  if (group && !leaf) {
    validateFilterGroup(node);
    return;
  }
  throw providerInputError("Filter node must be either a condition or a nested group");
}
