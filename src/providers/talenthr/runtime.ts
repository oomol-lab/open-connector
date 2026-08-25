import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, setSearchParams } from "../provider-runtime.ts";

export const talenthrApiBaseUrl = "https://pubapi.talenthr.io/v1";
const validationEndpoint = "/directory";

type TalenthrActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const talenthrActionHandlers: ProviderActionHandlers<"talenthr", TalenthrActionHandler> = {
  async change_employee_role(input, context): Promise<unknown> {
    const employeeId = readPositiveInteger(input.employeeId, "employeeId");
    const role = readEmployeeRole(input.role);
    const payload = await requestTalenthrJson({
      context,
      path: `/employees/${employeeId}/${role === "employee" ? "make-employee" : "make-hr-manager"}`,
      method: "PUT",
      phase: "execute",
    });

    const body = requireObject(payload, "TalentHR returned an invalid object payload");
    const data = optionalRecord(body.data) ?? body;
    return {
      success: readBoolean(data.success, "success"),
      employeeId: readPositiveInteger(data.employee_id, "employee_id"),
      role,
      raw: body,
    };
  },
};

export async function validateTalenthrCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestTalenthrJson({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    path: validationEndpoint,
    query: queryParams({ limit: 1, offset: 0 }),
    phase: "validate",
  });

  return {
    profile: {
      accountId: "talenthr-api-key",
      displayName: "TalentHR API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: talenthrApiBaseUrl,
      validationEndpoint,
    },
  };
}

interface TalenthrRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "PUT";
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function requestTalenthrJson(input: TalenthrRequestInput): Promise<unknown> {
  const url = new URL(`${talenthrApiBaseUrl}${input.path}`);
  setSearchParams(url, input.query ?? {});
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.context.apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TalentHR request failed: ${error.message}` : "TalentHR request failed",
      error,
    );
  }
  const payload = await readPayload(response);
  if (!response.ok) {
    throw mapTalenthrError(response.status, payload, input.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapTalenthrError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `TalentHR API request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(phase === "validate" ? 502 : 404, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 409 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) return undefined;
  const error = body.error;
  if (typeof error === "string" && error) return error;
  const errorObject = optionalRecord(error);
  return optionalString(errorObject?.message) ?? optionalString(body.message);
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `TalentHR returned an invalid ${fieldName} payload`);
  }
  return value;
}

function readEmployeeRole(value: unknown): "employee" | "hr_manager" {
  if (value === "employee" || value === "hr_manager") return value;
  throw new ProviderRequestError(400, "role must be employee or hr_manager");
}
