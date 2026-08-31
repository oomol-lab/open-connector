import { optionalRawString, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const openfdaApiBaseUrl = "https://api.fda.gov";

interface OpenfdaRequestInput {
  apiKey?: string;
  usesApiKey: boolean;
  dataset: string;
  params: Record<string, string | number | undefined>;
  fetcher: typeof fetch;
  phase: "execute" | "validate";
}

export async function validateOpenfdaCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  await requestOpenfdaJson({
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    usesApiKey: true,
    dataset: "label",
    params: { limit: 1 },
    fetcher,
    phase: "validate",
  });

  return {
    profile: { displayName: "openFDA API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: openfdaApiBaseUrl,
      validationEndpoint: "/drug/label.json",
    },
  };
}

export async function executeOpenfdaAction(
  actionName: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey?: string,
): Promise<unknown> {
  const dataset = String(input.dataset);

  if (actionName === "search_drug_records") {
    assertPagingWindow(input.skip, input.limit);
    const payload = await requestOpenfdaJson({
      apiKey,
      usesApiKey: apiKey != null,
      dataset,
      params: {
        search: optionalRawString(input.search),
        sort: optionalRawString(input.sort),
        limit: readOptionalNumber(input.limit),
        skip: readOptionalNumber(input.skip),
      },
      fetcher,
      phase: "execute",
    });
    return {
      meta: normalizeMeta(payload.meta),
      records: readObjectArray(payload.results, "results"),
    };
  }

  if (actionName === "count_drug_values") {
    const payload = await requestOpenfdaJson({
      apiKey,
      usesApiKey: apiKey != null,
      dataset,
      params: {
        count: String(input.field),
        search: optionalRawString(input.search),
        limit: readOptionalNumber(input.limit),
      },
      fetcher,
      phase: "execute",
    });
    return {
      meta: normalizeMeta(payload.meta),
      counts: readObjectArray(payload.results, "results").map((item) => ({
        term: requireString(item.term, "results[].term"),
        count: requireInteger(item.count, "results[].count"),
      })),
    };
  }

  throw new ProviderRequestError(500, `openfda action is not implemented yet: ${actionName}`);
}

async function requestOpenfdaJson(input: OpenfdaRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(`/drug/${input.dataset}.json`, openfdaApiBaseUrl);
  if (input.apiKey) {
    url.searchParams.set("api_key", input.apiKey);
  }
  for (const [name, value] of Object.entries(input.params)) {
    if (value != null) {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await input.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const message = readErrorMessage(payload) ?? `openFDA request failed with status ${response.status}`;
    if (input.phase === "validate" && (response.status === 401 || response.status === 403)) {
      throw new ProviderRequestError(400, message);
    }
    if ((response.status === 401 || response.status === 403) && input.usesApiKey) {
      throw new ProviderRequestError(401, message);
    }
    if (response.status === 429) {
      throw new ProviderRequestError(429, message);
    }
    if (response.status === 400 || response.status === 404) {
      throw new ProviderRequestError(400, message);
    }
    throw new ProviderRequestError(502, message, response.status);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "openFDA returned a non-object JSON response");
  }
  return record;
}

function assertPagingWindow(skipValue: unknown, limitValue: unknown): void {
  const skip = readOptionalNumber(skipValue) ?? 0;
  const limit = readOptionalNumber(limitValue) ?? 1;
  if (skip + limit > 26000) {
    throw new ProviderRequestError(
      400,
      "openFDA skip and limit must address at most the first 26,000 matching records",
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "openFDA returned invalid JSON");
  }
}

function normalizeMeta(value: unknown): Record<string, unknown> {
  const meta = optionalRecord(value) ?? {};
  const paging = optionalRecord(meta.results) ?? {};
  return {
    disclaimer: optionalString(meta.disclaimer) ?? null,
    terms: optionalString(meta.terms) ?? null,
    license: optionalString(meta.license) ?? null,
    lastUpdated: optionalString(meta.last_updated) ?? null,
    skip: readOptionalInteger(paging.skip),
    limit: readOptionalInteger(paging.limit),
    total: readOptionalInteger(paging.total),
    raw: meta,
  };
}

function readObjectArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `openFDA ${fieldName} must be an array`);
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `openFDA ${fieldName} must contain objects`);
    }
    return record;
  });
}

function readErrorMessage(value: unknown): string | undefined {
  const payload = optionalRecord(value);
  const error = optionalRecord(payload?.error);
  return optionalString(error?.message) ?? optionalString(payload?.message);
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readOptionalInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `openFDA ${fieldName} must be a string`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `openFDA ${fieldName} must be an integer`);
  }
  return value as number;
}
