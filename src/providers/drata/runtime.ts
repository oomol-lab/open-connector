import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { booleanString, compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const drataRegionBaseUrls = {
  us: "https://public-api.drata.com/public/v2",
  eu: "https://public-api.eu.drata.com/public/v2",
  apac: "https://public-api.apac.drata.com/public/v2",
} as const;

export const drataDefaultRegion = "us" as const;

type DrataRegion = keyof typeof drataRegionBaseUrls;

export interface DrataActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DrataActionHandler = (input: Record<string, unknown>, context: DrataActionContext) => Promise<unknown>;

type DrataRequestOptions = {
  path: string;
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  query?: Record<string, string | string[] | undefined>;
  signal?: AbortSignal;
};

export const drataActionHandlers: ProviderActionHandlers<"drata", DrataActionHandler> = {
  get_company(_input, context) {
    return getCompany(context);
  },
  list_workspaces(input, context) {
    return listRecords("/workspaces", input, context, {});
  },
  list_personnel(input, context) {
    return listRecords("/personnel", input, context, {
      "employmentStatus[]": asOptionalStringArray(input.employmentStatus),
      "complianceStatus[]": asOptionalStringArray(input.complianceStatus),
    });
  },
  get_personnel(input, context) {
    return getRecord(
      `/personnel/${encodeURIComponent(requirePathIdentifier(input.personnelId, "personnelId"))}`,
      input,
      context,
      "personnel",
    );
  },
  list_controls(input, context) {
    const workspaceId = requireInteger(input.workspaceId, "workspaceId");
    return listRecords(`/workspaces/${workspaceId}/controls`, input, context, {
      isMonitored: booleanString(input.isMonitored),
      isReady: booleanString(input.isReady),
      hasEvidence: booleanString(input.hasEvidence),
      hasPolicy: booleanString(input.hasPolicy),
      hasPassingTest: booleanString(input.hasPassingTest),
      ticketStatus: asOptionalString(input.ticketStatus),
      policyId: asOptionalIntegerString(input.policyId),
      isEnabled: booleanString(input.isEnabled),
      isArchived: booleanString(input.isArchived),
    });
  },
  get_control(input, context) {
    const workspaceId = requireInteger(input.workspaceId, "workspaceId");
    const controlId = requirePathIdentifier(input.controlId, "controlId");
    return getRecord(
      `/workspaces/${workspaceId}/controls/${encodeURIComponent(controlId)}`,
      input,
      context,
      "control",
      {
        cursor: asOptionalString(input.cursor),
        size: asOptionalIntegerString(input.size),
        sort: asOptionalString(input.sort),
        sortDir: asOptionalString(input.sortDir),
      },
    );
  },
  list_vendors(input, context) {
    return listRecords("/vendors", input, context, {
      category: asOptionalString(input.category),
      impactLevel: asOptionalString(input.impactLevel),
      renewalDate: asOptionalString(input.renewalDate),
      renewalScheduleType: asOptionalString(input.renewalScheduleType),
      risk: asOptionalString(input.risk),
      status: asOptionalString(input.status),
      type: asOptionalString(input.type),
    });
  },
  get_vendor(input, context) {
    const vendorId = requireInteger(input.vendorId, "vendorId");
    return getRecord(`/vendors/${vendorId}`, input, context, "vendor");
  },
};

export async function validateDrataCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const region = normalizeDrataRegion(input.values.region);
  const baseUrl = drataRegionBaseUrls[region];
  const company = requireObject(
    await requestDrataJson({
      path: "/company",
      apiKey,
      baseUrl,
      fetcher,
      mode: "validate",
      signal,
    }),
    "Drata company response",
  );

  return {
    profile: {
      accountId: readNonEmptyString(company.accountId) ?? readNonEmptyString(company.domain) ?? `drata_${region}`,
      displayName: readNonEmptyString(company.name) ?? readNonEmptyString(company.domain) ?? "Drata API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      region,
      baseUrl,
      accountId: readNonEmptyString(company.accountId),
      domain: readNonEmptyString(company.domain),
      companyName: readNonEmptyString(company.name),
    }),
  };
}

function getCompany(context: DrataActionContext) {
  return requestDrataJson({
    path: "/company",
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    fetcher: context.fetcher,
    mode: "execute",
    signal: context.signal,
  }).then((payload) => {
    const company = requireObject(payload, "Drata company response");
    return {
      company,
      raw: company,
    };
  });
}

async function listRecords(
  path: string,
  input: Record<string, unknown>,
  context: DrataActionContext,
  extraQuery: Record<string, string | string[] | undefined>,
) {
  const payload = requireObject(
    await requestDrataJson({
      path,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      query: {
        ...commonListQuery(input),
        ...extraQuery,
      },
    }),
    "Drata list response",
  );

  return {
    data: readArray(payload.data, "data"),
    pagination: asObject(payload.pagination) ?? {},
    raw: payload,
  };
}

async function getRecord(
  path: string,
  input: Record<string, unknown>,
  context: DrataActionContext,
  outputKey: "personnel" | "control" | "vendor",
  query: Record<string, string | undefined> = {},
) {
  const record = requireObject(
    await requestDrataJson({
      path,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      query: {
        ...query,
        "expand[]": asOptionalStringArray(input.expand),
      },
    }),
    `Drata ${outputKey} response`,
  );

  return {
    [outputKey]: record,
    raw: record,
  };
}

async function requestDrataJson(options: DrataRequestOptions) {
  const url = new URL(`${options.baseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await options.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal: options.signal,
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw mapDrataError(response, payload, options.mode);
  }

  return payload;
}

function mapDrataError(response: Response, payload: unknown, mode: "validate" | "execute") {
  const message =
    readNonEmptyString(payload, "message") ??
    readNonEmptyString(payload, "error") ??
    `Drata API request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 409, message);
  }

  if (response.status === 400 || response.status === 404 || response.status === 412) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status, message);
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "Drata returned an invalid JSON response");
  }
}

function commonListQuery(input: Record<string, unknown>) {
  return compactObject({
    cursor: asOptionalString(input.cursor),
    size: asOptionalIntegerString(input.size),
    sort: asOptionalString(input.sort),
    sortDir: asOptionalString(input.sortDir),
    includeTotalCount: booleanString(input.includeTotalCount),
    "expand[]": asOptionalStringArray(input.expand),
  });
}

function normalizeDrataRegion(value: unknown): DrataRegion {
  if (typeof value !== "string" || value.trim() === "") {
    return drataDefaultRegion;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "us" || normalized === "eu" || normalized === "apac") {
    return normalized;
  }

  throw new ProviderRequestError(400, "drata region must be one of: us, eu, apac");
}

function requireObject(value: unknown, fieldName: string) {
  const object = asObject(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }

  return object;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Drata ${fieldName} must be an array`);
  }

  return value;
}

function requireInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }

  return String(value);
}

function requirePathIdentifier(value: unknown, fieldName: string) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  throw new ProviderRequestError(400, `${fieldName} must be an integer or non-empty string`);
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  return values.length > 0 ? values : undefined;
}

function asOptionalIntegerString(value: unknown) {
  return Number.isInteger(value) ? String(value) : undefined;
}

function readNonEmptyString(value: unknown, fieldName?: string) {
  const source = fieldName && asObject(value) ? asObject(value)?.[fieldName] : value;
  return typeof source === "string" && source.trim() !== "" ? source.trim() : undefined;
}
