import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, stringRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "harmonic_ai";
const harmonicAiApiBaseUrl = "https://api.harmonic.ai";

type HarmonicAiMethod = "GET" | "POST";
type HarmonicAiRequestPhase = "validate" | "execute";
type HarmonicAiQueryValue = string | number | readonly string[] | undefined;
type HarmonicAiActionContext = ApiKeyProviderContext;
type HarmonicAiActionHandler = (input: Record<string, unknown>, context: HarmonicAiActionContext) => Promise<unknown>;

interface HarmonicAiRequestOptions {
  method?: HarmonicAiMethod;
  path: string;
  query?: Record<string, HarmonicAiQueryValue>;
  phase?: HarmonicAiRequestPhase;
  withStatus?: boolean;
}

interface HarmonicAiStatusPayload {
  payload: unknown;
  status: number;
}

export const harmonicAiActionHandlers: ProviderActionHandlers<"harmonic_ai", HarmonicAiActionHandler> = {
  enrich_company(input, context) {
    return harmonicAiEnrich(input, context, "/companies");
  },
  enrich_person(input, context) {
    return harmonicAiEnrich(input, context, "/persons");
  },
  get_enrichment_status(input, context) {
    return harmonicAiGetEnrichmentStatus(input, context);
  },
  get_company(input, context) {
    return harmonicAiGetEntity(input, context, "/companies");
  },
  get_company_employees(input, context) {
    return harmonicAiGetCompanyEmployees(input, context);
  },
  get_person(input, context) {
    return harmonicAiGetEntity(input, context, "/persons");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, harmonicAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await harmonicAiRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/enrichment_status",
        query: { urns: "urn:harmonic:enrichment:00000000-0000-0000-0000-000000000000" },
        phase: "validate",
      },
    );

    return {
      profile: {
        displayName: "Harmonic.ai API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: harmonicAiApiBaseUrl,
        validationEndpoint: "/enrichment_status",
      },
    };
  },
};

async function harmonicAiEnrich(
  input: Record<string, unknown>,
  context: HarmonicAiActionContext,
  path: "/companies" | "/persons",
): Promise<unknown> {
  const response = (await harmonicAiRequest(context, {
    method: "POST",
    path,
    query: stringRecord(input),
    withStatus: true,
  })) as HarmonicAiStatusPayload;
  const record = optionalRecord(response.payload) ?? {};
  const raw = { ...record, status: response.status };

  return {
    status: response.status,
    ...(hasEntityShape(record) ? { entity: raw } : {}),
    ...(!hasEntityShape(record) ? { enrichment: pickEnrichmentPayload(raw) } : {}),
    raw,
  };
}

async function harmonicAiGetEnrichmentStatus(
  input: Record<string, unknown>,
  context: HarmonicAiActionContext,
): Promise<unknown> {
  const payload = await harmonicAiRequest(context, {
    path: "/enrichment_status",
    query: {
      ids: stringArrayQueryValue(input.ids),
      urns: stringArrayQueryValue(input.urns),
    },
  });

  return {
    statuses: Array.isArray(payload) ? payload : [],
  };
}

function harmonicAiGetEntity(
  input: Record<string, unknown>,
  context: HarmonicAiActionContext,
  basePath: "/companies" | "/persons",
): Promise<unknown> {
  return harmonicAiRequest(context, {
    path: `${basePath}/${encodeURIComponent(String(input.id_or_urn))}`,
    query: {
      include_fields: stringArrayQueryValue(input.include_fields),
    },
  });
}

function harmonicAiGetCompanyEmployees(
  input: Record<string, unknown>,
  context: HarmonicAiActionContext,
): Promise<unknown> {
  return harmonicAiRequest(context, {
    path: `/companies/${encodeURIComponent(String(input.id_or_urn))}/employees`,
    query: {
      employee_group_type: optionalString(input.employee_group_type),
      size: numberQueryValue(input.size),
      page: numberQueryValue(input.page),
      user_connection_status: optionalString(input.user_connection_status),
      employee_status: optionalString(input.employee_status),
    },
  });
}

async function harmonicAiRequest(
  context: Pick<HarmonicAiActionContext, "apiKey" | "fetcher" | "signal">,
  input: HarmonicAiRequestOptions,
): Promise<unknown> {
  const url = new URL(input.path, harmonicAiApiBaseUrl);
  appendQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: harmonicAiHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readHarmonicAiPayload(response);
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Harmonic.ai request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Harmonic.ai request failed: ${error.message}` : "Harmonic.ai request failed",
    );
  }

  if (response.ok || response.status === 201 || response.status === 404) {
    if (response.status === 404 && input.phase === "validate") {
      return payload;
    }
    if (response.status === 404 && input.path !== "/companies" && input.path !== "/persons") {
      throw createHarmonicAiError(response.status, payload, input.phase ?? "execute");
    }
    return input.withStatus ? { payload, status: response.status } : payload;
  }

  throw createHarmonicAiError(response.status, payload, input.phase ?? "execute");
}

function appendQuery(url: URL, query: Record<string, HarmonicAiQueryValue> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function harmonicAiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
  };
}

async function readHarmonicAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createHarmonicAiError(status: number, payload: unknown, phase: HarmonicAiRequestPhase): ProviderRequestError {
  const message = extractHarmonicAiErrorMessage(payload) ?? "Harmonic.ai request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(402, message, payload);
  }
  if (phase === "validate" && status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractHarmonicAiErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail", "note"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function hasEntityShape(record: Record<string, unknown>): boolean {
  return typeof record.entity_urn === "string" || typeof record.id === "number";
}

function pickEnrichmentPayload(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    message: typeof record.message === "string" ? record.message : "Harmonic enrichment triggered",
  };
}

function numberQueryValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArrayQueryValue(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function isAbortLikeError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    String((error as { name?: unknown }).name) === "AbortError"
  );
}
