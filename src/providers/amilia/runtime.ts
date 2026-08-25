import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const amiliaApiOrigin = "https://app.amilia.com";

const amiliaJwtHelpUrl = "https://app.amilia.com/apidocs/Index.html#authentication";
const amiliaRequestTimeoutMs = 30_000;

type AmiliaRequestPhase = "validate" | "execute";
type AmiliaQueryValue = string | number | boolean | undefined;

interface AmiliaPaging {
  totalCount: number | null;
  next: string | null;
}

interface AmiliaListResult {
  items: Record<string, unknown>[];
  paging: AmiliaPaging;
}

export interface AmiliaContext {
  apiKey: string;
  organization: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const amiliaActionHandlers: ProviderActionHandlers<"amilia", ProviderRuntimeHandler<AmiliaContext>> = {
  async list_programs(input, context) {
    const payload = await requestAmiliaJson({
      context,
      path: "/programs",
      query: {
        showHidden: optionalBoolean(input.showHidden),
        showArchived: optionalBoolean(input.showArchived),
        page: readOptionalPositiveInteger(input.page, "page"),
        perPage: readOptionalPositiveInteger(input.perPage, "perPage"),
      },
      phase: "execute",
    });
    const result = normalizeAmiliaList(payload, "program");
    return {
      programs: result.items,
      paging: result.paging,
    };
  },
  async get_program(input, context) {
    const programId = positiveInteger(input.programId, "programId", inputError);
    const payload = await requestAmiliaJson({
      context,
      path: `/programs/${programId}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      program: requiredRecord(payload, "program", responseError),
    };
  },
  async list_program_activities(input, context) {
    const programId = positiveInteger(input.programId, "programId", inputError);
    const payload = await requestAmiliaJson({
      context,
      path: `/programs/${programId}/activities`,
      query: {
        showHidden: optionalBoolean(input.showHidden),
        showCancelled: optionalBoolean(input.showCancelled),
        showOccurrences: optionalBoolean(input.showOccurrences),
        showTaxes: optionalBoolean(input.showTaxes),
        page: readOptionalPositiveInteger(input.page, "page"),
        perPage: readOptionalPositiveInteger(input.perPage, "perPage"),
      },
      phase: "execute",
    });
    const result = normalizeAmiliaList(payload, "activity");
    return {
      activities: result.items,
      paging: result.paging,
    };
  },
  async get_activity(input, context) {
    const activityId = positiveInteger(input.activityId, "activityId", inputError);
    const payload = await requestAmiliaJson({
      context,
      path: `/activities/${activityId}`,
      query: {
        showTaxes: optionalBoolean(input.showTaxes),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      activity: requiredRecord(payload, "activity", responseError),
    };
  },
};

export function normalizeAmiliaOrganization(value: unknown): string {
  const organization = requiredString(value, "organization", inputError);
  if (organization.length > 200) {
    throw new ProviderRequestError(400, "organization must be 200 characters or fewer");
  }
  return organization;
}

export function buildAmiliaApiBaseUrl(organization: string): string {
  return `${amiliaApiOrigin}/api/v3/en/org/${encodeURIComponent(organization)}`;
}

export async function validateAmiliaCredential(
  input: { apiKey: string; organization: unknown },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const organization = normalizeAmiliaOrganization(input.organization);
  const context: AmiliaContext = {
    apiKey: input.apiKey,
    organization,
    fetcher,
    signal,
  };
  await requestAmiliaJson({
    context,
    path: "/programs",
    query: {
      page: 1,
      perPage: 1,
    },
    phase: "validate",
  });

  return {
    profile: {
      accountId: `amilia:${organization}`,
      displayName: `Amilia: ${organization}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      organization,
      apiBaseUrl: buildAmiliaApiBaseUrl(organization),
      validationEndpoint: "/programs?page=1&perPage=1",
      credentialHelpUrl: amiliaJwtHelpUrl,
    },
  };
}

async function requestAmiliaJson(input: {
  context: AmiliaContext;
  path: string;
  phase: AmiliaRequestPhase;
  query?: Record<string, AmiliaQueryValue>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(`${buildAmiliaApiBaseUrl(input.context.organization)}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, amiliaRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Amilia returned invalid JSON",
      invalidJsonFallback: (text) => text,
    });
    if (!response.ok) {
      throw toAmiliaError(response, payload, input.phase, input.notFoundAsInvalidInput);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Amilia request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Amilia request failed: ${error.message}` : "Amilia request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function toAmiliaError(
  response: Response,
  payload: unknown,
  phase: AmiliaRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message =
    extractAmiliaErrorMessage(payload) ||
    response.statusText.trim() ||
    `Amilia API request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 400 ? response.status : 502, message);
}

function extractAmiliaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  for (const key of ["Message", "message", "Error", "error", "detail", "title"]) {
    const value = optionalString(object?.[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeAmiliaList(payload: unknown, resourceName: string): AmiliaListResult {
  if (Array.isArray(payload)) {
    return {
      items: payload.map((item) => requiredRecord(item, resourceName, responseError)),
      paging: {
        totalCount: null,
        next: null,
      },
    };
  }

  const object = optionalRecord(payload);
  const items = object?.Items ?? object?.items;
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, `Amilia returned an invalid ${resourceName} list response`);
  }
  const paging = optionalRecord(object?.Paging ?? object?.paging);
  return {
    items: items.map((item) => requiredRecord(item, resourceName, responseError)),
    paging: {
      totalCount: readNonNegativeInteger(paging?.TotalCount ?? paging?.totalCount),
      next: optionalString(paging?.Next ?? paging?.next) ?? null,
    },
  };
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, fieldName, inputError);
}

function readNonNegativeInteger(value: unknown): number | null {
  const result = optionalInteger(value);
  return result !== undefined && result >= 0 ? result : null;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Amilia returned an invalid response: ${message}`);
}
