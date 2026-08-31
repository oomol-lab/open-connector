import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, rawStringOrNull } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const gainsightNxtMaxResponseBytes = 10 * 1024 * 1024;
const companyPath = "/v1/data/objects/Company";
const companyQueryPath = "/v1/data/objects/query/Company";

type GainsightNxtRequestPhase = "validate" | "execute";
type GainsightNxtActionContext = {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};
type GainsightNxtActionHandler = (
  input: Record<string, unknown>,
  context: GainsightNxtActionContext,
) => Promise<unknown>;

export const gainsightNxtActionHandlers: ProviderActionHandlers<"gainsight_nxt", GainsightNxtActionHandler> = {
  async insert_companies(input, context) {
    const payload = await requestGainsightJson({
      ...context,
      method: "POST",
      path: companyPath,
      body: compactObject({
        records: input.records,
        lookups: input.lookups,
      }),
      phase: "execute",
    });

    return normalizeCompanyMutationResponse(payload);
  },
  async update_companies(input, context) {
    const url = buildGainsightUrl(context.baseUrl, companyPath);
    url.searchParams.set("keys", trimStringArray(input.keys, "keys").join(","));

    const payload = await requestGainsightJson({
      ...context,
      method: "PUT",
      url,
      body: compactObject({
        records: input.records,
        lookups: input.lookups,
      }),
      phase: "execute",
    });

    return normalizeCompanyMutationResponse(payload);
  },
  async query_companies(input, context) {
    const payload = await requestGainsightJson({
      ...context,
      method: "POST",
      path: companyQueryPath,
      body: compactObject({
        select: trimStringArray(input.select, "select"),
        where: normalizeWhere(input.where),
        orderBy: input.orderBy,
        limit: input.limit,
        offset: input.offset,
      }),
      phase: "execute",
    });

    return normalizeCompanyQueryResponse(payload);
  },
  async delete_company(input, context) {
    const payload = await requestGainsightJson({
      ...context,
      method: "DELETE",
      path: `${companyPath}/${encodeURIComponent(requireNonEmptyString(input.gsid, "gsid"))}`,
      phase: "execute",
    });

    return normalizeCompanyDeleteResponse(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GainsightNxtActionContext>({
  service: "gainsight_nxt",
  handlers: gainsightNxtActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<GainsightNxtActionContext> {
    const credential = await requireApiKeyCredential(context, "gainsight_nxt");
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "gainsight_nxt",
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, "gainsight_nxt");
    return normalizeBaseUrl(credential.values.baseUrl);
  },
  auth: { type: "api_key_header", name: "Accesskey" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) {
      throw providerInputError("gainsight_nxt access key is required");
    }
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const hostname = new URL(baseUrl).hostname;
    return {
      profile: {
        accountId: hostname,
        displayName: `Gainsight NXT ${hostname}`,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        validationMode: "format_and_base_url_only",
      },
    };
  },
};

async function requestGainsightJson(input: {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  method: "DELETE" | "POST" | "PUT";
  phase: GainsightNxtRequestPhase;
  body?: Record<string, unknown>;
  path?: string;
  signal?: AbortSignal;
  url?: URL;
}) {
  const timeout = createProviderTimeout(input.signal);
  const url = input.url ?? buildGainsightUrl(input.baseUrl, input.path ?? "");

  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Accesskey: input.apiKey,
        "Content-Type": "application/json",
        "User-Agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readGainsightPayload(response);

    if (!response.ok) {
      throw createGainsightError(response.status, payload, input.phase);
    }

    const wrapper = requireGainsightWrapper(payload);
    if (wrapper.result === false) {
      throw createGainsightError(400, wrapper, input.phase);
    }

    return wrapper;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "gainsight_nxt request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `gainsight_nxt request failed: ${error.message}` : "gainsight_nxt request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildGainsightUrl(baseUrl: string, path: string) {
  const url = new URL(baseUrl);
  url.pathname = path.startsWith("/") ? path : `/${path}`;
  return url;
}

async function readGainsightPayload(response: Response) {
  const text = await readProviderTextBody(response, "Gainsight NXT response", gainsightNxtMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "gainsight_nxt returned invalid JSON");
  }
}

function createGainsightError(status: number, payload: unknown, phase: GainsightNxtRequestPhase) {
  const message = readGainsightErrorMessage(payload) ?? `gainsight_nxt request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status || 400, message);
  }

  return new ProviderRequestError(502, message);
}

function readGainsightErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    readOptionalTrimmedString(record.errorDesc) ??
    readOptionalTrimmedString(record.error) ??
    readOptionalTrimmedString(record.message) ??
    readOptionalTrimmedString(record.errorMessage)
  );
}

function normalizeCompanyMutationResponse(payload: Record<string, unknown>) {
  const data = optionalRecord(payload.data);
  return {
    result: payload.result === true,
    requestId: rawStringOrNull(payload.requestId),
    data: {
      count: readNullableInteger(data?.count),
      records: readRecordArray(data?.records),
      errors: data?.errors ?? null,
    },
    rawResponse: payload,
  };
}

function normalizeCompanyQueryResponse(payload: Record<string, unknown>) {
  return {
    result: payload.result === true,
    requestId: rawStringOrNull(payload.requestId),
    records: readRecordArray(payload.data),
    rawResponse: payload,
  };
}

function normalizeCompanyDeleteResponse(payload: Record<string, unknown>) {
  return {
    result: payload.result === true,
    requestId: rawStringOrNull(payload.requestId),
    data: rawStringOrNull(payload.data),
    rawResponse: payload,
  };
}

function requireGainsightWrapper(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "gainsight_nxt returned invalid response");
  }
  return record;
}

function readRecordArray(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "gainsight_nxt records must be an array");
  }

  return value.map((entry) => {
    const record = optionalRecord(entry);
    if (!record) {
      throw new ProviderRequestError(502, "gainsight_nxt record must be an object");
    }
    return record;
  });
}

function normalizeBaseUrl(value: unknown) {
  const raw = optionalString(value)?.trim() ?? "";
  if (!raw) {
    throw providerInputError("baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: providerInputError,
  });
  if (url.protocol !== "https:") {
    throw providerInputError("baseUrl must be a valid https URL");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname.replaceAll("/", "")) {
    throw providerInputError("baseUrl must be a clean Gainsight API domain URL");
  }

  return url.origin;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const parsed = readOptionalTrimmedString(value);
  if (!parsed) {
    throw providerInputError(`${fieldName} is required`);
  }
  return parsed;
}

function readOptionalTrimmedString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readNullableInteger(value: unknown) {
  return optionalInteger(value) ?? null;
}

function trimStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw providerInputError(`${fieldName} must be an array`);
  }
  return value.map((item) => requireNonEmptyString(item, fieldName));
}

function normalizeWhere(value: unknown): unknown {
  const where = optionalRecord(value);
  if (!where) {
    return value;
  }
  const conditions = Array.isArray(where.conditions)
    ? where.conditions.map((item) => {
        const condition = optionalRecord(item);
        if (!condition) {
          return item;
        }
        return {
          ...condition,
          name: requireNonEmptyString(condition.name, "where.conditions.name"),
          alias: requireNonEmptyString(condition.alias, "where.conditions.alias"),
          operator: requireNonEmptyString(condition.operator, "where.conditions.operator"),
        };
      })
    : where.conditions;
  return compactObject({
    ...where,
    conditions,
    expression:
      where.expression === undefined ? undefined : requireNonEmptyString(where.expression, "where.expression"),
  });
}
