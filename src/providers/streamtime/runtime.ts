import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalString, positiveInteger } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const streamtimeApiBaseUrl = "https://api.streamtime.net/v2";
const streamtimeValidationPath = "/organisation";

type StreamtimeMode = "validation" | "execution";
type StreamtimeMethod = "GET" | "POST" | "PUT";
type StreamtimeActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type StreamtimeActionHandler = (input: Record<string, unknown>, context: StreamtimeActionContext) => Promise<unknown>;

export const streamtimeActionHandlers: ProviderActionHandlers<"streamtime", StreamtimeActionHandler> = {
  get_organisation(_input, context) {
    return getWrappedObject("/organisation", "organisation", context);
  },
  list_branches(_input, context) {
    return getWrappedArray("/branches", "branches", "branches", context);
  },
  list_rate_cards(_input, context) {
    return getWrappedArray("/rate_cards", "rateCards", "rate cards", context);
  },
  list_users(_input, context) {
    return getWrappedArray("/users", "users", "users", context);
  },
  create_company(input, context) {
    return writeWrappedObject("POST", "/companies", buildCompanyBody(input), "company", context);
  },
  get_company(input, context) {
    return getWrappedObject(`/companies/${readPositiveInteger(input.companyId, "companyId")}`, "company", context);
  },
  update_company(input, context) {
    return writeWrappedObject(
      "PUT",
      `/companies/${readPositiveInteger(input.companyId, "companyId")}`,
      buildCompanyBody(input),
      "company",
      context,
    );
  },
  list_company_contacts(input, context) {
    return getWrappedArray(
      `/companies/${readPositiveInteger(input.companyId, "companyId")}/contacts`,
      "contacts",
      "contacts",
      context,
    );
  },
  create_company_contact(input, context) {
    return writeWrappedObject(
      "POST",
      `/companies/${readPositiveInteger(input.companyId, "companyId")}/contacts`,
      buildContactBody(input),
      "contact",
      context,
    );
  },
  get_contact(input, context) {
    return getWrappedObject(`/contacts/${readPositiveInteger(input.contactId, "contactId")}`, "contact", context);
  },
  update_contact(input, context) {
    return writeWrappedObject(
      "PUT",
      `/contacts/${readPositiveInteger(input.contactId, "contactId")}`,
      buildContactBody(input),
      "contact",
      context,
    );
  },
  create_job(input, context) {
    return writeWrappedObject("POST", "/jobs", buildJobBody(input), "job", context);
  },
  get_job(input, context) {
    return getWrappedObject(`/jobs/${readPositiveInteger(input.jobId, "jobId")}`, "job", context);
  },
  update_job(input, context) {
    return writeWrappedObject(
      "PUT",
      `/jobs/${readPositiveInteger(input.jobId, "jobId")}`,
      buildJobBody(input),
      "job",
      context,
    );
  },
};

export async function validateStreamtimeCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const organisation = readRequiredObject(
    await streamtimeRequest("GET", streamtimeValidationPath, undefined, { apiKey, fetcher, signal }, "validation"),
    "organisation",
  );
  const organisationDomain = optionalString(organisation.domain);
  const organisationName = optionalString(organisation.name);

  return {
    profile: {
      accountId: organisationDomain ?? "api_key",
      displayName: organisationName ?? "Streamtime API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: streamtimeApiBaseUrl,
      validationEndpoint: streamtimeValidationPath,
      organisationDomain,
      organisationName,
    }),
  };
}

async function getWrappedObject(
  path: string,
  outputKey: string,
  context: StreamtimeActionContext,
): Promise<Record<string, unknown>> {
  return {
    [outputKey]: readRequiredObject(await streamtimeRequest("GET", path, undefined, context, "execution"), outputKey),
  };
}

async function getWrappedArray(
  path: string,
  outputKey: string,
  fieldName: string,
  context: StreamtimeActionContext,
): Promise<Record<string, unknown>> {
  return {
    [outputKey]: readRequiredArray(await streamtimeRequest("GET", path, undefined, context, "execution"), fieldName),
  };
}

async function writeWrappedObject(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  outputKey: string,
  context: StreamtimeActionContext,
): Promise<Record<string, unknown>> {
  return {
    [outputKey]: readRequiredObject(await streamtimeRequest(method, path, body, context, "execution"), outputKey),
  };
}

async function streamtimeRequest(
  method: StreamtimeMethod,
  path: string,
  body: Record<string, unknown> | undefined,
  context: StreamtimeActionContext,
  mode: StreamtimeMode,
): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${streamtimeApiBaseUrl}/`);
  const timeout = createProviderTimeout(context.signal);

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Streamtime request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Streamtime request failed: ${error.message}` : "Streamtime request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readStreamtimePayload(response, !response.ok);
  if (!response.ok) {
    throw buildStreamtimeError(response.status, payload, mode);
  }

  return payload;
}

async function readStreamtimePayload(response: Response, allowNonJsonText: boolean): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (allowNonJsonText) {
      return text;
    }
    throw new ProviderRequestError(502, "Streamtime returned invalid JSON");
  }
}

function buildStreamtimeError(status: number, payload: unknown, mode: StreamtimeMode): ProviderRequestError {
  const message = extractStreamtimeErrorMessage(payload) ?? `Streamtime request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "execution" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractStreamtimeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.length > 0) return record.message;
  if (typeof record.error === "string" && record.error.length > 0) return record.error;
  if (Array.isArray(record.errors) && typeof record.errors[0] === "string") return record.errors[0];
  return undefined;
}

function buildCompanyBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    taxNumber: optionalString(input.taxNumber),
    phone1: optionalString(input.phone1),
    phone2: optionalString(input.phone2),
    websiteAddress: optionalString(input.websiteAddress),
  });
}

function buildContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    email: optionalString(input.email),
    phoneNumber: optionalString(input.phoneNumber),
    position: optionalString(input.position),
  });
}

function buildJobBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    companyId: readOptionalPositiveInteger(input.companyId, "companyId"),
    jobLeadUserId: readOptionalPositiveInteger(input.jobLeadUserId, "jobLeadUserId"),
    rateCardId: readOptionalPositiveInteger(input.rateCardId, "rateCardId"),
    branchId: readOptionalPositiveInteger(input.branchId, "branchId"),
    name: optionalString(input.name),
    number: optionalString(input.number),
    contactId: readOptionalPositiveInteger(input.contactId, "contactId"),
    purchaseOrderNumber: optionalString(input.purchaseOrderNumber),
  });
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Streamtime ${fieldName} response must be an object`, value);
  }
  return value as Record<string, unknown>;
}

function readRequiredArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Streamtime ${fieldName} response must be an array`, value);
  }
  return value as Array<Record<string, unknown>>;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  return value == null ? undefined : readPositiveInteger(value, fieldName);
}
