import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const clinicalKeyApiBaseUrl = "https://api.elsevier.com/sushi/r51";
const clinicalKeyPlatformCode = "ck";

const clinicalKeyRequestTimeoutMs = 30_000;

type ClinicalKeyRequestPhase = "validate" | "execute";
type ClinicalKeyCredentials = {
  apiKey: string;
  requestorId: string;
  customerId: string;
};
interface ClinicalKeyActionContext {
  credentials: ClinicalKeyCredentials;
  fetcher: typeof fetch;
}
type ClinicalKeyActionHandler = (input: Record<string, unknown>, context: ClinicalKeyActionContext) => Promise<unknown>;

export const clinicalKeyActionHandlers: ProviderActionHandlers<"clinicalkey", ClinicalKeyActionHandler> = {
  async get_service_status(_input, context) {
    return {
      status: requireObjectPayload(
        await requestClinicalKeyJson({
          path: "/status",
          credentials: context.credentials,
          fetcher: context.fetcher,
          phase: "execute",
        }),
        "ClinicalKey COUNTER service status",
      ),
    };
  },
  async list_reports(_input, context) {
    return {
      reports: requireObjectArray(
        await requestClinicalKeyJson({
          path: "/reports",
          credentials: context.credentials,
          fetcher: context.fetcher,
          phase: "execute",
        }),
        "ClinicalKey COUNTER report list",
      ),
    };
  },
  async list_members(_input, context) {
    return {
      members: requireObjectArray(
        await requestClinicalKeyJson({
          path: "/members",
          credentials: context.credentials,
          fetcher: context.fetcher,
          phase: "execute",
        }),
        "ClinicalKey COUNTER member list",
      ),
    };
  },
  async get_usage_report(input, context) {
    const reportId = readRequiredString(input.reportId, "reportId");
    return {
      report: requireObjectPayload(
        await requestClinicalKeyJson({
          path: `/reports/${encodeURIComponent(reportId.toLowerCase())}`,
          query: buildUsageReportQuery(input),
          credentials: context.credentials,
          fetcher: context.fetcher,
          phase: "execute",
        }),
        "ClinicalKey COUNTER usage report",
      ),
    };
  },
} satisfies Record<string, ClinicalKeyActionHandler>;

export function createClinicalKeyActionContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
): ClinicalKeyActionContext {
  return { credentials: readValidationCredentials(values), fetcher };
}

export async function validateClinicalKeyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  const credentials = readValidationCredentials(input);
  const reports = requireObjectArray(
    await requestClinicalKeyJson({
      path: "/reports",
      credentials,
      fetcher,
      phase: "validate",
    }),
    "ClinicalKey COUNTER report list",
  );

  return {
    profile: { displayName: `ClinicalKey ${credentials.customerId}` },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: clinicalKeyApiBaseUrl,
      platform: clinicalKeyPlatformCode,
      validationEndpoint: "/reports",
      reportCount: reports.length,
    },
  };
}

function buildUsageReportQuery(input: Record<string, unknown>) {
  const beginDate = readRequiredString(input.beginDate, "beginDate");
  const endDate = readRequiredString(input.endDate, "endDate");
  if (beginDate > endDate) throw new ProviderRequestError(400, "beginDate must be on or before endDate");
  return {
    begin_date: beginDate,
    end_date: endDate,
    data_type: serializeFilterValues(input.dataTypes, "dataTypes"),
    access_type: serializeFilterValues(input.accessTypes, "accessTypes"),
    access_method: serializeFilterValues(input.accessMethods, "accessMethods"),
    metric_type: serializeFilterValues(input.metricTypes, "metricTypes"),
    yop: serializeFilterValues(input.yearsOfPublication, "yearsOfPublication"),
    database: readOptionalString(input.database),
    item_id: readOptionalString(input.itemId),
    attributes_to_show: serializeFilterValues(input.attributesToShow, "attributesToShow"),
    granularity: readOptionalString(input.granularity),
  };
}

async function requestClinicalKeyJson(input: {
  path: string;
  query?: Record<string, string | undefined>;
  credentials: ClinicalKeyCredentials;
  fetcher: typeof fetch;
  phase: ClinicalKeyRequestPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined, clinicalKeyRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildClinicalKeyUrl(input.path, input.query, input.credentials), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readClinicalKeyPayload(response);
    if (!response.ok) {
      throw createClinicalKeyError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ClinicalKey request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ClinicalKey request failed: ${error.message}` : "ClinicalKey request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildClinicalKeyUrl(
  path: string,
  query: Record<string, string | undefined> | undefined,
  credentials: ClinicalKeyCredentials,
) {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${clinicalKeyApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("requestor_id", credentials.requestorId);
  url.searchParams.set("customer_id", credentials.customerId);
  url.searchParams.set("api_key", credentials.apiKey);
  url.searchParams.set("platform", clinicalKeyPlatformCode);
  return url;
}

async function readClinicalKeyPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.trim();
  }
}

function createClinicalKeyError(status: number, payload: unknown, phase: ClinicalKeyRequestPhase) {
  const message = extractClinicalKeyErrorMessage(payload) ?? `ClinicalKey COUNTER request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(409, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(502, message, status);
  }

  return new ProviderRequestError(502, message);
}

function extractClinicalKeyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["Message", "message", "error", "detail", "statusText"]) {
    const message = optionalString(record[key])?.trim();
    if (message) {
      return message;
    }
  }

  for (const value of Object.values(record)) {
    const message = extractClinicalKeyErrorMessage(value);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function requireObjectPayload(payload: unknown, label: string) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
  return record;
}

function requireObjectArray(payload: unknown, label: string) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }

  return payload.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `${label} returned an invalid item`);
    }
    return record;
  });
}

function serializeFilterValues(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredString(item, fieldName)).join("|");
}

function readValidationCredentials(input: Record<string, string>): ClinicalKeyCredentials {
  return {
    apiKey: requiredString(input.apiKey, "apiKey", providerInputError),
    requestorId: readRequiredString(input.requestorId, "requestorId"),
    customerId: readRequiredString(input.customerId, "customerId"),
  };
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
