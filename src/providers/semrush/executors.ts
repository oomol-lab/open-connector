import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalIntegerLike, optionalRawString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  mapProviderActionSources,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const semrushApiBaseUrl = "https://api.semrush.com";

const semrushDefaultRequestTimeoutMs = 30_000;
const semrushEmptyResultPrefix = "ERROR 50 :: NOTHING FOUND";

type SemrushPhase = "validate" | "execute";
type SemrushActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) => Promise<unknown>;

interface SemrushActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const semrushActionHandlers: ProviderActionHandlers<"semrush", SemrushActionHandler> = {
  async get_domain_overview(input, fetcher, apiKey) {
    return requestSemrushReport({
      apiKey,
      params: {
        type: "domain_ranks",
        domain: readRequiredString(input.domain, "domain"),
        database: readRequiredString(input.database, "database"),
        export_columns: "Dn,Rk,Or,Ot,Oc,Ad,At,Ac",
      },
      fetcher,
      phase: "execute",
    });
  },
  async list_domain_organic_keywords(input, fetcher, apiKey) {
    return requestSemrushReport({
      apiKey,
      params: compactObject({
        type: "domain_organic",
        domain: readRequiredString(input.domain, "domain"),
        database: readRequiredString(input.database, "database"),
        export_columns: "Ph,Po,Pp,Pd,Nq,Cp,Ur,Tr,Tc,Co,Nr,Td",
        display_limit: stringifyOptionalInteger(input.display_limit),
        display_offset: stringifyOptionalInteger(input.display_offset),
        display_date: readOptionalString(input.display_date),
      }),
      fetcher,
      phase: "execute",
    });
  },
  async list_organic_competitors(input, fetcher, apiKey) {
    return requestSemrushReport({
      apiKey,
      params: compactObject({
        type: "domain_organic_organic",
        domain: readRequiredString(input.domain, "domain"),
        database: readRequiredString(input.database, "database"),
        export_columns: "Dn,Cr,Np,Or,Ot,Oc,Ad,At,Ac",
        display_limit: stringifyOptionalInteger(input.display_limit),
        display_offset: stringifyOptionalInteger(input.display_offset),
        display_date: readOptionalString(input.display_date),
      }),
      fetcher,
      phase: "execute",
    });
  },
};

const semrushExecutorHandlers = mapProviderActionSources(
  "semrush",
  semrushActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: SemrushActionContext) =>
    handler(input, context.fetcher, context.apiKey),
);

export const executors: ProviderExecutors = defineProviderExecutors<SemrushActionContext>({
  service: "semrush",
  handlers: semrushExecutorHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SemrushActionContext> {
    const credential = await requireApiKeyCredential(context, "semrush");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const report = await requestSemrushReport({
      apiKey: input.apiKey,
      params: {
        type: "domain_ranks",
        domain: "semrush.com",
        database: "us",
        export_columns: "Dn,Rk",
      },
      fetcher,
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Semrush API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: semrushApiBaseUrl,
        validationReportType: "domain_ranks",
        validationRows: report.totalRows,
      },
    };
  },
};

async function requestSemrushReport(input: {
  apiKey: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: SemrushPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined, semrushDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildSemrushUrl(input.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "text/csv, text/plain, */*",
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const text = await response.text();

    if (!response.ok) {
      throw createSemrushError(response.status, text, input.phase);
    }

    return parseSemrushCsvReport(text);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Semrush request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Semrush request failed: ${error.message}` : "Semrush request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildSemrushUrl(apiKey: string, params: Record<string, string | undefined>) {
  const url = new URL("/", semrushApiBaseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function parseSemrushCsvReport(text: string) {
  const trimmedText = text.trim();
  if (trimmedText.startsWith(semrushEmptyResultPrefix)) {
    return {
      rows: [],
      totalRows: 0,
      rawHeader: [],
      rawText: text,
    };
  }

  if (trimmedText.startsWith("ERROR")) {
    throw new ProviderRequestError(502, trimmedText);
  }

  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const header =
    lines[0]
      ?.replaceAll("\r", "")
      .split(";")
      .map((column) => column.trim()) ?? [];
  if (header.length === 0) {
    throw new ProviderRequestError(502, "Semrush returned an empty report");
  }

  const rows = lines.slice(1).map((line) => {
    const values = line.replaceAll("\r", "").split(";");
    return Object.fromEntries(header.map((column, index) => [column, normalizeCsvValue(values[index] ?? "")]));
  });

  return {
    rows,
    totalRows: rows.length,
    rawHeader: header,
    rawText: text,
  };
}

function normalizeCsvValue(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) && isPlainNumericString(trimmed) ? numberValue : trimmed;
}

function isPlainNumericString(value: string) {
  if (value.length === 0) {
    return false;
  }

  const firstChar = value[0];
  const unsigned = firstChar === "-" ? value.slice(1) : value;
  if (unsigned.length === 0) {
    return false;
  }

  const parts = unsigned.split(".");
  if (parts.length > 2 || parts.some((part) => part.length === 0)) {
    return false;
  }

  return parts.every((part) => [...part].every((char) => char >= "0" && char <= "9"));
}

function createSemrushError(status: number, text: string, phase: SemrushPhase) {
  const message = text.trim() || `Semrush request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function readRequiredString(value: unknown, fieldName: string) {
  const stringValue = optionalRawString(value)?.trim();
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readOptionalString(value: unknown) {
  const stringValue = optionalRawString(value)?.trim();
  return stringValue || undefined;
}

function stringifyOptionalInteger(value: unknown) {
  const integer = optionalIntegerLike(value, "integer");
  return integer === undefined ? undefined : String(integer);
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
