import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "la_growth_machine";
const laGrowthMachineApiBaseUrl = "https://apiv2.lagrowthmachine.com/flow";

type JsonObject = Record<string, unknown>;
type LaGrowthMachineContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type LaGrowthMachineActionHandler = (
  input: Record<string, unknown>,
  context: LaGrowthMachineContext,
) => Promise<unknown>;

export const laGrowthMachineActionHandlers: ProviderActionHandlers<"la_growth_machine", LaGrowthMachineActionHandler> =
  {
    async list_members(_input, context): Promise<unknown> {
      const payload = await requestLaGrowthMachine({ path: "/members", context });
      return {
        members: normalizeMembers(payload),
        raw: payload,
      };
    },

    async list_audiences(_input, context): Promise<unknown> {
      const payload = await requestLaGrowthMachine({ path: "/audiences", context });
      const record = asRecord(payload);
      return {
        audiences: normalizeArray(record.audiences),
        raw: record,
      };
    },

    async create_audience(input, context): Promise<unknown> {
      const payload = await requestLaGrowthMachine({
        method: "POST",
        path: "/audiences/create",
        body: { name: requiredString(input.name, "name", providerInputError) },
        context,
      });
      const record = asRecord(payload);
      return {
        audience: unwrapDataObject(record),
        raw: record,
      };
    },

    async get_audience_detail(input, context): Promise<unknown> {
      const payload = await requestLaGrowthMachine({
        path: `/audiences/${encodePath(requiredString(input.audienceId, "audienceId", providerInputError))}/detail`,
        context,
      });
      const record = asRecord(payload);
      return {
        audience: unwrapDataObject(record),
        raw: record,
      };
    },

    async get_audience_leads(input, context): Promise<unknown> {
      const payload = await requestLaGrowthMachine({
        path: `/audiences/${encodePath(requiredString(input.audienceId, "audienceId", providerInputError))}/leads`,
        search: [
          ["skip", input.skip],
          ["limit", input.limit],
        ],
        context,
      });
      const record = asRecord(payload);
      return {
        leads: normalizeArray(record.data),
        total: typeof record.total === "number" ? record.total : null,
        raw: record,
      };
    },

    async search_leads(input, context): Promise<unknown> {
      if (!hasAtLeastOneNonEmptyValue(input)) {
        throw new ProviderRequestError(400, "at least one lead search criterion is required");
      }
      const payload = await requestLaGrowthMachine({
        path: "/leads/search",
        search: Object.entries(input),
        context,
      });
      const record = asRecord(payload);
      return {
        leads: normalizeLeadCollection(payload),
        tooManyResults: record.tooManyResults === true,
        raw: payload,
      };
    },

    async create_or_update_lead(input, context): Promise<unknown> {
      if (!hasLeadMutationIdentifier(input)) {
        throw new ProviderRequestError(400, "at least one lead identifier is required");
      }
      const payload = await requestLaGrowthMachine({
        method: "POST",
        path: "/leads",
        body: compactObject(input),
        context,
      });
      const record = asRecord(payload);
      return {
        lead: unwrapDataObject(record),
        raw: record,
      };
    },
  };

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, laGrowthMachineActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLaGrowthMachineCredential(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
  },
};

async function validateLaGrowthMachineCredential(
  context: LaGrowthMachineContext,
  phase: "validate",
): Promise<CredentialValidationResult> {
  const payload = await requestLaGrowthMachine({ path: "/members", context, phase });
  const members = normalizeMembers(payload);
  const firstMember = members[0] ?? {};
  const memberId = pickString(firstMember, "id");
  const accountLabel = pickString(firstMember, "label", "name", "email") ?? "La Growth Machine API Key";

  return {
    profile: {
      accountId: memberId ? `la_growth_machine:${memberId}` : "la_growth_machine:api_key",
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: laGrowthMachineApiBaseUrl,
      validationEndpoint: "/members",
    },
  };
}

async function requestLaGrowthMachine(request: {
  method?: "GET" | "POST";
  path: string;
  search?: Array<[string, unknown]>;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
  context: LaGrowthMachineContext;
}): Promise<unknown> {
  const url = new URL(request.path.replace(/^\//, ""), `${laGrowthMachineApiBaseUrl}/`);
  for (const [key, value] of request.search ?? []) {
    appendQueryValue(url, key, value);
  }

  const timeout = createProviderTimeout(request.context.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await request.context.fetcher(url, {
      method: request.method ?? "GET",
      headers: buildHeaders(request.context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response, { tolerant: !response.ok });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "La Growth Machine request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `La Growth Machine request failed: ${error.message}`
        : "La Growth Machine request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createLaGrowthMachineError(response.status, payload, request.phase ?? "execute");
  }
  return payload;
}

function buildHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readPayload(response: Response, options: { tolerant: boolean }): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.tolerant) {
      return {};
    }
    throw new ProviderRequestError(502, "La Growth Machine returned invalid JSON");
  }
}

function createLaGrowthMachineError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readLaGrowthMachineErrorMessage(payload) ?? `La Growth Machine request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readLaGrowthMachineErrorMessage(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  const errorRecord = asRecord(error);
  return pickString(errorRecord, "message", "error") ?? pickString(record, "message", "error_description", "detail");
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function normalizeArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asRecord);
}

function normalizeMembers(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) {
    return normalizeArray(payload);
  }

  const record = asRecord(payload);
  if (Array.isArray(record.members)) {
    return normalizeArray(record.members);
  }
  if (Array.isArray(record.data)) {
    return normalizeArray(record.data);
  }
  return [];
}

function normalizeLeadCollection(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) {
    return normalizeArray(payload);
  }

  const record = asRecord(payload);
  if (Array.isArray(record.data)) {
    return normalizeArray(record.data);
  }
  if (Array.isArray(record.leads)) {
    return normalizeArray(record.leads);
  }
  return [];
}

function unwrapDataObject(record: JsonObject): JsonObject {
  return asRecord(record.data ?? record);
}

function asRecord(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function pickString(record: JsonObject, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function hasAtLeastOneNonEmptyValue(value: Record<string, unknown>): boolean {
  return Object.values(value).some((child) => typeof child === "string" && child.trim().length > 0);
}

function hasLeadMutationIdentifier(value: Record<string, unknown>): boolean {
  if (["leadId", "proEmail", "persoEmail", "linkedinUrl", "twitter"].some((key) => hasNonEmptyString(value[key]))) {
    return true;
  }

  return (
    hasNonEmptyString(value.firstname) &&
    hasNonEmptyString(value.lastname) &&
    (hasNonEmptyString(value.companyName) || hasNonEmptyString(value.companyUrl))
  );
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
